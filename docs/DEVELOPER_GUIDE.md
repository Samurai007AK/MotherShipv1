# Mothership Developer Guide

**Version:** 0.1.0
**Last Updated:** 2026-06-22

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Frontend Architecture](#frontend-architecture)
4. [Rust Backend](#rust-backend)
5. [State Management (Zustand Stores)](#state-management-zustand-stores)
6. [Terminal Architecture](#terminal-architecture)
7. [Memory Layer](#memory-layer)
8. [Sidecar Infrastructure](#sidecar-infrastructure)
9. [Performance Monitoring](#performance-monitoring)
10. [Adding a New Feature](#adding-a-new-feature)
11. [Adding a Rust Command](#adding-a-rust-command)
12. [Testing](#testing)
13. [CI/CD Pipeline](#cicd-pipeline)
14. [Auto-Update Pipeline](#auto-update-pipeline)
15. [Code Conventions](#code-conventions)
16. [Performance Guidelines](#performance-guidelines)
17. [Debugging](#debugging)

---

## Architecture Overview

Mothership is a **Tauri 2.x** desktop app with a **React + TypeScript** frontend and **Rust** backend. Memory persistence uses **SQLite** with FTS5 full-text search.

### System Layers

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Tauri 2.x Shell (Rust)                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              Commands Layer (12+ IPC modules)                │   │
│  │  file | sidecar | summary | model | loop | archive | browser │   │
│  │  quality_gate | git | buffer_snapshot | crewai | performance │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────────────┐  │
│  │ SQLite   │  │ PTY      │  │ Sidecar   │  │ Execution        │  │
│  │ (FTS5)   │  │ Sessions │  │ Manager   │  │ Engine           │  │
│  │ WAL mode │  │ per-agent│  │ Python    │  │ parallel groups  │  │
│  └──────────┘  └──────────┘  └───────────┘  └──────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                              │ IPC (invoke + events)
┌──────────────────────────────────────────────────────────────────────┐
│                    Frontend (React + TypeScript)                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              Zustand Stores (18 stores)                     │   │
│  │  agent | workspace | memory | theme | file | coordinator     │   │
│  │  loop | archive | qualityGate | modelRouter | warRoom        │   │
│  │  taskGraph | mcp | onboarding | performance | update         │   │
│  │  executionEngine | worktree                                  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Components (16 groups)                     │   │
│  │  agents | terminal | memory | workspace | layout              │   │
│  │  command-palette | browser | model-router | war-room          │   │
│  │  task-graph | mcp | onboarding | performance | execution      │   │
│  │  LazyPanels | worktree                                       │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              Custom Hooks (3) + Libs (6)                     │   │
│  │  useTerminal | useContextCapture | useEditorDetection         │   │
│  │  useWorktreeInit                                             │   │
│  │  fuzzySearch | performance | modelRouter | summaryEngine     │   │
│  │  mcp/client                                                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

### Communication Protocols

| Between | Protocol | Details |
|---|---|---|
| Frontend ↔ Rust | Tauri IPC | `invoke()` for commands, `listen()` for streaming events |
| Frontend ↔ xterm.js | DOM | Terminal I/O via xterm.js API |
| Rust ↔ SQLite | rusqlite | Direct Rust bindings with WAL mode |
| Rust ↔ Python Sidecars | STDIO JSON-RPC | Lightweight, no HTTP overhead |
| Rust ↔ Ollama | HTTP (reqwest) | REST API for model inference |
| Rust ↔ WebView | Tauri WebviewWindow | Native OS WebView per browser tab |

---

## Project Structure

```
Mothership/
├── src/                              # React frontend (TypeScript)
│   ├── components/
│   │   ├── agents/                   # AgentSidebar, AddAgentDialog
│   │   ├── browser/                  # BrowserConnector (WebView tabs)
│   │   ├── command-palette/          # ⌘K quick switcher
│   │   ├── execution/                # ExecutionPanel (parallel agents)
│   │   ├── layout/                   # ResizableLayout, ThemeToggle, ErrorBoundary
│   │   ├── LazyPanels.tsx            # Lazy-load + idle-unmount wrapper
│   │   ├── mcp/                      # MCPPanel (server management)
│   │   ├── memory/                   # MemoryPanel, NoteEditor, Timeline, HandoffDialog
│   │   ├── model-router/             # ModelRouterPanel (Ollama)
│   │   ├── onboarding/               # OnboardingWizard (first-run)
│   │   ├── performance/              # PerformancePanel (memory gauge)
│   │   ├── task-graph/               # TaskGraph (D3.js)
│   │   ├── terminal/                 # TerminalPane, SplitPane, ConversationHistory
│   │   ├── war-room/                 # WarRoom (broadcast + chaining)
│   │   └── workspace/                # WorkspaceView (terminal tabs)
│   ├── hooks/                        # Custom React hooks
│   ├── lib/                          # Utilities + clients
│   ├── stores/                       # Zustand stores
│   ├── types/                        # TypeScript interfaces
│   └── test/                         # Unit tests (Vitest)
│
├── src-tauri/                        # Rust backend
│   ├── src/
│   │   ├── main.rs                   # Tauri entry point, command registration
│   │   ├── lib.rs                    # Library root
│   │   ├── commands/                 # Tauri IPC handlers (12 modules)
│   │   ├── memory/                   # SQLite memory layer
│   │   ├── terminal/                 # portable-pty session management
│   │   ├── process.rs                # SidecarManager
│   │   ├── loop_controller/          # Autonomous loop engine
│   │   ├── quality_gate/             # Quality gate validation
│   │   ├── archive/                  # Session archiving
│   │   └── execution_engine/         # Parallel agent execution
│   ├── Cargo.toml                    # Rust dependencies
│   ├── tauri.conf.json               # Window + bundler + updater config
│   └── capabilities/                 # Tauri v2 capability permissions
│
├── sidecars/                         # Python sidecar processes
│   ├── hello-bridge/                 # Test sidecar (JSON-RPC)
│   ├── summary-engine/               # LLM summarization (Ollama)
│   ├── crewai-bridge/                # CrewAI orchestration
│   ├── openhands-bridge/             # OpenHands agent execution
│   └── tests/                        # Pytest tests
│
├── tests/e2e/                        # Playwright E2E tests
├── docs/                             # User + Developer guides, BossConsole harness guide
└── THANKS.md                         # Open-source attribution
```

---

## Frontend Architecture

### Component Structure

Components follow a flat `src/components/{group}/` structure. Each group represents a major feature area:

- **agents/** — AgentSidebar, AddAgentDialog
- **browser/** — BrowserConnector (WebView tabs, URL bar, error states)
- **command-palette/** — CommandPalette (fuzzy search, file search, recent agents)
- **execution/** — ExecutionPanel, NewExecutionForm, GroupCard, AgentRow
- **layout/** — ResizableLayout, ThemeToggle, ErrorBoundary
- **mcp/** — MCPPanel (server add/connect/disconnect, tool/resource lists)
- **memory/** — MemoryPanel, NoteEditor, Timeline, HandoffDialog, ColdStoragePanel
- **model-router/** — ModelRouterPanel (model discovery, chat, conversation history)
- **onboarding/** — OnboardingWizard (3-step first-run experience)
- **performance/** — PerformancePanel (memory bars, pressure indicator, sparkline)
- **task-graph/** — TaskGraph (D3.js, drag nodes, edge creation)
- **terminal/** — TerminalPane (xterm.js), SplitPane, ConversationHistory
- **war-room/** — WarRoom (broadcast, side-by-side, task chaining)
- **workspace/** — WorkspaceView (tab bar, terminal containers, drag-drop overlay)

### Custom Hooks

| Hook | File | Purpose |
|---|---|---|
| `useTerminal` | `src/hooks/useTerminal.ts` | xterm.js ↔ Tauri PTY (spawn, I/O, pause/resume, search, AI chat) |
| `useContextCapture` | `src/hooks/useContextCapture.ts` | Event-driven context capture (output, git, agent switch, heartbeat) |
| `useEditorDetection` | `src/hooks/useEditorDetection.ts` | Detect available editors on the system |
| `useWorktreeInit` | `src/hooks/useWorktreeInit.ts` | Initialize worktree detection on project open |

---

## Rust Backend

### Command Modules

All IPC handlers live in `src-tauri/src/commands/`. Each module is registered in `commands/mod.rs` and wired in `main.rs`.

| Module | File | Commands | Purpose |
|---|---|---|---|
| **file** | `file_commands.rs` | `list_project_files`, `read_file_contents`, `attach_file`, `get_file_metadata` | File system operations |
| **sidecar** | `sidecar_commands.rs` | `spawn_sidecar`, `kill_sidecar`, `check_sidecar_health`, `list_sidecars` | Python sidecar lifecycle |
| **summary** | `summary_commands.rs` | `summarize_context`, `check_summary_health` | LLM summarization |
| **model** | `model_commands.rs` | `list_ollama_models`, `check_ollama_status`, `chat_completion`, `generate_response` | Ollama integration |
| **loop** | `loop_commands.rs` | `start_loop`, `pause_loop`, `resume_loop`, `cancel_loop`, `get_loop_state`, `retry_loop` | Autonomous loop control |
| **archive** | `archive_commands.rs` | `archive_old_sessions`, `prune_old_snapshots`, `list_archived_sessions`, `restore_archived_session` | Session archiving |
| **quality_gate** | `quality_gate_commands.rs` | `run_quality_gates`, `auto_detect_quality_gate_config` | Quality validation |
| **browser** | `browser_commands.rs` | `create_browser_window`, `navigate_browser_window`, `close_browser_window`, `list_browser_windows` | WebView window management |
| **performance** | `performance_commands.rs` | `get_performance_snapshot` | Memory/CPU monitoring via sysinfo |
| **git** | `git_commands.rs` | `detect_git_project`, `create_worktree_workspace`, `list_worktree_workspaces`, `get_worktree_status`, diff, commit, push, preset management, port allocation | Git worktree operations |
| **buffer_snapshot** | `buffer_snapshot_commands.rs` | `save_terminal_buffer`, `load_terminal_buffer`, `clear_terminal_buffer`, `list_terminal_buffers` | Terminal buffer persistence |
| **crewai** | `crewai_commands.rs` | `crewai_handoff`, `check_crewai_available` | CrewAI orchestration |

### Registration Pattern

Each command module is:
1. Declared in `commands/mod.rs` as `pub mod <name>;`
2. Registered in `main.rs` in the `invoke_handler` macro
3. Uses `#[tauri::command]` on each function

```rust
// commands/mod.rs
pub mod performance_commands;

// main.rs
.invoke_handler(tauri::generate_handler![
    // ...
    commands::performance_commands::get_performance_snapshot,
])
```

### Key State Managers

| Manager | Type | Purpose |
|---|---|---|
| `TerminalManager` | `Arc<Mutex<HashMap<String, PtySession>>>` | Per-agent PTY session lifecycle |
| `SidecarManager` | `Arc<SidecarManager>` | Python sidecar lifecycle |
| `MemoryStore` | `MemoryStore` | SQLite-backed persistence |
| `ExecutionEngine` | `Arc<RwLock<ExecutionEngine>>` | Parallel agent execution |
| `LoopController` | `Arc<RwLock<Option<LoopController>>>` | Autonomous loop state |

---

## State Management (Zustand Stores)

Mothership uses Zustand for all state management. Stores are pure TypeScript with no backend coupling — backend communication is done through store actions.

### Store Inventory

| Store | File | Key State | Key Actions | Test File |
|---|---|---|---|---|
| **agentStore** | `src/stores/agentStore.ts` | `agents[]`, `activeAgentId`, `recentAgentIds[]` | `setActiveAgent`, `registerAgent`, `updateAgentStatus`, `removeAgent`, `recordRecentAgent` | ✅ agentStore.test.ts |
| **workspaceStore** | `src/stores/workspaceStore.ts` | `tabs[]`, `activeTabId`, `connected`, `splitPanes[]` | `addTab`, `removeTab`, `setActiveTab`, `setConnected`, `addSplitPane`, `removeSplitPane` | ❌ |
| **memoryStore** | `src/stores/memoryStore.ts` | `notes[]`, `contextHistory[]`, `activeTab`, `searchQuery`, `sessions[]` | `addNote`, `updateNote`, `deleteNote`, `addContextEntry`, `setActiveTab`, `setSearchQuery`, `getFilteredNotes` | ✅ memoryStore.test.ts |
| **themeStore** | `src/stores/themeStore.ts` | `theme`, `resolvedTheme` | `setTheme` | ❌ |
| **fileStore** | `src/stores/fileStore.ts` | `files[]`, `searchQuery`, `isLoading` | `searchFiles`, `clearSearch` | ❌ |
| **coordinatorStore** | `src/stores/coordinatorStore.ts` | `globalStatus` | Cross-store orchestration | ❌ |
| **loopStore** | `src/stores/loopStore.ts` | `status`, `tasks[]`, `iterations[]`, `metrics` | `startLoop`, `pauseLoop`, `resumeLoop`, `cancelLoop`, `addTask`, `updateTask` | ❌ |
| **archiveStore** | `src/stores/archiveStore.ts` | `archives[]`, `isArchiving`, `isPruning` | `archiveSession`, `pruneSnapshots`, `restoreSession` | ❌ |
| **qualityGateStore** | `src/stores/qualityGateStore.ts` | `reports[]`, `isRunning`, `config` | `runGates`, `autoDetectConfig` | ❌ |
| **modelRouterStore** | `src/stores/modelRouterStore.ts` | `models[]`, `activeModel`, `isConnected`, `conversations[]` | `connect`, `disconnect`, `sendMessage`, `selectModel` | ❌ |
| **warRoomStore** | `src/stores/warRoomStore.ts` | `sessions[]`, `activeSessionId`, `view`, `taskChains[]` | `createSession`, `broadcastToAgents`, `createTaskChain`, `updateChainStep` | ✅ warRoomStore.test.ts |
| **taskGraphStore** | `src/stores/taskGraphStore.ts` | `graphs[]`, `activeGraphId`, `layout`, `selectedNodeId` | `createGraph`, `addNode`, `updateNode`, `addEdge`, `getSuccessors` | ✅ taskGraphStore.test.ts |
| **mcpStore** | `src/stores/mcpStore.ts` | `servers[]`, `activeServerId`, `capabilities` | `addServer`, `connect`, `disconnect`, `discoverTools` | ❌ |
| **onboardingStore** | `src/stores/onboardingStore.ts` | `isOnboarding`, `currentStep`, `completedSteps[]` | `startOnboarding`, `nextStep`, `prevStep`, `completeOnboarding`, `skipOnboarding` | ✅ onboardingStore.test.ts |
| **performanceStore** | `src/stores/performanceStore.ts` | `snapshot`, `isPolling`, `pressure`, `pressureHistory[]`, `autoPauseEnabled`, `autoPauseEvents[]` | `startPolling`, `stopPolling`, `refreshNow`, `setAutoPauseEnabled`, `clearPressureHistory` | ✅ performanceStore.test.ts |
| **updateStore** | `src/stores/updateStore.ts` | `updateInfo`, `downloadProgress`, `status` | `checkForUpdates`, `downloadUpdate`, `installUpdate` | ❌ |
| **executionEngineStore** | `src/stores/executionEngineStore.ts` | `groups[]`, `activeGroupId`, `sharedContext[]` | `createGroup`, `startGroup`, `cancelGroup`, `addSharedContext` | ✅ executionEngineStore.test.ts |
| **worktreeStore** | `src/stores/worktreeStore.ts` | `workspaces[]`, `presets[]`, `ports[]` | Worktree CRUD, preset management, port allocation | ✅ worktreeStore.test.ts |

### Store Pattern

```typescript
// Standard Zustand store pattern
import { create } from 'zustand'

interface MyFeatureState {
  items: Item[]
  isLoading: boolean
  addItem: (item: Item) => void
}

export const useMyFeatureStore = create<MyFeatureState>((set) => ({
  items: [],
  isLoading: false,
  addItem: (item) => set((state) => ({
    items: [...state.items, item],
  })),
}))
```

### Testing Stores

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useMyFeatureStore } from '../../stores/myFeatureStore'

describe('myFeatureStore', () => {
  beforeEach(() => {
    useMyFeatureStore.setState({ items: [], isLoading: false })
  })

  it('adds an item', () => {
    useMyFeatureStore.getState().addItem({ id: '1', name: 'Test' })
    expect(useMyFeatureStore.getState().items).toHaveLength(1)
  })
})
```

### Mocking Tauri IPC in Tests

```typescript
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'
const mockInvoke = vi.mocked(invoke)

// In test:
mockInvoke.mockResolvedValue({ key: 'value' })
mockInvoke.mockRejectedValue(new Error('IPC error'))
mockInvoke.mockResolvedValueOnce(someValue) // Chain responses
```

---

## Terminal Architecture

### PTY Session Lifecycle

Each agent gets a dedicated pseudo-terminal (PTY) session:

1. **Spawn** — `spawn_terminal_session` creates a new PTY via `portable-pty`
2. **Event bridge** — A background thread reads PTY output → Tauri events (`terminal-output`)
3. **I/O** — Frontend sends input via `write_terminal_input`, receives output via `listen('terminal-output')`
4. **Pause/Resume** — `pause_terminal_session` suspends the child process (SIGSTOP on Unix, thread suspension on Windows). `resume_terminal_session` continues it
5. **Close** — `close_terminal_session` kills the child process and removes the session

### Buffer Persistence

- **Memory** — `bufferSnapshots` Map in `useTerminal.ts` (keyed by session ID)
- **Disk** — `save_terminal_buffer` / `load_terminal_buffer` IPC commands
- **Trim** — Last 5000 lines preserved; trimmed to `SNAPSHOT_MAX_LINES`
- **Auto-save** — On tab hide (30s delay) and on unmount

### Idle Pause

- **30s idle timer** — When a tab is hidden, a 30s timer starts
- **Save + Pause** — On timeout, buffer is saved to disk and `pause_terminal_session` is called
- **Resume on focus** — When the tab becomes visible, `resume_terminal_session` is called and buffer is restored
- **Memory threshold** — The Performance Panel's auto-pause also pauses all running terminals when process memory exceeds 200 MB (edge-triggered)

---

## Memory Layer

### SQLite Schema

The memory layer uses SQLite with WAL mode and FTS5 full-text search:

```sql
-- Core tables
CREATE TABLE memory_notes (id TEXT PRIMARY KEY, content TEXT, tags TEXT, ...);
CREATE TABLE context_entries (id TEXT PRIMARY KEY, agent_id TEXT, content TEXT, ...);
CREATE TABLE sessions (id TEXT PRIMARY KEY, agent_id TEXT, ...);

-- FTS5 virtual table
CREATE VIRTUAL TABLE memory_fts USING fts5(content, tags, tokenize='porter');
```

### Key Rust Modules

| File | Purpose |
|---|---|
| `src-tauri/src/memory/store.rs` | SQLite CRUD operations, FTS5 search, WAL mode |
| `src-tauri/src/memory/models.rs` | Serialization types (MemoryEntry, Session, etc.) |
| `src-tauri/src/memory/commands.rs` | IPC commands for memory operations |

### IPC Commands

16 memory commands registered: `save_memory`, `delete_memory`, `query_memory`, `list_memory`, `search_memory`, `rebuild_fts_index`, `archive_old_sessions`, `prune_old_snapshots`, `list_archived_sessions`, `restore_archived_session`, `save_session`, `save_handoff`, `list_handoffs`, `memory_entry_count`, `compile_handoff`, `save_context_snapshot`, `list_memory_sessions`.

---

## Sidecar Infrastructure

### Python Sidecar Protocol

Sidecars communicate via JSON-RPC over STDIO:

```
→ {"jsonrpc": "2.0", "method": "health", "id": 1}
← {"jsonrpc": "2.0", "result": {"status": "ok"}, "id": 1}
```

### SidecarManager (Rust)

| Method | Description |
|---|---|
| `new()` | Initialize with empty process list |
| `spawn(bin_path, args)` | Spawn a Python process, track its PID |
| `kill(id)` | Kill a sidecar by ID |
| `health(id)` | Check if a sidecar is responsive |
| `list()` | List all managed sidecars |

### Available Sidecars

| Sidecar | Path | Purpose |
|---|---|---|
| hello-bridge | `sidecars/hello-bridge/main.py` | Test/example sidecar |
| summary-engine | `sidecars/summary-engine/main.py` | LLM summarization via Ollama |
| crewai-bridge | `sidecars/crewai-bridge/main.py` | CrewAI orchestration (Flow API) |
| openhands-bridge | `sidecars/openhands-bridge/main.py` | OpenHands agent execution |

---

## Performance Monitoring

### Rust Backend

The `get_performance_snapshot` IPC command (in `performance_commands.rs`) uses the `sysinfo` crate to report:

- **Process memory** — Resident Set Size (RSS) in MB
- **System RAM** — Total, used, available
- **Swap** — Total and used
- **CPU** — Core count and overall usage percentage
- **Threshold flag** — `over_threshold: true` when process memory > 200 MB

### Frontend Store

The `performanceStore.ts` runs on a 5-second polling interval:

1. Calls `get_performance_snapshot` (Tauri mode) or reads JS heap (dev mode)
2. Determines memory pressure: OK (<150 MB), Warning (150-299 MB), Critical (≥300 MB)
3. Appends to 60-entry pressure history (5-minute window)
4. If auto-pause is enabled and memory spikes above 200 MB, calls `autoPauseIdleTerminals()`

### Auto-Pause Logic

Edge-triggered (fires once per crossing):
```
wasOverThreshold = false → snapshot.over_threshold = true → fire auto-pause → wasOverThreshold = true
wasOverThreshold = true → snapshot.over_threshold = false → wasOverThreshold = false  (reset)
wasOverThreshold = false → snapshot.over_threshold = true → fire auto-pause again
```

---

## Adding a New Feature

### 1. Create the Store

```typescript
// src/stores/myFeatureStore.ts
import { create } from 'zustand'

interface MyFeatureState {
  items: Item[]
  addItem: (item: Item) => void
}

export const useMyFeatureStore = create<MyFeatureState>((set) => ({
  items: [],
  addItem: (item) => set((s) => ({ items: [...s.items, item] })),
}))
```

### 2. Create the Component

```typescript
// src/components/my-feature/MyFeature.tsx
import { useMyFeatureStore } from '../../stores/myFeatureStore'

export function MyFeature() {
  const items = useMyFeatureStore((s) => s.items)
  return <div>{items.map(item => <div key={item.id}>{item.name}</div>)}</div>
}
```

### 3. Wire into MemoryPanel

```typescript
// src/components/memory/MemoryPanel.tsx
import { MyFeature } from '../my-feature/MyFeature'

// Add tab:
const TABS = [...existingTabs, { id: 'my-feature', label: 'My Feature', icon: Activity }]
// Add panel:
{activeTab === 'my-feature' && <MyFeature />}
```

### 4. Add Store Tests

```typescript
// src/test/stores/myFeatureStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useMyFeatureStore } from '../../stores/myFeatureStore'

describe('myFeatureStore', () => {
  beforeEach(() => {
    useMyFeatureStore.setState({ items: [] })
  })

  it('adds an item', () => {
    useMyFeatureStore.getState().addItem({ id: '1', name: 'Test' })
    expect(useMyFeatureStore.getState().items).toHaveLength(1)
  })
})
```

### 5. Add Component Tests

```typescript
import { render, screen } from '@testing-library/react'
import { MyFeature } from '../../components/my-feature/MyFeature'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

describe('MyFeature', () => {
  it('renders items', () => {
    useMyFeatureStore.setState({ items: [{ id: '1', name: 'Test' }] })
    render(<MyFeature />)
    expect(screen.getByText('Test')).toBeInTheDocument()
  })
})
```

---

## Adding a Rust Command

### 1. Create the Command File

```rust
// src-tauri/src/commands/my_commands.rs
use tauri::command;

#[command]
pub fn my_command(arg: String) -> Result<String, String> {
    Ok(format!("Processed: {}", arg))
}
```

### 2. Register the Module

```rust
// src-tauri/src/commands/mod.rs
pub mod my_commands;
```

### 3. Add to invoke_handler

```rust
// src-tauri/src/main.rs
.invoke_handler(tauri::generate_handler![
    // ...existing commands
    commands::my_commands::my_command,
])
```

### 4. Add Cargo Dependencies

```toml
# src-tauri/Cargo.toml
[dependencies]
my-crate = "1.0"
```

### 5. Test the Command

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_my_command() {
        let result = my_command("hello".to_string());
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "Processed: hello");
    }
}
```

---

## Testing

### Test Stack

| Layer | Framework | Config |
|---|---|---|
| Frontend unit | Vitest + React Testing Library | `vitest.config.ts` |
| Rust backend | cargo test (built-in) | `src-tauri/Cargo.toml` |
| Python sidecars | Pytest | `sidecars/pytest.ini` |
| E2E | Playwright | `playwright.config.ts` |

### Running Tests

```bash
# All frontend unit tests
npm test

# Specific test file
npx vitest run src/test/stores/agentStore.test.ts

# Watch mode
npx vitest

# With coverage
npm run test:coverage

# Rust tests
cd src-tauri && cargo test

# Python sidecar tests
cd sidecars && python -m pytest tests/

# E2E tests (requires Tauri app running)
npx playwright test
```

### Test Patterns

#### Store Tests (getState pattern)
```typescript
beforeEach(() => {
  useAgentStore.setState({ agents: [], activeAgentId: null })
})

it('updates agent status', () => {
  useAgentStore.getState().updateAgentStatus('claude', 'running')
  expect(useAgentStore.getState().agents[0].status).toBe('running')
})
```

#### Store Tests (fake timers for polling)
```typescript
beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

it('polls on interval', async () => {
  usePerformanceStore.getState().startPolling(5000)
  await vi.advanceTimersByTimeAsync(5000)
  expect(mockInvoke).toHaveBeenCalled()
})
```

#### Component Tests
```typescript
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

it('renders agent name', () => {
  render(<AgentSidebar />)
  expect(screen.getByText('Claude')).toBeInTheDocument()
})
```

#### Mocking Tauri Events
```typescript
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}))
```

### Current Test Coverage

| Category | Files | Tests | Status |
|---|---|---|---|
| Components | 26 files | 755 | ✅ All passing |
| Hooks | 3 files | 36 | ✅ All passing |
| Stores | 7 files | 111 | ✅ All passing |
| Lib (utilities) | 5 files | 135 | ✅ All passing |
| Python sidecars | 3 files | 91 | ✅ All passing |
| **Total** | **44 files** | **1189** | **✅ 0 failures** |

---

### Rust Test Patterns

Backend tests live alongside the code with `#[cfg(test)]` modules. For SQLite-backed tests, use an in-memory database:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: create in-memory test database
    fn test_db() -> MemoryStore {
        MemoryStore::open(":memory:").unwrap()
    }

    #[test]
    fn test_write_and_read_note() {
        let db = test_db();
        db.create_project("proj-1", "Test", "/tmp").unwrap();
        db.write_note("proj-1", "Hello world", "test").unwrap();

        let notes = db.get_notes("proj-1", None, None).unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].content, "Hello world");
    }

    #[test]
    fn test_search_memory_fts5() {
        let db = test_db();
        db.create_project("proj-1", "Test", "/tmp").unwrap();

        db.write_note("proj-1", "Implementing user authentication", "").unwrap();
        db.write_note("proj-1", "Writing authentication tests", "").unwrap();

        let results = db.search_memory("proj-1", "authentication").unwrap();
        assert_eq!(results.len(), 2);
    }
}
```

For concurrent tests, clone the store reference and use `std::thread::spawn`. Always use an in-memory database (`:memory:`) for test isolation.

---

## CI/CD Pipeline

### Workflow (`.github/workflows/ci.yml`)

```yaml
name: CI

on: [push, pull_request]

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
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

### Release Workflow (`.github/workflows/release.yml`)

Builds for 3 platforms with installers:
- **Windows** — MSI + NSIS installer
- **macOS** — DMG
- **Linux** — AppImage + .deb

Uses `tauri-action` with GitHub releases for auto-update distribution.

---

## Auto-Update Pipeline

Mothership uses the Tauri v2 auto-updater plugin.

### Configuration

In `tauri.conf.json`:
```json
{
  "plugins": {
    "updater": {
      "active": true,
      "endpoints": ["https://releases.mothership.app/{{target}}-{{arch}}/{{current_version}}"],
      "pubkey": "..."
    }
  }
}
```

### Frontend

- `updateStore.ts` — Zustand store for update state (check, download, install)
- `UpdateBanner` — Auto-appears on mount if update is available; shows download progress
- `UpdateCheckButton` — Button for manual update check

### Flow

1. App launch → `checkForUpdates()` via `@tauri-apps/plugin-updater`
2. Update available → show banner with Download button
3. Download → progress bar in banner
4. Install → `installUpdate()` restarts the app

---

## Code Conventions

- **Immutability:** Never mutate state directly — always use spread operators or Zustand's `set()`
- **Naming:** PascalCase for components and interfaces, camelCase for functions and variables, kebab-case for filenames
- **File size:** Target 200-400 lines per file, max 800. Split larger files
- **No comments:** Code should be self-documenting. Use descriptive function/variable names. Reserve comments for non-obvious rationale
- **Error handling:** Always catch and handle async errors. No unhandled promise rejections
- **Imports:** Group imports: React/third-party first, then project internal, then types
- **CSS:** Use Tailwind utility classes. Use CSS variable classes (e.g., `text-c-text`, `bg-c-surface`) instead of hardcoded colors
- **React:** Use `useCallback`/`useMemo` for expensive computations. Select specific store slices to avoid re-renders

---

## Performance Guidelines

- **Lazy-load heavy panels** — Use `LazyPanel` wrapper in `LazyPanels.tsx` with 10-minute idle unmount
- **Batch memory writes** — `BatchQueue` class with 2-second flush interval
- **Debounce** — Use `debounce()` from `performance.ts` for frequent events (search input, resize)
- **Throttle** — Use `throttle()` from `performance.ts` for rate-limited callbacks (scrolling, mouse moves)
- **Avoid re-renders** — Select specific store slices: `const value = useStore((s) => s.value)`
- **Terminal pause** — Hidden terminal sessions auto-pause after 30s; all terminals auto-pause on memory > 200 MB
- **Cold storage** — Archive old sessions to gzip-compressed JSON to reduce SQLite size
- **LazyPanel** — Panels auto-unmount after 10 minutes of inactivity to free memory

---

## Debugging

### Frontend

1. Open DevTools: Right-click → Inspect (or `Ctrl+Shift+I`)
2. React DevTools: Install the browser extension
3. Zustand DevTools: Install `zundler` or use `zustand/devtools` middleware
4. Check console for errors from IPC calls and store actions

### Backend (Rust)

1. Tauri logs: `src-tauri/target/debug/` (run `cargo check` for compilation errors)
2. Enable tracing: Set `RUST_LOG=debug` environment variable
3. SQLite database: Located at `%APPDATA%/mothership/memory.db` (Windows)
4. Rust backtraces: Set `RUST_BACKTRACE=1` for panic details

### Sidecars

1. Sidecar logs: Stdout/stderr is captured by `SidecarManager`
2. Python errors: Check the `check_sidecar_health` response for error messages
3. Test sidecars: Use `hello-bridge/main.py` for basic connectivity testing
