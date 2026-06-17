# Mothership — Phase Transitions

**Last Updated:** 2026-06-15
**Status:** Final Draft
**Scope:** Project management across all phases

**Related Documents:**
- [`TESTING-STRATEGY.md`](./TESTING-STRATEGY.md) — Gate validation test requirements, coverage targets per phase
- [`ERROR-HANDLING.md`](./ERROR-HANDLING.md) — Rollback procedures, failure recovery during transitions
- [`SCHEMA-MIGRATIONS.md`](./SCHEMA-MIGRATIONS.md) — Database rollback during phase transitions
- [`CONFIGURATION.md`](./CONFIGURATION.md) — Config migration during phase transitions
- [`MONITORING.md`](./MONITORING.md) — Monitoring setup during phase transitions

## Overview

Mothership is built in 6 phases with 22 sub-phases. This document defines how transitions between phases are managed, including rollback procedures, parallel work opportunities, and dependency tracking.

---

## 1. Phase Dependency Map

```
Phase 0: Foundation
    │
    ├── Phase 1a: Core Infrastructure (agent registry + terminal mux)
    │       │
    │       └── Phase 1b: Context & Handoff (memory + handoff)
    │               │
    │               └── Phase 2: Enhanced Context (auto-summary + search)
    │                       │
    │                       ├── Phase 3: Advanced Features (browser + graph)
    │                       │
    │                       └── Phase 4: Distribution (installer + tests)
```

### 1.1 Sub-Phase Dependencies

| Sub-Phase | Depends On | Blocks | Can Parallel |
|---|---|---|---|
| **0.1** Fork Jan | — | 0.2, 0.3, 0.4 | — |
| **0.2** Strip & Reshape | 0.1 | 0.3, 1a.1 | — |
| **0.3** Theme & Design | 0.1, 0.2 | 1a.1, 1a.2 | — |
| **0.4** Sidecar Foundation | 0.1 | 1a.2, 1b.1 | 0.2, 0.3 |
| **0.5** Build Verification | 0.2, 0.3, 0.4 | 1a.1 | — |
| **1a.1** Agent Registry | 0.5 | 1a.2, 1b.2 | — |
| **1a.2** Terminal Multiplexer | 0.4, 0.5 | 1b.1, 1b.2 | 1a.1 (partial) |
| **1b.1** Shared Memory | 1a.2 | 1b.2, 1b.3 | — |
| **1b.2** Manual Handoff | 1a.1, 1b.1 | 1b.3, 2.1 | 1b.1 (partial) |
| **1b.3** Quick Switcher | 1a.1, 1b.2 | 2.1, 2.2 | — |
| **2.1** Context Capture | 1b.1 | 2.2, 2.3 | 2.4, 2.5 |
| **2.2** LLM Summarization | 2.1 | 2.3 | 2.4, 2.5 |
| **2.3** Context Search | 2.1 | 2.4, 3.1 | 2.5 |
| **2.4** File Attachments | 2.1 | 3.1 | 2.2, 2.3, 2.5 |
| **2.5** Memory Consolidation | 2.1 | 3.1 | 2.2, 2.3, 2.4 |
| **3.1** Browser Connector | 2.3 | 3.2, 3.3 | 3.4, 3.5 |
| **3.2** Local Model Router | 2.2 | 3.4 | 3.1, 3.3, 3.5 |
| **3.3** Task Dependency Graph | 1b.2 | 3.4 | 3.1, 3.2, 3.5 |
| **3.4** War Room | 3.1, 3.2, 3.3 | 3.5 | 3.1, 3.2, 3.3 |
| **3.5** MCP Integration | 2.3 | 4.1 | 3.1, 3.2, 3.3, 3.4 |
| **4.1** Installer | 3.5 | 4.2, 4.3 | 4.4, 4.5 |
| **4.2** Onboarding | 3.5 | 4.3 | 4.1, 4.4, 4.5 |
| **4.3** Testing Suite | 0.5+, ongoing | 4.4 | 4.1, 4.2, 4.5 |
| **4.4** Performance | 3.4 | 4.5 | 4.1, 4.2, 4.3 |
| **4.5** Documentation | 3.5 | — | 4.1, 4.2, 4.3, 4.4 |

---

## 2. Gate Validation

### 2.1 Gate Criteria

| Gate | Criteria | Validation Method |
|---|---|---|
| **G0** | App compiles with 3 panels | `cargo tauri build` succeeds, screenshot shows 3 panels |
| **G1a** | Agents listed, terminals work | Manual test: 10 agents visible, PTY responds to input |
| **G1b** | Notes + handoff works | Manual test: write note, handoff produces summary |
| **G2** | Auto-summary + search works | Manual test: handoff generates AI summary, search returns results |
| **G3** | Browsers + graph + collab | Manual test: WebView loads, D3 graph renders, war room compares |
| **G4** | Installable, tested, polished | Automated: tests pass, installer works, performance targets met |

### 2.2 Gate Validation Checklist

```markdown
## Gate G0: Foundation

- [ ] `cargo tauri build` completes without errors
- [ ] App launches and shows 3-panel layout
- [ ] Theme switching works (light/dark)
- [ ] Zustand stores initialized (agents, sessions)
- [ ] Python sidecar spawns successfully
- [ ] Basic Tauri IPC works (invoke command → response)

## Gate G1a: Core Infrastructure

- [ ] Agent sidebar shows 10 agents with status dots
- [ ] Clicking agent opens terminal
- [ ] Terminal accepts input and shows output
- [ ] Multiple terminals can run simultaneously
- [ ] Terminal session persists when switching tabs
- [ ] Split pane works (⌘\)

## Gate G1b: Context & Handoff

- [ ] Memory panel shows notes
- [ ] Can write and save a note
- [ ] Context capture runs every 30s
- [ ] Handoff button available
- [ ] Handoff produces context summary
- [ ] Quick switcher works (⌘K)
- [ ] Keyboard shortcuts functional

## Gate G2: Enhanced Context

- [ ] Context capture is event-driven (git, output, switch)
- [ ] Auto-summary generates on handoff
- [ ] Template fallback works when Ollama unavailable
- [ ] FTS5 search returns relevant results
- [ ] Search filters by agent/project/type
- [ ] File drag-drop works
- [ ] Memory pruning keeps size bounded
- [ ] Cold storage archives old sessions

## Gate G3: Advanced Features

- [ ] WebView loads ChatGPT/Gemini
- [ ] Screenshot captured on handoff
- [ ] Local model router selects Ollama model
- [ ] Model comparison shows side-by-side
- [ ] D3.js task graph renders
- [ ] Graph is interactive (click, hover, zoom)
- [ ] War room sends to multiple agents
- [ ] Task chaining works (output → next input)

## Gate G4: Distribution

- [ ] Windows installer (NSIS) builds and installs
- [ ] Auto-update checks and prompts
- [ ] Onboarding wizard completes in < 2 min
- [ ] All unit tests pass (80%+ coverage)
- [ ] All integration tests pass
- [ ] Performance targets met (< 200MB idle)
- [ ] README.md complete
- [ ] User guide complete
```

---

## 3. Rollback Procedures

### 3.1 Rollback Strategy

Each phase can be rolled back independently if it fails its gate.

```rust
// Rollback decision tree
enum RollbackDecision {
    /// Revert code changes only (safe)
    CodeRevert,

    /// Revert code + schema (requires migration rollback)
    SchemaRevert,

    /// Revert to previous phase entirely (nuclear)
    FullRevert,
}
```

### 3.2 Phase-Specific Rollback

| Phase | Rollback Type | Steps | Data Loss |
|---|---|---|---|
| **Phase 0** | Code revert | `git revert` to pre-Phase 0 | None (no code existed) |
| **Phase 1a** | Code revert | `git revert` Phase 1a commits | None (no user data) |
| **Phase 1b** | Schema revert | Rollback DB migration + code revert | Possible (memory entries) |
| **Phase 2** | Schema revert | Rollback FTS5 + code revert | Possible (search index) |
| **Phase 3** | Code revert | `git revert` Phase 3 commits | None (additive features) |
| **Phase 4** | Code revert | `git revert` Phase 4 commits | None (packaging only) |

### 3.3 Rollback Implementation

```bash
# Code-only rollback (safe)
git log --oneline -20  # Find commits for the phase
git revert <phase-start>..<phase-end>  # Revert all phase commits
git push  # Push revert

# Schema rollback (requires caution)
# 1. Backup current database
cp ~/.mothership/projects/*/memory.db ~/.mothership/backups/pre_rollback.db

# 2. Rollback migration
cargo run -- rollback-database --to <target-version>

# 3. Revert code
git revert <phase-start>..<phase-end>
```

### 3.4 Rollback UI

```tsx
// Settings → Advanced → Rollback
const RollbackSection: React.FC = () => {
  const [currentPhase, setCurrentPhase] = useState<string>('1b');
  const [targetPhase, setTargetPhase] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Phase Rollback</h3>
      <p className="text-sm text-zinc-400">
        Revert to a previous phase. This will create a backup before rolling back.
      </p>

      <div className="space-y-2">
        <Label>Rollback to phase</Label>
        <Select onValueChange={setTargetPhase}>
          <SelectItem value="0">Phase 0 — Foundation</SelectItem>
          <SelectItem value="1a">Phase 1a — Core</SelectItem>
          <SelectItem value="1b">Phase 1b — Context</SelectItem>
          <SelectItem value="2">Phase 2 — Enhanced</SelectItem>
        </Select>
      </div>

      {targetPhase && (
        <div className="bg-yellow-900/20 border border-yellow-700 rounded p-3">
          <p className="text-sm text-yellow-200">
            ⚠️ This will revert code changes and possibly database schema.
            A backup will be created automatically.
          </p>
        </div>
      )}

      <Button
        variant="destructive"
        disabled={!targetPhase}
        onClick={() => invoke('rollback_to_phase', { phase: targetPhase })}
      >
        Rollback to Phase {targetPhase}
      </Button>
    </div>
  );
};
```

---

## 4. Parallel Work Opportunities

### 4.1 Phase 0 Parallel Work

```
Week 1:
  ├── Developer A: 0.1 (Fork Jan)
  └── Developer B: (Waiting)

Week 2:
  ├── Developer A: 0.2 (Strip & Reshape)
  ├── Developer B: 0.4 (Sidecar Foundation)  ← CAN PARALLEL
  └── Developer C: (Waiting)

Week 3:
  ├── Developer A: 0.3 (Theme & Design)  ← After 0.2
  └── Developer B: 0.4 (Sidecar Foundation)  ← Continue
```

### 4.2 Phase 1a Parallel Work

```
Week 1:
  ├── Developer A: 1a.1 (Agent Registry)
  └── Developer B: (1a.2 partial - PTY research + xterm.js setup)  ← CAN PARALLEL

Week 2:
  ├── Developer A: 1a.1 (Complete)
  └── Developer B: 1a.2 (Terminal Multiplexer - full implementation)
```

### 4.3 Phase 2 Parallel Work

```
Week 1:
  ├── Developer A: 2.1 (Context Capture)
  ├── Developer B: (Waiting for 2.1)
  └── Developer C: (Waiting for 2.1)

Week 2:
  ├── Developer A: 2.2 (LLM Summarization)
  ├── Developer B: 2.4 (File Attachments)  ← CAN PARALLEL
  └── Developer C: 2.5 (Memory Consolidation)  ← CAN PARALLEL

Week 3:
  ├── Developer A: 2.3 (Context Search)  ← After 2.1
  ├── Developer B: 2.4 (Complete)
  └── Developer C: 2.5 (Complete)
```

### 4.4 Phase 3 Parallel Work

```
Week 1:
  ├── Developer A: 3.1 (Browser Connector)
  ├── Developer B: 3.2 (Local Model Router)  ← CAN PARALLEL
  └── Developer C: 3.3 (Task Dependency Graph)  ← CAN PARALLEL

Week 2:
  ├── Developer A: 3.1 (Complete)
  ├── Developer B: 3.2 (Complete)
  └── Developer C: 3.3 (Complete)

Week 3:
  └── All: 3.4 (War Room)  ← Needs 3.1, 3.2, 3.3

Week 4:
  └── Developer A: 3.5 (MCP Integration)
```

### 4.5 Phase 4 Parallel Work

```
Week 1:
  ├── Developer A: 4.1 (Installer)
  ├── Developer B: 4.2 (Onboarding)  ← CAN PARALLEL
  └── Developer C: 4.5 (Documentation)  ← CAN PARALLEL

Week 2:
  ├── Developer A: 4.1 (Complete)
  ├── Developer B: 4.2 (Complete)
  └── Developer C: 4.5 (Complete)

Week 3:
  └── Developer A: 4.3 (Testing Suite)  ← After all features

Week 4:
  └── Developer A: 4.4 (Performance)  ← After testing
```

---

## 5. Gate Validation Process

### 5.1 Gate Review Meeting

Before transitioning to the next phase:

1. **Code Review** — All code for the phase is reviewed
2. **Gate Checklist** — Every item in the gate checklist is verified
3. **Demo** — Working demo of the phase deliverables
4. **Risks Assessment** — Any remaining risks are documented
5. **Go/No-Go Decision** — Team decides to proceed or fix issues

### 5.2 Gate Validation Script

```bash
#!/bin/bash
# scripts/validate-gate.sh

GATE=$1

echo "=== Validating Gate $GATE ==="

case $GATE in
  G0)
    echo "1. Building app..."
    cargo tauri build || exit 1

    echo "2. Checking 3-panel layout..."
    # Run E2E test for layout
    npm run test:e2e -- --grep "three-panel layout" || exit 1

    echo "3. Testing sidecar spawn..."
    npm run test:e2e -- --grep "sidecar spawn" || exit 1

    echo "✅ Gate G0 passed"
    ;;

  G1a)
    echo "1. Checking agent sidebar..."
    npm run test:e2e -- --grep "10 agents visible" || exit 1

    echo "2. Testing terminal PTY..."
    npm run test:e2e -- --grep "terminal responds" || exit 1

    echo "3. Testing session persistence..."
    npm run test:e2e -- --grep "session persists" || exit 1

    echo "✅ Gate G1a passed"
    ;;

  G1b)
    echo "1. Testing note creation..."
    npm run test:e2e -- --grep "write note" || exit 1

    echo "2. Testing handoff flow..."
    npm run test:e2e -- --grep "handoff completes" || exit 1

    echo "3. Testing quick switcher..."
    npm run test:e2e -- --grep "quick switcher" || exit 1

    echo "✅ Gate G1b passed"
    ;;

  *)
    echo "Unknown gate: $GATE"
    exit 1
    ;;
esac
```

---

## 6. Risk Management

### 6.1 Phase Risks

| Phase | Risk | Impact | Mitigation |
|---|---|---|---|
| **0** | Jan fork has moved significantly | High | Pin to specific tag, shallow fork |
| **0** | Tauri 2.x breaking changes | Medium | Pin to stable version, test weekly |
| **1a** | node-pty Windows issues | High | Test ConPTY first, fallback to cmd.exe |
| **1a** | xterm.js performance | Low | Max 4 terminals visible |
| **1b** | SQLite write contention | Low | Batch writes, debounce idle |
| **1b** | CrewAI sidecar fails to start | Medium | Auto-restart with backoff |
| **2** | Ollama not installed | Medium | Template fallback, prompt install |
| **2** | FTS5 search quality | Low | Acceptable for MVP, upgrade in Phase 3 |
| **3** | WebView2 not available | Medium | Detect, offer install, fallback to external |
| **3** | D3.js performance | Low | Virtualize, cap at 500 nodes |
| **4** | Installer signing cost | Low | Self-sign for dev, EV cert for production |
| **4** | E2E tests flaky | Medium | Retry logic, isolate from real PTY |

### 6.2 Risk Response Plan

```rust
struct RiskResponse {
    risk_id: String,
    phase: String,
    trigger: String,
    response: Vec<ResponseAction>,
}

enum ResponseAction {
    Retry { max_attempts: u32, delay: Duration },
    Fallback { alternative: String },
    Notify { message: String, severity: Severity },
    Block { reason: String },
    Escalate { to: String },
}
```

---

## 7. Progress Tracking

### 7.1 Phase Progress Dashboard

```tsx
const PhaseProgress: React.FC = () => {
  const phases = [
    { id: '0', name: 'Foundation', subPhases: 5, completed: 3, status: 'in-progress' },
    { id: '1a', name: 'Core', subPhases: 2, completed: 0, status: 'pending' },
    { id: '1b', name: 'Context', subPhases: 3, completed: 0, status: 'pending' },
    { id: '2', name: 'Enhanced', subPhases: 5, completed: 0, status: 'pending' },
    { id: '3', name: 'Advanced', subPhases: 5, completed: 0, status: 'pending' },
    { id: '4', name: 'Distribution', subPhases: 5, completed: 0, status: 'pending' },
  ];

  const totalSubPhases = phases.reduce((sum, p) => sum + p.subPhases, 0);
  const completedSubPhases = phases.reduce((sum, p) => sum + p.completed, 0);
  const progress = (completedSubPhases / totalSubPhases) * 100;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Project Progress</h3>
        <span className="text-sm text-zinc-400">
          {completedSubPhases}/{totalSubPhases} sub-phases ({progress.toFixed(0)}%)
        </span>
      </div>

      <Progress value={progress} />

      <div className="space-y-2">
        {phases.map(phase => (
          <div key={phase.id} className="flex items-center gap-3">
            <Badge variant={phase.status === 'in-progress' ? 'default' : 'secondary'}>
              {phase.id}
            </Badge>
            <span className="flex-1">{phase.name}</span>
            <span className="text-sm text-zinc-400">
              {phase.completed}/{phase.subPhases}
            </span>
            <StatusDot status={phase.status} />
          </div>
        ))}
      </div>
    </div>
  );
};
```

---

## Implementation Checklist

- [ ] Phase dependency map documented
- [ ] Gate validation checklists for all 6 gates
- [ ] Rollback procedures for each phase
- [ ] Parallel work opportunities identified
- [ ] Risk management plan for all phases
- [ ] Gate validation script
- [ ] Progress tracking dashboard
- [ ] Phase transition review process defined
