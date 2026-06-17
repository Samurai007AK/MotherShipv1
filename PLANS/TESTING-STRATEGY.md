# Mothership — Testing Strategy

**Last Updated:** 2026-06-15
**Status:** Final Draft
**Scope:** Cross-cutting concern applicable to all phases

---

## Overview

Testing is not a Phase 4 activity — it's a continuous practice from Day 1. This document defines what to test, when to test, and how to test at every layer of Mothership.

**Testing Philosophy:**
1. **Test early, test often** — Write tests alongside code, not after
2. **Test the critical path first** — Handoff, memory, terminal are highest priority
3. **Fail fast** — Tests run on every save (dev) and every commit (CI)
4. **Realistic coverage** — 80%+ on critical paths, 60%+ elsewhere

**Related Documents:**
- [`PHASE-TRANSITIONS.md`](./PHASE-TRANSITIONS.md) — Gate validation criteria and test requirements
- [`ERROR-HANDLING.md`](./ERROR-HANDLING.md) — Error handling test scenarios
- [`SECURITY.md`](./SECURITY.md) — Security testing checklist
- [`CONFIGURATION.md`](./CONFIGURATION.md) — Configuration test patterns
- [`ACCESSIBILITY.md`](./ACCESSIBILITY.md) — Accessibility test scenarios (WCAG 2.1 AA)

---

## Testing Pyramid

```
                    ┌─────────────┐
                    │     E2E     │  ← Few (5-10 critical flows)
                    │  Playwright │
                    ├─────────────┤
                  │   Integration  │  ← Some (sidecar ↔ Rust ↔ React)
                  │  Vitest + Pytest│
                  ├─────────────┤
                │     Unit Tests    │  ← Many (individual functions)
                │  Vitest + cargo   │
                └───────────────────┘
```

---

## Layer-by-Layer Testing

### 1. Rust Backend (src-tauri/)

**Framework:** `cargo test` (built-in)

**What to test:**
| Component | Priority | Test Type |
|---|---|---|
| SQLite commands | **Critical** | Unit + Integration |
| Terminal PTY management | **Critical** | Unit |
| IPC command handlers | **High** | Unit |
| File system operations | **High** | Unit |
| Process spawning | **Medium** | Integration |
| Secret store | **Medium** | Unit |

**Example tests:**

```rust
// src-tauri/src/memory/tests.rs
#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: create in-memory test database
    fn test_db() -> MemoryDb {
        MemoryDb::new(":memory:").unwrap()
    }

    #[test]
    fn test_write_and_read_note() {
        let db = test_db();

        // Create a project first
        db.create_project("proj-1", "Test Project", "/tmp/test").unwrap();

        // Write a note
        db.write_note("proj-1", "Hello world", "test,greeting").unwrap();

        // Read it back
        let notes = db.get_notes("proj-1", None, None).unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].content, "Hello world");
        assert_eq!(notes[0].tags, "test,greeting");
    }

    #[test]
    fn test_handoff_recording() {
        let db = test_db();
        db.create_project("proj-1", "Test", "/tmp").unwrap();

        db.record_handoff(
            "proj-1",
            "claude",
            "codex",
            "Switching to code review",
            "Working on auth module",
        ).unwrap();

        let handoffs = db.get_handoffs("proj-1").unwrap();
        assert_eq!(handoffs.len(), 1);
        assert_eq!(handoffs[0].from_agent_id, "claude");
        assert_eq!(handoffs[0].to_agent_id, "codex");
    }

    #[test]
    fn test_search_memory_fts5() {
        let db = test_db();
        db.create_project("proj-1", "Test", "/tmp").unwrap();

        db.write_note("proj-1", "Implementing user authentication", "").unwrap();
        db.write_note("proj-1", "Adding database migrations", "").unwrap();
        db.write_note("proj-1", "Writing authentication tests", "").unwrap();

        let results = db.search_memory("proj-1", "authentication").unwrap();
        assert_eq!(results.len(), 2); // Two notes mention "authentication"
    }

    #[test]
    fn test_snapshot_compression() {
        let db = test_db();
        db.create_project("proj-1", "Test", "/tmp").unwrap();

        // Write 100 rapid snapshots (within 5 seconds each)
        for i in 0..100 {
            db.save_snapshot(
                "session-1",
                &format!("Snapshot {}", i),
            ).unwrap();
        }

        // Verify deduplication: rapid snapshots should be merged
        let snapshots = db.get_snapshots("session-1").unwrap();
        assert!(snapshots.len() < 100, "Snapshots should be deduplicated");
    }

    #[test]
    fn test_concurrent_writes() {
        let db = test_db();
        db.create_project("proj-1", "Test", "/tmp").unwrap();

        // Simulate concurrent writes from multiple threads
        let handles: Vec<_> = (0..10)
            .map(|i| {
                let db = db.clone(); // Requires DbClone trait
                std::thread::spawn(move || {
                    db.write_note("proj-1", &format!("Note {}", i), "").unwrap();
                })
            })
            .collect();

        for h in handles {
            h.join().unwrap();
        }

        let notes = db.get_notes("proj-1", None, None).unwrap();
        assert_eq!(notes.len(), 10);
    }

    #[test]
    fn test_database_integrity_check() {
        let db = test_db();
        let health = db.verify_integrity().unwrap();
        assert!(matches!(health, DbHealth::Ok { .. }));
    }

    #[test]
    fn test_path_traversal_prevention() {
        let guard = FileSystemGuard::new(PathBuf::from("/project"));

        // Should allow
        assert!(guard.can_access(Path::new("/project/src/main.rs")));

        // Should block
        assert!(!guard.can_access(Path::new("/project/../../etc/passwd")));
        assert!(!guard.can_access(Path::new("/etc/passwd")));
    }
}
```

**Terminal PTY tests:**
```rust
// src-tauri/src/terminal/tests.rs
#[test]
fn test_spawn_terminal_session() {
    let manager = TerminalManager::new();

    let session = manager.spawn("claude", "/tmp").unwrap();
    assert_eq!(session.agent_id, "claude");
    assert!(session.status == TerminalStatus::Running);

    // Write input
    session.write_input("echo hello\n").unwrap();

    // Read output (with timeout)
    let output = session.read_output(Duration::from_secs(5)).unwrap();
    assert!(output.contains("hello"));

    // Cleanup
    manager.kill_session(&session.id).unwrap();
}

#[test]
fn test_session_persistence() {
    let manager = TerminalManager::new();
    let session = manager.spawn("codex", "/tmp").unwrap();

    // Write some output
    session.write_input("echo test123\n").unwrap();
    let _ = session.read_output(Duration::from_secs(2));

    // Snapshot session state
    let snapshot = manager.snapshot_session(&session.id).unwrap();
    assert!(!snapshot.scrollback.is_empty());

    // Kill session
    manager.kill_session(&session.id).unwrap();

    // Restore from snapshot
    let restored = manager.restore_session(&snapshot).unwrap();
    assert_eq!(restored.agent_id, "codex");
}
```

---

### 2. React Frontend (src/)

**Framework:** Vitest + React Testing Library

**Setup:**
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
```

**What to test:**
| Component | Priority | Test Type |
|---|---|---|
| Zustand stores | **Critical** | Unit |
| Agent sidebar | **Critical** | Unit + Integration |
| Memory panel | **High** | Unit |
| Terminal pane | **High** | Unit |
| Handoff flow | **Critical** | Integration |
| Quick switcher | **Medium** | Unit |
| Theme system | **Low** | Unit |

**Example tests:**

```typescript
// src/stores/__tests__/agentStore.test.ts
import { renderHook, act } from '@testing-library/react';
import { useAgentStore } from '../agentStore';

describe('AgentStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useAgentStore.setState({
      agents: AGENT_MANIFEST,
      activeAgentId: null,
    });
  });

  it('should initialize with 10 agents', () => {
    const { agents } = useAgentStore.getState();
    expect(agents).toHaveLength(10);
  });

  it('should set active agent', () => {
    act(() => {
      useAgentStore.getState().setActiveAgent('claude');
    });

    const { activeAgentId } = useAgentStore.getState();
    expect(activeAgentId).toBe('claude');
  });

  it('should update agent status', () => {
    act(() => {
      useAgentStore.getState().updateAgentStatus('claude', 'busy');
    });

    const agent = useAgentStore.getState().agents.find(a => a.id === 'claude');
    expect(agent?.status).toBe('busy');
  });

  it('should register new agent', () => {
    const newAgent = {
      id: 'custom',
      name: 'Custom Agent',
      type: 'api' as const,
      status: 'online' as const,
    };

    act(() => {
      useAgentStore.getState().registerAgent(newAgent);
    });

    expect(useAgentStore.getState().agents).toHaveLength(11);
  });
});

// src/stores/__tests__/memoryStore.test.ts
describe('MemoryStore', () => {
  it('should add note', async () => {
    const { addNote } = useMemoryStore.getState();

    await act(async () => {
      await addNote({
        content: 'Test note',
        tags: 'test',
        projectId: 'proj-1',
      });
    });

    const notes = useMemoryStore.getState().notes;
    expect(notes).toHaveLength(1);
    expect(notes[0].content).toBe('Test note');
  });

  it('should search notes', async () => {
    // Add multiple notes
    const { addNote } = useMemoryStore.getState();
    await addNote({ content: 'Auth implementation', tags: '', projectId: 'proj-1' });
    await addNote({ content: 'Database migration', tags: '', projectId: 'proj-1' });
    await addNote({ content: 'Auth tests', tags: '', projectId: 'proj-1' });

    const results = useMemoryStore.getState().searchNotes('auth');
    expect(results).toHaveLength(2);
  });
});
```

```typescript
// src/components/__tests__/AgentSidebar.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentSidebar } from '../agents/AgentSidebar';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('AgentSidebar', () => {
  it('renders all 10 agents', () => {
    render(<AgentSidebar />);

    expect(screen.getByText('Claude')).toBeInTheDocument();
    expect(screen.getByText('Codex')).toBeInTheDocument();
    expect(screen.getByText('Gemini')).toBeInTheDocument();
    expect(screen.getByText('OpenCode')).toBeInTheDocument();
    expect(screen.getByText('ChatGPT')).toBeInTheDocument();
    expect(screen.getByText('DeepSeek')).toBeInTheDocument();
    expect(screen.getByText('Mistral')).toBeInTheDocument();
    expect(screen.getByText('Kimi')).toBeInTheDocument();
    expect(screen.getByText('Qwen')).toBeInTheDocument();
    expect(screen.getByText('Ollama')).toBeInTheDocument();
  });

  it('shows status indicators', () => {
    render(<AgentSidebar />);

    const statusDots = screen.getAllByTestId('status-dot');
    expect(statusDots).toHaveLength(10);
  });

  it('clicking agent sets it active', () => {
    render(<AgentSidebar />);

    fireEvent.click(screen.getByText('Claude'));

    expect(screen.getByTestId('active-agent')).toHaveTextContent('Claude');
  });

  it('shows context menu on right-click', async () => {
    render(<AgentSidebar />);

    fireEvent.contextMenu(screen.getByText('Claude'));

    expect(screen.getByText('Open Terminal')).toBeInTheDocument();
    expect(screen.getByText('Handoff to...')).toBeInTheDocument();
    expect(screen.getByText('View Memory')).toBeInTheDocument();
  });
});
```

```typescript
// src/components/__tests__/MemoryPanel.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryPanel } from '../memory/MemoryPanel';

describe('MemoryPanel', () => {
  it('renders search bar', () => {
    render(<MemoryPanel />);
    expect(screen.getByPlaceholderText('Search all memory...')).toBeInTheDocument();
  });

  it('renders note editor', () => {
    render(<MemoryPanel />);
    expect(screen.getByText('Write a note...')).toBeInTheDocument();
  });

  it('shows empty state when no notes', () => {
    render(<MemoryPanel />);
    expect(screen.getByText('No memory entries yet')).toBeInTheDocument();
  });

  it('debounces search input', async () => {
    vi.useFakeTimers();
    render(<MemoryPanel />);

    const input = screen.getByPlaceholderText('Search all memory...');
    fireEvent.change(input, { target: { value: 'auth' } });

    // Should not search immediately
    expect(screen.queryByTestId('search-results')).not.toBeInTheDocument();

    // Wait for debounce
    vi.advanceTimersByTime(300);

    await waitFor(() => {
      expect(screen.getByTestId('search-results')).toBeInTheDocument();
    });

    vi.useRealTimers();
  });
});
```

---

### 3. Python Sidecars

**Framework:** Pytest

**Setup:**
```python
# sidecars/crewai-bridge/pytest.ini
[pytest]
testpaths = tests
asyncio_mode = auto
markers =
    unit: Unit tests (no external dependencies)
    integration: Integration tests (requires Ollama or mock)
    slow: Tests that take > 1 second
```

**Example tests:**

```python
# sidecars/crewai-bridge/tests/test_handoff_flow.py
import pytest
from unittest.mock import Mock, patch, AsyncMock
from flow.handoff_flow import SessionFlow, HandoffState


class TestHandoffFlow:
    """Test CrewAI handoff flow logic."""

    def test_initial_state(self):
        state = HandoffState(
            from_agent="claude",
            to_agent="codex",
            context="Working on auth",
            summary=""
        )
        assert state.from_agent == "claude"
        assert state.to_agent == "codex"
        assert state.summary == ""

    @patch('flow.handoff_flow.ollama_client')
    def test_summary_generation(self, mock_ollama):
        mock_ollama.generate.return_value = {
            'response': 'Claude was implementing user authentication. '
                       'Switching to Codex for code review.'
        }

        state = HandoffState(
            from_agent="claude",
            to_agent="codex",
            context="Implementing auth module, added 3 files, ran tests",
            summary=""
        )

        flow = SessionFlow(state)
        result = flow.kickoff()

        assert result["logged"] is True
        assert "Claude" in state.summary

    def test_empty_context_handoff(self):
        state = HandoffState(
            from_agent="claude",
            to_agent="codex",
            context="",
            summary=""
        )

        flow = SessionFlow(state)
        result = flow.kickoff()

        # Should still produce a summary (even if minimal)
        assert result["logged"] is True
```

```python
# sidecars/summary-engine/tests/test_summarizer.py
import pytest
from unittest.mock import Mock, patch
from summarizer.engine import SummaryEngine, SummaryRequest


class TestSummaryEngine:
    @pytest.mark.unit
    def test_template_summary_fallback(self):
        """When LLM is unavailable, template should be used."""
        engine = SummaryEngine(use_llm=False)

        request = SummaryRequest(
            context_snapshots=[
                {
                    "agent_id": "claude",
                    "prompt": "Add auth module",
                    "open_files": ["src/auth.py", "src/models.py"],
                    "branch": "feature/auth",
                    "trigger": "agent_switch",
                }
            ],
            handoff_target="codex",
            style="brief"
        )

        result = engine.summarize(request)

        assert "auth" in result.summary.lower()
        assert "src/auth.py" in result.summary
        assert result.key_decisions == []  # Can't extract without LLM

    @pytest.mark.integration
    @patch('summarizer.engine.ollama')
    def test_llm_summary(self, mock_ollama):
        mock_ollama.generate.return_value = {
            'response': 'Claude added authentication with JWT tokens.'
        }

        engine = SummaryEngine(use_llm=True, model="llama3.2:3b")

        request = SummaryRequest(
            context_snapshots=[...],
            handoff_target="codex",
            style="brief"
        )

        result = engine.summarize(request)
        assert len(result.summary) > 0
        assert result.key_decisions is not None

    @pytest.mark.slow
    def test_summary_performance(self):
        """Summary generation should complete within 5 seconds."""
        import time

        engine = SummaryEngine(use_llm=True, model="llama3.2:3b")
        request = SummaryRequest(
            context_snapshots=[large_snapshot() for _ in range(10)],
            handoff_target="codex",
            style="detailed"
        )

        start = time.time()
        result = engine.summarize(request)
        elapsed = time.time() - start

        assert elapsed < 5.0, f"Summary took {elapsed:.1f}s, expected < 5s"
```

---

### 4. Integration Tests

**Framework:** Vitest (frontend) + cargo test (Rust) + Pytest (Python)

**What to test:**
| Integration Point | Test Approach |
|---|---|
| Frontend ↔ Tauri IPC | Mock `invoke()` calls |
| Rust ↔ SQLite | In-memory database tests |
| Rust ↔ PTY | Real PTY spawn (CI-safe) |
| Python sidecar ↔ Rust | HTTP mock servers |
| Frontend ↔ xterm.js | Mock WebSocket |

**Example integration test:**

```typescript
// src/integration/__tests__/handoff-flow.test.ts
import { renderHook, act, waitFor } from '@testing-library/react';
import { useHandoff } from '../../hooks/useHandoff';
import { useAgentStore } from '../../stores/agentStore';
import { mockInvoke } from '../mocks/tauri';

describe('Handoff Integration Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAgentStore.setState({
      activeAgentId: 'claude',
      agents: AGENT_MANIFEST,
    });
  });

  it('completes full handoff flow', async () => {
    // Mock all Tauri invocations
    mockInvoke('capture_current_context', {
      prompt: 'Add user authentication',
      outputTail: 'Tests passing...',
      branch: 'feature/auth',
      openFiles: ['src/auth.py'],
    });

    mockInvoke('record_handoff', { success: true });
    mockInvoke('save_snapshot', { success: true });

    const { result } = renderHook(() => useHandoff());

    // Initiate handoff
    await act(async () => {
      await result.current.initiateHandoff('codex');
    });

    // Verify state changes
    expect(useAgentStore.getState().activeAgentId).toBe('codex');
    expect(result.current.handoffSummary).toContain('auth');
    expect(mockInvoke).toHaveBeenCalledWith('record_handoff', expect.objectContaining({
      from: 'claude',
      to: 'codex',
    }));
  });

  it('handles sidecar failure gracefully', async () => {
    mockInvoke('record_handoff', {
      throws: new Error('CrewAI sidecar not responding'),
    });

    const { result } = renderHook(() => useHandoff());

    await act(async () => {
      await result.current.initiateHandoff('codex');
    });

    // Should fallback to template summary
    expect(result.current.error).toBeNull(); // Error is handled, not exposed
    expect(result.current.fallbackUsed).toBe(true);
  });
});
```

---

### 5. End-to-End Tests (Phase 4)

**Framework:** Playwright

```typescript
// tests/e2e/handoff.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Mothership E2E', () => {
  test('full handoff flow', async ({ page }) => {
    // 1. Launch app
    await page.goto('localhost:1420');

    // 2. Wait for agent sidebar
    await expect(page.getByText('Claude')).toBeVisible();
    await expect(page.getByText('Codex')).toBeVisible();

    // 3. Click on Claude
    await page.getByText('Claude').click();

    // 4. Verify terminal opens
    await expect(page.locator('[data-testid="terminal-pane"]')).toBeVisible();

    // 5. Type in terminal
    await page.locator('[data-testid="terminal-input"]').fill('echo hello');
    await page.locator('[data-testid="terminal-input"]').press('Enter');

    // 6. Click handoff button
    await page.getByText('Handoff to...').click();
    await page.getByText('Codex').click();

    // 7. Verify handoff completes
    await expect(page.getByText('Handoff complete')).toBeVisible();
    await expect(page.locator('[data-testid="active-agent"]')).toHaveTextContent('Codex');

    // 8. Verify memory entry was created
    await page.getByRole('tab', { name: 'Memory' }).click();
    await expect(page.getByText('Handoff: Claude → Codex')).toBeVisible();
  });

  test('terminal session persistence', async ({ page }) => {
    await page.goto('localhost:1420');

    // Open Claude terminal
    await page.getByText('Claude').click();
    await expect(page.locator('[data-testid="terminal-pane"]')).toBeVisible();

    // Type something
    await page.locator('[data-testid="terminal-input"]').fill('echo test123');
    await page.locator('[data-testid="terminal-input"]').press('Enter');

    // Switch to Codex
    await page.getByText('Codex').click();

    // Switch back to Claude
    await page.getByText('Claude').click();

    // Verify terminal state is preserved
    await expect(page.locator('[data-testid="terminal-pane"]')).toContainText('test123');
  });

  test('memory search works', async ({ page }) => {
    await page.goto('localhost:1420');

    // Go to memory panel
    await page.getByRole('tab', { name: 'Memory' }).click();

    // Write a note
    await page.locator('[data-testid="note-editor"]').fill('Authentication module');
    await page.getByText('Save Note').click();

    // Search for it
    await page.getByPlaceholder('Search all memory...').fill('authentication');

    // Verify search results
    await expect(page.getByText('Authentication module')).toBeVisible();
  });
});
```

---

## Test Execution Schedule

### Development (Every Save)
```
vitest --watch          ← Frontend unit tests (fast, <2s)
cargo test --watch      ← Rust unit tests (fast, <5s)
```

### Pre-Commit (Every Commit)
```
cargo fmt --check       ← Rust formatting
cargo clippy            ← Rust lints
cargo test              ← Rust unit tests
npm run lint            ← ESLint
npm run test:run        ← Vitest (no watch)
```

### CI Pipeline (Every Push)
```
# Parallel jobs
Job 1: cargo fmt --check && cargo clippy && cargo test
Job 2: npm run lint && npm run test:run && npm run build
Job 3: pytest sidecars/*/tests/
Job 4: playwright test (if changed files touch UI)
```

### Nightly
```
# Full suite including slow tests
cargo test -- --include-ignored
pytest -m "not slow"
npm run test:e2e
```

---

## Test Utilities

### Mock Factories

```typescript
// src/test/factories.ts
export function createMockAgent(overrides?: Partial<Agent>): Agent {
  return {
    id: 'claude',
    name: 'Claude',
    type: 'local-cli',
    status: 'idle',
    icon: '🤖',
    provider: 'anthropic',
    terminalSessionId: null,
    lastActive: null,
    ...overrides,
  };
}

export function createMockMemoryEntry(overrides?: Partial<MemoryEntry>): MemoryEntry {
  return {
    id: crypto.randomUUID(),
    projectId: 'proj-1',
    agentId: 'claude',
    type: 'note',
    content: 'Test note content',
    summary: null,
    tags: 'test',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockContextSnapshot(overrides?: Partial<ContextSnapshot>): ContextSnapshot {
  return {
    timestamp: new Date().toISOString(),
    trigger: 'heartbeat',
    agentId: 'claude',
    projectId: 'proj-1',
    prompt: 'Test prompt',
    outputTail: 'Test output',
    branch: 'main',
    openFiles: ['src/main.rs'],
    decisions: [],
    todos: [],
    memorySize: 1024,
    ...overrides,
  };
}
```

### Test Helpers

```typescript
// src/test/helpers.ts
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function renderWithProviders(
  ui: React.ReactElement,
  options?: RenderOptions
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
    options
  );
}

// Mock Tauri invoke for all tests
export function mockTauriInvoke() {
  vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn().mockResolvedValue({}),
    event: {
      listen: vi.fn().mockResolvedValue(() => {}),
    },
  }));
}
```

---

## Coverage Goals by Phase

| Phase | Unit Coverage | Integration Coverage | E2E Coverage |
|---|---|---|---|
| Phase 0 | 60% | — | — |
| Phase 1a | 70% | 50% | — |
| Phase 1b | 75% | 60% | — |
| Phase 2 | 80% | 70% | 30% |
| Phase 3 | 80% | 75% | 50% |
| Phase 4 | 85%+ | 80%+ | 80%+ |

---

## CI/CD Pipeline

```yaml
# .github/workflows/test.yml
name: Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test-rust:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: cargo fmt --check
      - run: cargo clippy -- -D warnings
      - run: cargo test

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run lint
      - run: npm run test:run
      - run: npm run build

  test-python:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r sidecars/crewai-bridge/requirements.txt
      - run: pytest sidecars/*/tests/ -v --tb=short

  test-e2e:
    runs-on: windows-latest
    needs: [test-rust, test-frontend]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
```

---

## Implementation Checklist

- [ ] Vitest configuration and setup
- [ ] Cargo test configuration
- [ ] Pytest configuration for sidecars
- [ ] Mock factories for all data types
- [ ] Unit tests for Zustand stores (agentStore, memoryStore, sessionStore)
- [ ] Unit tests for Rust memory commands
- [ ] Unit tests for Rust terminal commands
- [ ] Unit tests for React components (AgentSidebar, MemoryPanel, TerminalPane)
- [ ] Integration test for handoff flow
- [ ] Integration test for context capture
- [ ] Playwright E2E tests for critical flows
- [ ] CI pipeline configuration
- [ ] Coverage thresholds enforcement
- [ ] Pre-commit hooks for formatting/linting
