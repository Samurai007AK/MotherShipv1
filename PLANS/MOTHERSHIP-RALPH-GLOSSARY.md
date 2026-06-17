# Mothership — Ralph-Loop Type Glossary

**Last Updated:** 2026-06-16
**Status:** Canonical Reference
**Scope:** Single source of truth for all type definitions used across Ralph-loop documents

---

## Purpose

This document defines the **canonical type definitions** for Mothership's Ralph-inspired loop engine. All other Ralph-loop documents (`LOOPS.md`, `MOTHERSHIP-RALPH.md`, `QUALITY-GATE.md`, `AUTO-ARCHIVE.md`, `UNIFIED-STORE.md`) should reference these types rather than redefining them.

**Rules:**
1. If a type is defined here, use this definition — don't redefine it elsewhere
2. If a document needs a simplified version, alias it and note the canonical source
3. Add new types here first, then reference from implementation documents
4. Keep TypeScript and Rust variants in sync

---

## TypeScript Types (Frontend / Zustand Stores)

### Task

**Source:** `prd.json` user stories — the fundamental unit of work in a loop.

```typescript
export interface Task {
  id: string                      // e.g., "US-001"
  title: string                   // Short description
  description: string             // Full story description
  acceptanceCriteria: string[]    // Definition of done
  priority: number                // Lower = higher priority (1 = highest)
  passes: boolean                 // Whether this task is complete
  notes: string                   // Free-form notes
  iterationCompleted?: number     // Which iteration completed this task
  filesModified?: string[]        // Files changed during implementation
}
```

**Used in:** `useLoopStore`, `ArchiveManager`, `prd.json`
**Rust equivalent:** `loop_controller::Task`

---

### IterationRecord

**Source:** A single iteration of the agentic loop — the core execution unit.

```typescript
export interface IterationRecord {
  iteration: number               // 1-based iteration index
  taskId: string                  // Which Task was being worked on
  action: string                  // Human-readable description of what was done
  result: string                  // Output/observation from the iteration
  durationMs: number              // How long the iteration took
  timestamp: Date                 // When the iteration ran
  success: boolean                // Whether the iteration succeeded
  filesModified: string[]         // Files changed in this iteration
  toolsUsed: string[]             // Tools invoked (e.g., "typescript", "git", "terminal")
  learnings: string[]             // Patterns/gotchas discovered
  gateReportId?: string           // Links to QualityGateReport (if gates ran)
}
```

**Used in:** `useLoopStore.iterations`, `LoopController.history`, `ArchiveManager`
**Rust equivalent:** `loop_controller::IterationRecord`
**Abstract reference (LOOPS.md):** Uses `action: Action` and `observation: string` — this is the concrete version.

---

### LoopConfig

**Source:** Configuration for starting a new loop execution.

```typescript
export interface LoopConfig {
  agentId: string                 // Which AI agent to use (e.g., "claude", "codex")
  projectPath: string             // Root directory of the project
  maxIterations: number           // Safety limit (default: 20)
  timeoutMs: number               // Max total time (default: 300000 = 5 min)
  qualityGateCommands: {          // Commands to run as quality gates
    typecheck?: string            // e.g., "npx tsc --noEmit"
    test?: string                 // e.g., "npm test"
    lint?: string                 // e.g., "npx eslint ."
  }
  autoCommit: boolean             // Whether to auto-commit after quality gates pass
  syncToAgentsMd: boolean         // Whether to update AGENTS.md with learnings
  autoArchive: boolean            // Whether to archive on completion
}
```

**Used in:** `useLoopStore.startLoop()`, `LoopController`
**Rust equivalent:** `loop_controller::LoopConfig` (with `quality_gate_commands: QualityGateCommands`)
**Abstract reference (LOOPS.md):** Includes additional fields `id`, `task`, `evaluationStrategy`, `stopConditions`, `retryPolicy` — these are conceptual and not yet implemented.

---

### LoopMetrics

**Source:** Aggregate metrics for a completed or running loop.

```typescript
export interface LoopMetrics {
  totalIterations: number         // Total iterations executed
  totalTimeMs: number             // Total wall-clock time
  avgIterationMs: number          // Average iteration duration
  successRate: number             // 0.0 to 1.0 (successful iterations / total)
  tasksCompleted: number          // Tasks where passes === true
  tasksTotal: number              // Total tasks in prd.json
  errorsEncountered: number       // Total errors encountered
  recoveriesAttempted: number     // Recovery attempts
  recoveriesSuccessful: number    // Successful recoveries
}
```

**Used in:** `useLoopStore`, `LoopController`, SQLite persistence
**Rust equivalent:** `loop_controller::LoopMetrics`

---

### LoopStatus

**Source:** The status enum for loop lifecycle.

```typescript
export type LoopStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
```

**Used in:** `useLoopStore.status`, `LoopController.state`
**Rust equivalent:** `loop_controller::LoopStatus` (enum: Idle, Running, Paused, Completed, Failed, Cancelled)

---

### GateCommand

**Source:** Configuration for a single quality gate command.

```typescript
export interface GateCommand {
  id: string                      // Unique identifier (e.g., "typecheck", "test", "lint")
  name: string                    // Human-readable name (e.g., "TypeScript Check")
  command: string                 // Shell command to run
  workingDirectory?: string       // Relative to project root
  envVars: Record<string, string> // Environment variables
  enabled: boolean                // Whether this gate is active
  blocking: boolean               // Whether failure blocks commit
}
```

**Used in:** `QualityGateConfig`, `useQualityGateStore`
**Rust equivalent:** `quality_gate::GateCommand`

---

### GateResult

**Source:** Result of running a single quality gate command.

```typescript
export interface GateResult {
  gateId: string                  // Which gate this result is for
  gateName: string                // Human-readable gate name
  passed: boolean                 // Whether the gate passed
  exitCode: number                // Process exit code
  stdout: string                  // Standard output
  stderr: string                  // Standard error
  durationMs: number              // How long the gate took
  startedAt: Date                 // When the gate started
  completedAt: Date               // When the gate completed
  errorMessage: string | null     // Human-readable error (if failed)
  parsedErrors: ParsedError[]     // Structured errors for UI display
}
```

**Used in:** `QualityGateReport.results`, `useQualityGateStore`
**Rust equivalent:** `quality_gate::GateResult`
**Note:** This is the per-gate result. Do not confuse with `QualityGateSummary`.

---

### QualityGateReport

**Source:** Combined result of all quality gates in a single run.

```typescript
export interface QualityGateReport {
  id: string                      // Unique report identifier
  loopId: string | null           // Associated loop (if any)
  passed: boolean                 // Overall pass/fail (all gates passed)
  results: GateResult[]           // Individual gate results
  totalDurationMs: number         // Total time for all gates
  gatesPassed: number             // Count of passed gates
  gatesFailed: number             // Count of failed gates
  gatesSkipped: number            // Count of skipped/disabled gates
  commitAllowed: boolean          // Whether git commit is allowed
  summary: string                 // Human-readable summary
  timestamp: Date                 // When the report was generated
}
```

**Used in:** `useQualityGateStore.currentReport`, `CommitGuard`
**Rust equivalent:** `quality_gate::QualityGateReport`
**Note:** Contains `Vec<GateResult>` — one per gate.

---

### QualityGateSummary

**Source:** Simplified gate result for LoopController internal use.

```typescript
export interface QualityGateSummary {
  passed: boolean                 // Overall pass/fail
  results: CommandResult[]        // Simplified results (no parsed errors)
}

export interface CommandResult {
  command: string                 // The command that was run
  success: boolean                // Whether it succeeded
  output: string                  // Combined stdout + stderr
  durationMs: number              // How long it took
}
```

**Used in:** `LoopController.runIteration()` internal logic
**Rust equivalent:** `loop_controller::QualityGateSummary`
**Note:** This is a simplified version of `QualityGateReport`. The LoopController uses this internally; the full `QualityGateReport` is used for UI display and metrics.

---

### ParsedError

**Source:** A structured error parsed from quality gate output.

```typescript
export interface ParsedError {
  file: string                    // File path (may be empty for generic errors)
  line: number                    // Line number (0 if unknown)
  column: number                  // Column number (0 if unknown)
  message: string                 // Error message
  severity: 'Error' | 'Warning' | 'Info'
  code: string | null             // Error code (e.g., "TS2322", "E0308")
}
```

**Used in:** `GateResult.parsedErrors`
**Rust equivalent:** `quality_gate::ParsedError`

---

### QualityGateConfig

**Source:** Configuration for the quality gate system.

```typescript
export interface QualityGateConfig {
  typecheck: GateCommand | null   // Type checking gate
  test: GateCommand | null        // Test execution gate
  lint: GateCommand | null        // Linting gate
  build: GateCommand | null       // Build gate
  custom: GateCommand[]           // User-defined gates
  timeoutSeconds: number          // Max time for all gates (default: 120)
  failFast: boolean               // Stop on first failure (default: true)
  parallel: boolean               // Run gates in parallel (default: false)
}
```

**Used in:** `useQualityGateStore.config`, `QualityGate`
**Rust equivalent:** `quality_gate::QualityGateConfig`

---

### ArchiveManifest

**Source:** Metadata for an archived session.

```typescript
export interface ArchiveManifest {
  id: string                      // UUID
  projectId: string               // Project directory name
  branchName: string              // Git branch at archive time
  featureName: string             // Extracted from branch name
  createdAt: Date                 // When the session started
  archivedAt: Date                // When it was archived
  status: 'InProgress' | 'Completed' | 'Failed' | 'Cancelled'
  iterationCount: number          // Total iterations in the session
  tasksCompleted: number          // Tasks with passes === true
  tasksTotal: number              // Total tasks at archive time
  durationMs: number              // Session duration
  filesArchived: string[]         // Files saved to archive
  tags: string[]                  // User-defined tags
}
```

**Used in:** `useArchiveStore.archives`, `ArchiveManager`, `index.json`
**Rust equivalent:** `archive::ArchiveManifest`

---

### ArchiveEntry

**Source:** An archive entry with path and size information.

```typescript
export interface ArchiveEntry {
  id: string                      // Same as manifest.id
  manifest: ArchiveManifest       // Full manifest
  path: string                    // Filesystem path to archive directory
  sizeKb: number                  // Archive size in kilobytes
}
```

**Used in:** `useArchiveStore.archives`, `ArchiveManager`
**Rust equivalent:** `archive::ArchiveEntry`

---

### BranchChange

**Source:** Result of checking for git branch changes.

```typescript
export type BranchChange =
  | { type: 'no_change' }
  | { type: 'changed'; from: string; to: string }
  | { type: 'initial'; branch: string }
  | { type: 'detached' }
```

**Used in:** `BranchDetector.has_branch_changed()`
**Rust equivalent:** `archive::BranchChange` (enum: NoChange, Changed, Initial, Detached)

---

### LoopEvent

**Source:** Events emitted by the LoopController for UI updates.

```typescript
export type LoopEvent =
  | { type: 'iteration_started'; iteration: number; taskId: string }
  | { type: 'iteration_completed'; iteration: number; success: boolean }
  | { type: 'task_completed'; taskId: string }
  | { type: 'loop_completed'; totalIterations: number }
  | { type: 'error'; message: string }
  | { type: 'progress_update'; progress: number }
  | { type: 'session_archived'; archiveId: string }
```

**Used in:** `LoopController.event_sender`, frontend event listeners
**Rust equivalent:** `loop_controller::LoopEvent` (enum)

---

## Rust Types (Backend / Tauri)

These mirror the TypeScript types above. See the canonical Rust implementations in:

- `src-tauri/src/loop_controller/mod.rs` — `LoopConfig`, `LoopState`, `LoopStatus`, `Task`, `IterationRecord`, `LoopResult`, `LoopError`, `LoopEvent`
- `src-tauri/src/loop_controller/quality_gate.rs` — `QualityGateCommands` (simplified gate config)
- `src-tauri/src/quality_gate/mod.rs` — `QualityGateConfig`, `GateCommand`, `GateResult`, `QualityGateReport`, `ParsedError`, `QualityGateError`
- `src-tauri/src/archive/mod.rs` — `ArchiveManager`, `ArchiveManifest`, `ArchiveEntry`, `ArchiveStatus`, `ArchiveError`
- `src-tauri/src/archive/branch_detector.rs` — `BranchDetector`, `BranchChange`

### QualityGateCommands (Rust — Simplified)

```rust
/// Simplified quality gate config for LoopController integration.
/// See quality_gate::QualityGateConfig for the full version.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QualityGateCommands {
    pub typecheck: Option<String>,
    pub test: Option<String>,
    pub lint: Option<String>,
}
```

**Note:** The full `QualityGateConfig` in `quality_gate/mod.rs` includes `build`, `custom`, `timeout_seconds`, `fail_fast`, and `parallel` fields. `QualityGateCommands` is a simplified subset used by `LoopController`.

---

## Data Schemas

### prd.json

**Source:** Ralph-compatible task list format.

```json
{
  "project": "MyApp",
  "branchName": "ralph/task-priority",
  "description": "Task Priority System",
  "userStories": [
    {
      "id": "US-001",
      "title": "Add priority field to database",
      "description": "As a developer, I need to store task priority.",
      "acceptanceCriteria": [
        "Add priority column to tasks table",
        "Generate and run migration successfully",
        "Typecheck passes"
      ],
      "priority": 1,
      "passes": false,
      "notes": ""
    }
  ]
}
```

**TypeScript mapping:** `prd.json` → `Task[]` (via `loadPrdJson()`)
**Files:** `lib/ralph-sync.ts`, `loop_controller/mod.rs::load_prd_json()`

---

### progress.txt

**Source:** Append-only learnings log shared across iterations.

```markdown
## Codebase Patterns
- Use `sql<number>` template for aggregations
- Always use `IF NOT EXISTS` for migrations
- Export types from actions.ts for UI components

---

## 2026-06-16 14:30 - US-001
- Added priority column to tasks table
- Files changed: migrations/001.sql, schema.ts
- **Learnings for future iterations:**
  - This codebase uses Drizzle ORM for migrations
  - Don't forget to update the seed file when changing schema
---
```

**Update pattern:** Append-only. New entries added after each iteration.
**Read pattern:** First section (`## Codebase Patterns`) is read at the start of each iteration.

---

### .last-branch

**Source:** Simple text file tracking the last known git branch.

```
feature/login
```

**Location:** `.mothership/.last-branch`
**Update pattern:** Written when archiving, read on each branch check.
**Purpose:** Detect branch changes to trigger auto-archive.

---

### manifest.json

**Source:** Archive metadata file.

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "project_id": "my-app",
  "branch_name": "feature/login",
  "feature_name": "login",
  "created_at": "2026-06-16T10:30:00Z",
  "archived_at": "2026-06-16T14:30:22Z",
  "status": "Completed",
  "iteration_count": 8,
  "tasks_completed": 4,
  "tasks_total": 4,
  "duration_ms": 14400000,
  "files_archived": ["prd.json", "progress.txt", "loop-state.json"],
  "tags": ["feature", "auth"]
}
```

**TypeScript mapping:** `ArchiveManifest`

---

## Type Relationships

```
prd.json ──────loadPrdJson()──────▶ Task[]
                                        │
                                        ▼
LoopConfig ────startLoop()───────▶ useLoopStore
                                        │
                                        ▼
                                 IterationRecord[]
                                        │
                         ┌───────────────┼───────────────┐
                         ▼               ▼               ▼
                   GateResult    QualityGateSummary  LoopMetrics
                         │               │
                         ▼               ▼
                   QualityGateReport ◄──┘
                         │
                         ▼
                   gateReportId ──▶ IterationRecord.gateReportId

BranchDetector ──has_branch_changed()──▶ BranchChange
                         │
                         ▼
                   ArchiveManager ──archive_current_session()──▶ ArchiveEntry
                         │                                              │
                         ▼                                              ▼
                   manifest.json                                  index.json
                   progress.txt
                   loop-state.json
                   prd.json
```

---

## Cross-Reference Matrix

| Type | Canonical Source | Also Referenced In |
|------|-----------------|-------------------|
| `Task` | This glossary | MOTHERSHIP-RALPH.md, UNIFIED-STORE.md, AUTO-ARCHIVE.md |
| `IterationRecord` | This glossary | UNIFIED-STORE.md, MOTHERSHIP-RALPH.md |
| `LoopConfig` | This glossary | UNIFIED-STORE.md, MOTHERSHIP-RALPH.md |
| `LoopMetrics` | This glossary | UNIFIED-STORE.md |
| `LoopStatus` | This glossary | UNIFIED-STORE.md, MOTHERSHIP-RALPH.md |
| `GateCommand` | This glossary | QUALITY-GATE.md, UNIFIED-STORE.md |
| `GateResult` | This glossary | QUALITY-GATE.md, UNIFIED-STORE.md |
| `QualityGateReport` | This glossary | QUALITY-GATE.md, UNIFIED-STORE.md |
| `QualityGateSummary` | This glossary | MOTHERSHIP-RALPH.md |
| `ParsedError` | This glossary | QUALITY-GATE.md, UNIFIED-STORE.md |
| `QualityGateConfig` | This glossary | QUALITY-GATE.md, UNIFIED-STORE.md |
| `ArchiveManifest` | This glossary | AUTO-ARCHIVE.md, UNIFIED-STORE.md |
| `ArchiveEntry` | This glossary | AUTO-ARCHIVE.md, UNIFIED-STORE.md |
| `BranchChange` | This glossary | AUTO-ARCHIVE.md |
| `LoopEvent` | This glossary | MOTHERSHIP-RALPH.md |

---

## Naming Conventions

| Concept | TypeScript | Rust | Notes |
|---------|-----------|------|-------|
| Loop status | `LoopStatus` (string union) | `LoopStatus` (enum) | Matches |
| Gate result (per-gate) | `GateResult` | `GateResult` | Canonical — includes parsed errors |
| Gate result (summary) | `QualityGateSummary` | `QualityGateSummary` | Simplified — LoopController internal |
| Gate result (combined) | `QualityGateReport` | `QualityGateReport` | Contains `Vec<GateResult>` |
| Archive status | `string literal` | `ArchiveStatus` (enum) | Keep in sync |
| Event types | discriminated union | enum with data | TS uses `{ type: '...' }`, Rust uses `Event::Variant { ... }` |

---

## References

- [`UNIFIED-STORE.md`](./UNIFIED-STORE.md) — Zustand store implementations using these types
- [`MOTHERSHIP-RALPH.md`](./MOTHERSHIP-RALPH.md) — Rust LoopController, QualityGate, CompletionDetector
- [`QUALITY-GATE.md`](./QUALITY-GATE.md) — Quality gate system with error parsing
- [`AUTO-ARCHIVE.md`](./AUTO-ARCHIVE.md) — Archive system with branch detection
- [`LOOPS.md`](./LOOPS.md) — Abstract loop architecture (uses conceptual types)
- [`MOTHERSHIP-RALPH-ROADMAP.md`](./MOTHERSHIP-RALPH-ROADMAP.md) — Implementation roadmap

---

*Last updated: 2026-06-16*
