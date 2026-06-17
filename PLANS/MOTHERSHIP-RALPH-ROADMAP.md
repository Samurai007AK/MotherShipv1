# Mothership — Unified Implementation Roadmap: Ralph-Inspired Loop Engine

**Last Updated:** 2026-06-16
**Status:** Master Implementation Plan
**Scope:** Phased development roadmap for Mothership's autonomous loop engine
**Design Documents:** LOOPS.md, MOTHERSHIP-RALPH.md, AUTO-ARCHIVE.md, QUALITY-GATE.md

---

## Executive Summary

This document provides a unified, phased implementation roadmap for Mothership's Ralph-inspired loop engine. It ties together four design documents into a coherent development plan with clear milestones, dependencies, and deliverables.

**Total Estimated Effort:** 60-80 hours across 4 phases
**Core Deliverable:** An autonomous task execution engine that runs AI agents in loops until all tasks are complete

---

## Design Document Map

| Document | Scope | Key Components |
|----------|-------|----------------|
| `LOOPS.md` | Core loop architecture | LoopController, state machine, evaluation engine, retry manager |
| `MOTHERSHIP-RALPH.md` | Native Ralph implementation | Zustand store, terminal integration, prd.json sync, iteration protocol |
| `QUALITY-GATE.md` | Pre-commit validation | QualityGate, CommitGuard, error parsing, auto-detection |
| `AUTO-ARCHIVE.md` | Session archival | BranchDetector, ArchiveManager, restore system, UI components |

---

## Phase Overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    MOTHERSHIP-RALPH IMPLEMENTATION ROADMAP                  │
│                                                                            │
│  Phase 1: Core Loop Engine (20-25 hours)                                   │
│  ├── LoopController (Rust state machine)                                   │
│  ├── QualityGate (typecheck/test/lint validation)                          │
│  ├── CompletionDetector (multi-signal detection)                           │
│  └── Basic Zustand store                                                   │
│                                                                            │
│  Phase 2: Terminal Integration (15-20 hours)                               │
│  ├── Fresh PTY per iteration                                               │
│  ├── Output monitoring & signal detection                                  │
│  ├── prd.json sync (Ralph-compatible)                                      │
│  └── Loop progress UI                                                      │
│                                                                            │
│  Phase 3: Memory & Archival (10-15 hours)                                  │
│  ├── BranchDetector (git branch tracking)                                  │
│  ├── ArchiveManager (session archival)                                     │
│  ├── progress.txt & AGENTS.md sync                                         │
│  └── Archive UI (sidebar, diff viewer, restore)                            │
│                                                                            │
│  Phase 4: Polish & Integration (10-15 hours)                               │
│  ├── Error recovery & retry logic                                          │
│  ├── Human-in-the-loop support                                             │
│  ├── Metrics dashboard                                                     │
│  └── End-to-end testing                                                    │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Core Loop Engine

**Duration:** 20-25 hours
**Dependencies:** Phase 1a (Terminal Multiplexer) complete
**Gate:** Loop can run a simple task, execute quality gates, and detect completion

### 1.1 LoopController (Rust) — 8-10 hours

**Source:** `MOTHERSHIP-RALPH.md` + `LOOPS.md`

**Tasks:**
- [ ] Create `src-tauri/src/loop_controller/mod.rs`
- [ ] Implement `LoopConfig` struct with all configuration options
- [ ] Implement `LoopState` struct with status tracking
- [ ] Implement `LoopController::run()` main loop method
- [ ] Implement `should_stop()` with all stopping conditions
- [ ] Implement `pick_next_task()` for task selection
- [ ] Implement `run_iteration()` for single iteration execution
- [ ] Implement `build_iteration_prompt()` for Ralph-style prompts
- [ ] Add event emission for UI updates (`LoopEvent` enum)
- [ ] Add state persistence to SQLite

**Deliverables:**
- LoopController that can run iterations
- State machine with idle/running/paused/completed/failed/cancelled
- Event system for frontend notifications

### 1.2 QualityGate (Rust) — 6-8 hours

**Source:** `QUALITY-GATE.md`

**Tasks:**
- [ ] Create `src-tauri/src/quality_gate/mod.rs`
- [ ] Implement `QualityGateConfig` with typecheck/test/lint/build/custom gates
- [ ] Implement `GateCommand` struct for individual gate configuration
- [ ] Implement `QualityGate::run_all()` for sequential/parallel execution
- [ ] Implement `QualityGate::run_gate()` for single gate execution
- [ ] Implement error parsing (TypeScript, Rust, Python, Jest, pytest, ESLint, Clippy)
- [ ] Implement auto-detection for Node.js/Rust/Python projects
- [ ] Add timeout handling
- [ ] Create `CommitGuard` for pre-commit validation

**Deliverables:**
- QualityGate component that validates code before commit
- Auto-detection for common project types
- Parsed error output for UI display

### 1.3 CompletionDetector (Rust) — 2-3 hours

**Source:** `MOTHERSHIP-RALPH.md`

**Tasks:**
- [ ] Create `src-tauri/src/loop_controller/completion_detector.rs`
- [ ] Implement explicit signal detection (`<promise>COMPLETE</promise>`)
- [ ] Implement task completion detection (all tasks pass)
- [ ] Implement output-based completion detection
- [ ] Add configurable completion signals

**Deliverables:**
- Multi-signal completion detection
- Configurable completion criteria

### 1.4 Basic Zustand Store (TypeScript) — 4-5 hours

**Source:** `MOTHERSHIP-RALPH.md`

**Tasks:**
- [ ] Create `src/stores/loopStore.ts`
- [ ] Implement `LoopState` interface
- [ ] Implement `Task` and `IterationRecord` interfaces
- [ ] Implement `startLoop`, `pauseLoop`, `resumeLoop`, `cancelLoop` actions
- [ ] Implement `updateTaskStatus` with prd.json sync
- [ ] Implement `recordIteration` for history tracking
- [ ] Add subscriptions for auto-save to SQLite
- [ ] Add subscriptions for progress bar updates
- [ ] Add auto-pause on consecutive errors

**Deliverables:**
- Zustand store with real-time loop state
- prd.json synchronization
- Auto-save and progress tracking

### Phase 1 Gate Criteria

- [ ] LoopController runs iterations successfully
- [ ] QualityGate validates code before commit
- [ ] CompletionDetector detects task completion
- [ ] Zustand store tracks loop state in real-time
- [ ] Basic loop can complete a simple task

---

## Phase 2: Terminal Integration

**Duration:** 15-20 hours
**Dependencies:** Phase 1 complete
**Gate:** Loop runs in terminal with fresh sessions per iteration

### 2.1 Terminal Loop Integration (Rust) — 6-8 hours

**Source:** `MOTHERSHIP-RALPH.md`

**Tasks:**
- [ ] Create `src-tauri/src/terminal/iteration_session.rs`
- [ ] Implement `IterationSession::spawn()` for fresh PTY creation
- [ ] Implement `write_input()` for sending prompts
- [ ] Implement `read_output()` with timeout
- [ ] Implement output buffer management
- [ ] Add completion signal detection in output
- [ ] Add error pattern detection in output
- [ ] Add user input needed detection

**Deliverables:**
- Fresh terminal session per iteration
- Output monitoring and signal detection
- Error and user input detection

### 2.2 Output Parsing (Rust) — 4-5 hours

**Source:** `QUALITY-GATE.md` + `MOTHERSHIP-RALPH.md`

**Tasks:**
- [ ] Implement tool usage detection from output
- [ ] Implement file modification detection from output
- [ ] Implement learning extraction from output
- [ ] Implement pattern extraction from progress.txt
- [ ] Add terminal scrollback capture

**Deliverables:**
- Automated output parsing
- Learning extraction for progress.txt
- Pattern extraction for AGENTS.md

### 2.3 Loop Progress UI (React) — 5-7 hours

**Source:** `MOTHERSHIP-RALPH.md`

**Tasks:**
- [ ] Create `src/components/loop/LoopProgressPanel.tsx`
- [ ] Implement progress bar with percentage
- [ ] Implement iteration history timeline
- [ ] Implement current task display
- [ ] Implement current action display
- [ ] Implement error warning display
- [ ] Add Pause/Resume/Cancel controls
- [ ] Add Retry button on failure
- [ ] Create `src/components/loop/TaskList.tsx`
- [ ] Implement task list with status indicators
- [ ] Implement task priority display

**Deliverables:**
- Real-time loop progress panel
- Task list with status indicators
- Interactive controls

### Phase 2 Gate Criteria

- [ ] Loop runs in terminal with fresh sessions
- [ ] Output is monitored for completion/error signals
- [ ] Loop progress is displayed in real-time
- [ ] Tasks are tracked with status indicators
- [ ] User can pause/resume/cancel loops

---

## Phase 3: Memory & Archival

**Duration:** 10-15 hours
**Dependencies:** Phase 2 complete
**Gate:** Sessions are archived on branch change, progress is preserved

### 3.1 BranchDetector (Rust) — 3-4 hours

**Source:** `AUTO-ARCHIVE.md`

**Tasks:**
- [ ] Create `src-tauri/src/archive/branch_detector.rs`
- [ ] Implement `get_current_branch()` using git command
- [ ] Implement `get_last_branch()` from .last-branch file
- [ ] Implement `set_last_branch()` to update tracking file
- [ ] Implement `has_branch_changed()` for change detection
- [ ] Implement `extract_feature_name()` from branch names
- [ ] Add `.mothership/.last-branch` file management

**Deliverables:**
- Git branch change detection
- Feature name extraction
- Branch tracking persistence

### 3.2 ArchiveManager (Rust) — 4-5 hours

**Source:** `AUTO-ARCHIVE.md`

**Tasks:**
- [ ] Create `src-tauri/src/archive/mod.rs`
- [ ] Implement `archive_current_session()` for full session archival
- [ ] Implement `collect_session_data()` to gather prd.json, progress.txt, loop state
- [ ] Implement `write_archive_files()` to write archive directory
- [ ] Implement `update_archive_index()` to maintain index.json
- [ ] Implement `clear_current_session()` to reset progress for new feature
- [ ] Implement `restore_archive()` for session restoration
- [ ] Implement `delete_archive()` for cleanup
- [ ] Add manifest.json creation with metadata

**Deliverables:**
- Automatic session archival
- Archive with manifest and index
- Session restoration capability

### 3.3 Memory Sync (Rust + TypeScript) — 2-3 hours

**Source:** `MOTHERSHIP-RALPH.md`

**Tasks:**
- [ ] Implement progress.txt append after each iteration
- [ ] Implement AGENTS.md update with discovered patterns
- [ ] Implement prd.json sync with task completion status
- [ ] Add pattern extraction from iteration output
- [ ] Add learning extraction for future iterations

**Deliverables:**
- Automatic progress.txt updates
- AGENTS.md pattern propagation
- prd.json task completion sync

### 3.4 Archive UI (React) — 3-4 hours

**Source:** `AUTO-ARCHIVE.md`

**Tasks:**
- [ ] Create `src/components/archive/ArchiveSidebar.tsx`
- [ ] Implement archive list with status indicators
- [ ] Implement archive now button
- [ ] Create `src/components/archive/ArchiveDiffViewer.tsx`
- [ ] Implement task diff display (added/removed/completed)
- [ ] Implement iteration count display
- [ ] Create `src/components/archive/RestoreDialog.tsx`
- [ ] Implement restore confirmation dialog
- [ ] Create Zustand archive store

**Deliverables:**
- Archive sidebar with list
- Archive diff viewer
- Restore confirmation dialog

### Phase 3 Gate Criteria

- [ ] Sessions are archived on branch change
- [ ] Archive includes prd.json, progress.txt, loop state
- [ ] Archive index is maintained
- [ ] Sessions can be restored from archive
- [ ] Progress.txt is updated after each iteration
- [ ] AGENTS.md is updated with patterns

---

## Phase 4: Polish & Integration

**Duration:** 10-15 hours
**Dependencies:** Phase 3 complete
**Gate:** Full loop engine works end-to-end with error recovery

### 4.1 Error Recovery (Rust) — 3-4 hours

**Source:** `LOOPS.md` + `MOTHERSHIP-RALPH.md`

**Tasks:**
- [ ] Implement retry logic with exponential backoff
- [ ] Implement fallback actions (search alternative, ask user, simplify scope)
- [ ] Implement common error recovery (ModuleNotFoundError, Cannot find module)
- [ ] Add error classification and routing
- [ ] Add error history tracking

**Deliverables:**
- Automatic error recovery
- Retry with backoff
- Fallback action support

### 4.2 Human-in-the-Loop (Rust + React) — 2-3 hours

**Source:** `LOOPS.md`

**Tasks:**
- [ ] Implement pause for user input detection
- [ ] Implement user input forwarding to terminal
- [ ] Add approval gates for sensitive operations
- [ ] Create user input dialog UI

**Deliverables:**
- Pause for user input
- Approval gates
- User input forwarding

### 4.3 Metrics Dashboard (React) — 2-3 hours

**Source:** `LOOPS.md` + `QUALITY-GATE.md`

**Tasks:**
- [ ] Create `src/components/loop/MetricsDashboard.tsx`
- [ ] Implement iteration count and duration display
- [ ] Implement success rate display
- [ ] Implement quality gate pass/fail history
- [ ] Implement file modification history
- [ ] Add export to JSON/CSV

**Deliverables:**
- Metrics dashboard with key indicators
- Historical data display
- Export capability

### 4.4 End-to-End Testing — 3-5 hours

**Source:** `TESTING-STRATEGY.md`

**Tasks:**
- [ ] Create integration tests for LoopController
- [ ] Create integration tests for QualityGate
- [ ] Create integration tests for ArchiveManager
- [ ] Create E2E test for complete loop execution
- [ ] Test error recovery scenarios
- [ ] Test archival and restore scenarios
- [ ] Performance testing with large task lists

**Deliverables:**
- Integration test suite
- E2E test for complete workflow
- Performance benchmarks

### Phase 4 Gate Criteria

- [ ] Error recovery works automatically
- [ ] User can approve sensitive operations
- [ ] Metrics are displayed and trackable
- [ ] All tests pass
- [ ] Performance is acceptable

---

## Implementation Dependencies

```
Phase 1: Core Loop Engine
├── 1.1 LoopController (Rust)
├── 1.2 QualityGate (Rust)
├── 1.3 CompletionDetector (Rust)
└── 1.4 Basic Zustand Store (TypeScript)

Phase 2: Terminal Integration (depends on Phase 1)
├── 2.1 Terminal Loop Integration (Rust)
├── 2.2 Output Parsing (Rust)
└── 2.3 Loop Progress UI (React)

Phase 3: Memory & Archival (depends on Phase 2)
├── 3.1 BranchDetector (Rust)
├── 3.2 ArchiveManager (Rust)
├── 3.3 Memory Sync (Rust + TypeScript)
└── 3.4 Archive UI (React)

Phase 4: Polish & Integration (depends on Phase 3)
├── 4.1 Error Recovery (Rust)
├── 4.2 Human-in-the-Loop (Rust + React)
├── 4.3 Metrics Dashboard (React)
└── 4.4 End-to-End Testing
```

---

## Integration Points

### With Existing Mothership Components

| Component | Integration Point | Phase |
|-----------|-------------------|-------|
| **Terminal Multiplexer** (Phase 1a) | Spawn fresh PTY per iteration | Phase 2 |
| **Memory Layer** (Phase 1b) | Store loop metrics, iteration history | Phase 1 |
| **Zustand Stores** (Phase 0) | Loop state, archive state | Phase 1 |
| **Tauri IPC** (Phase 0) | Loop commands, archive commands | Phase 1 |
| **CrewAI Sidecar** (Phase 1b) | Multi-agent loop orchestration | Phase 4 |
| **Quality Gates** | Pre-commit validation | Phase 1 |

### With Ralph's File Format

| Ralph File | Mothership Location | Sync Direction |
|------------|---------------------|----------------|
| `prd.json` | Project root | Bi-directional |
| `progress.txt` | Project root | Append-only |
| `AGENTS.md` | Directory-specific | Append-only |
| `.last-branch` | `.mothership/.last-branch` | Read/write |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Terminal PTY issues on Windows | Medium | High | Test ConPTY path first; fallback to basic cmd.exe |
| Quality gate timeout on large projects | Medium | Medium | Configurable timeout; parallel execution |
| Archive corruption | Low | High | Integrity checks; backup before archive |
| Context window overflow in iterations | Low | Medium | Fresh context per iteration; small tasks |
| Error recovery causing infinite loops | Medium | High | Max retry limits; exponential backoff |

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Task Completion Rate** | >90% | Tasks completed / tasks attempted |
| **Quality Gate Pass Rate** | >95% | Iterations passing gates / total iterations |
| **Error Recovery Rate** | >80% | Recovered errors / total errors |
| **Archive Success Rate** | 100% | Successful archives / archive attempts |
| **Average Iteration Time** | <60 seconds | Total time / iteration count |
| **User Satisfaction** | >4/5 | Survey after loop completion |

---

## References

### Design Documents
- [`LOOPS.md`](./LOOPS.md) — Core loop architecture and patterns
- [`MOTHERSHIP-RALPH.md`](./MOTHERSHIP-RALPH.md) — Native Ralph implementation
- [`QUALITY-GATE.md`](./QUALITY-GATE.md) — Pre-commit validation system
- [`AUTO-ARCHIVE.md`](./AUTO-ARCHIVE.md) — Session archival system

### Existing Mothership Plans
- [`PHASE-0-FOUNDATION.md`](./PHASE-0-FOUNDATION.md) — Foundation phase
- [`PHASE-1A-CORE.md`](./PHASE-1A-CORE.md) — Terminal multiplexer
- [`PHASE-1B-CONTEXT.md`](./PHASE-1B-CONTEXT.md) — Memory layer
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — System architecture

### External References
- [Ralph GitHub](https://github.com/snarktank/ralph) — Original implementation
- [Geoffrey Huntley's Ralph article](https://ghuntley.com/ralph/) — Pattern explanation
- [CrewAI Flows](https://docs.crewai.com/concepts/flows) — Multi-agent orchestration

---

*Last updated: 2026-06-16*
