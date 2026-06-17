# Mothership — Tauri IPC Command Reference

**Last Updated:** 2026-06-16
**Status:** Reference
**Scope:** All Tauri IPC commands for the Ralph-loop system
**Rust source:** `src-tauri/src/commands/`

---

## Overview

This document catalogs every Tauri IPC command that bridges the React frontend (Zustand stores) with the Rust backend (LoopController, QualityGate, ArchiveManager). Each command includes its request parameters, response type, and the Zustand store action that invokes it.

---

## Loop Commands

**Source:** `src-tauri/src/commands/loop_commands.rs`

### `start_loop`

Start a new autonomous loop execution.

| Field | Type | Description |
|-------|------|-------------|
| **Request** | | |
| `loop_id` | `string` | Client-generated loop identifier |
| `config` | `LoopConfig` | Loop configuration (agent, project, gates, limits) |
| **Response** | `void` | |
| **Store action** | `useLoopStore.startLoop()` | |
| **State transition** | `idle → running` | |

```typescript
// LoopConfig (TypeScript)
interface LoopConfig {
  agentId: string
  projectPath: string
  maxIterations: number
  timeoutMs: number
  qualityGateCommands: { typecheck?: string; test?: string; lint?: string }
  autoCommit: boolean
  syncToAgentsMd: boolean
  autoArchive: boolean
}
```

---

### `pause_loop`

Pause a running loop at the next iteration boundary.

| Field | Type | Description |
|-------|------|-------------|
| **Request** | | |
| `loop_id` | `string` | Loop to pause |
| **Response** | `void` | |
| **Store action** | `useLoopStore.pauseLoop()` | |
| **State transition** | `running → paused` | |

---

### `resume_loop`

Resume a paused loop from where it left off.

| Field | Type | Description |
|-------|------|-------------|
| **Request** | | |
| `loop_id` | `string` | Loop to resume |
| **Response** | `void` | |
| **Store action** | `useLoopStore.resumeLoop()` | |
| **State transition** | `paused → running` | |

---

### `cancel_loop`

Cancel a running or paused loop. Returns partial results.

| Field | Type | Description |
|-------|------|-------------|
| **Request** | | |
| `loop_id` | `string` | Loop to cancel |
| **Response** | `void` | |
| **Store action** | `useLoopStore.cancelLoop()` | |
| **State transition** | `running/paused → cancelled` | |

---

### `get_loop_state`

Get the current state of a running loop.

| Field | Type | Description |
|-------|------|-------------|
| **Request** | | |
| `loop_id` | `string` | Loop to query |
| **Response** | `LoopState \| null` | Full loop state including iterations |
| **Store action** | Direct state sync | |

---

### `retry_loop`

Retry a failed loop from a specific iteration.

| Field | Type | Description |
|-------|------|-------------|
| **Request** | | |
| `loop_id` | `string` | Loop to retry |
| `from_iteration` | `number` | Iteration to restart from |
| **Response** | `void` | |
| **Store action** | `useLoopStore.retryFromIteration()` | |
| **State transition** | `failed → running` | |

---

### `save_loop_metrics`

Persist loop metrics to SQLite. (Frontend subscription — invoked by Zustand store, not a Tauri command.)

| Field | Type | Description |
|-------|------|-------------|
| **Request** | | |
| `loop_id` | `string` | Loop identifier |
| `iterations` | `IterationRecord[]` | All iteration records |
| **Response** | `void` | |
| **Trigger** | Auto-subscription (every 5s) | |

---

## Quality Gate Commands

**Source:** `src-tauri/src/commands/quality_gate_commands.rs`

### `run_quality_gates`

Run all configured quality gates and return the report.

| Field | Type | Description |
|-------|------|-------------|
| **Request** | | |
| `config` | `QualityGateConfig` | Gate configuration (typecheck, test, lint, build, custom) |
| `project_path` | `string` | Project root directory |
| **Response** | `QualityGateReport` | Full report with per-gate results |
| **Store action** | `useQualityGateStore.runQualityGates()` | |

```typescript
// QualityGateConfig (TypeScript)
interface QualityGateConfig {
  typecheck: GateCommand | null
  test: GateCommand | null
  lint: GateCommand | null
  build: GateCommand | null
  custom: GateCommand[]
  timeoutSeconds: number
  failFast: boolean
  parallel: boolean
}

// QualityGateReport (response)
interface QualityGateReport {
  id: string
  loopId: string | null
  passed: boolean
  results: GateResult[]
  totalDurationMs: number
  gatesPassed: number
  gatesFailed: number
  gatesSkipped: number
  commitAllowed: boolean
  summary: string
  timestamp: Date
}
```

---

### `auto_detect_quality_gate_config`

Auto-detect quality gate configuration from project files (package.json, Cargo.toml, pyproject.toml).

| Field | Type | Description |
|-------|------|-------------|
| **Request** | | |
| `project_path` | `string` | Project root directory |
| **Response** | `QualityGateConfig` | Detected configuration |
| **Store action** | `useQualityGateStore.autoDetectConfig()` | |

---

### `save_gate_metrics`

Persist gate metrics to SQLite. (Frontend subscription — invoked by Zustand store, not a Tauri command.)

| Field | Type | Description |
|-------|------|-------------|
| **Request** | | |
| `report_id` | `string` | Report identifier |
| `metrics` | `object` | Duration, pass/fail counts, commitAllowed |
| **Response** | `void` | |
| **Trigger** | Auto-subscription on report change | |

---

## Archive Commands

**Source:** `src-tauri/src/commands/archive_commands.rs`

### `check_branch_change`

Check if the git branch has changed since the last recorded branch.

| Field | Type | Description |
|-------|------|-------------|
| **Request** | | (none) |
| **Response** | `boolean` | `true` if branch changed |
| **Store action** | `useArchiveStore.checkBranchChange()` | |

---

### `archive_current_session`

Archive the current session (prd.json, progress.txt, loop state, terminal snapshots).

| Field | Type | Description |
|-------|------|-------------|
| **Request** | | (none — uses current branch) |
| **Response** | `ArchiveEntry` | Created archive entry |
| **Store action** | `useArchiveStore.archiveSession()` | |

```typescript
// ArchiveEntry (response)
interface ArchiveEntry {
  id: string
  manifest: ArchiveManifest
  path: string
  sizeKb: number
}
```

---

### `list_archives`

List all archived sessions.

| Field | Type | Description |
|-------|------|-------------|
| **Request** | | (none) |
| **Response** | `ArchiveEntry[]` | All archive entries, newest first |
| **Store action** | `useArchiveStore.loadArchives()` | |

---

### `restore_archive`

Restore an archived session to the project directory.

| Field | Type | Description |
|-------|------|-------------|
| **Request** | | |
| `archive_id` | `string` | Archive to restore |
| **Response** | `void` | |
| **Store action** | `useArchiveStore.restoreArchive()` | |

---

### `delete_archive`

Delete an archive permanently.

| Field | Type | Description |
|-------|------|-------------|
| **Request** | | |
| `archive_id` | `string` | Archive to delete |
| **Response** | `void` | |
| **Store action** | `useArchiveStore.deleteArchive()` | |

---

### `get_archive_diff`

Get the diff between an archive and the current session.

| Field | Type | Description |
|-------|------|-------------|
| **Request** | | |
| `archive_id` | `string` | Archive to compare |
| **Response** | `ArchiveDiff` | Tasks added/removed/completed, iterations, files |
| **Store action** | `useArchiveStore.getArchiveDiff()` | |

```typescript
// ArchiveDiff (response)
interface ArchiveDiff {
  tasksAdded: Task[]
  tasksRemoved: Task[]
  tasksCompleted: Task[]
  iterationsAdded: IterationRecord[]
  filesModified: string[]
}
```

---

### `get_archive_content`

Read a specific file from an archive.

| Field | Type | Description |
|-------|------|-------------|
| **Request** | | |
| `archive_id` | `string` | Archive containing the file |
| `file_name` | `string` | File to read (e.g., "prd.json", "progress.txt") |
| **Response** | `string` | File contents |
| **Store action** | Used by ArchiveDiffViewer | |

---

### `save_archive_metrics`

Persist archive metrics to SQLite. (Frontend subscription — invoked by Zustand store, not a Tauri command.)

| Field | Type | Description |
|-------|------|-------------|
| **Request** | | |
| `total_archives` | `number` | Total archive count |
| `total_size_kb` | `number` | Total archive size |
| **Response** | `void` | |
| **Trigger** | Auto-subscription on archives change | |

---

## Command → Store Mapping

| Tauri Command | Zustand Store | Action | Trigger |
|---------------|--------------|--------|---------|
| `start_loop` | `useLoopStore` | `startLoop()` | User starts loop |
| `pause_loop` | `useLoopStore` | `pauseLoop()` | User clicks Pause |
| `resume_loop` | `useLoopStore` | `resumeLoop()` | User clicks Resume |
| `cancel_loop` | `useLoopStore` | `cancelLoop()` | User clicks Cancel |
| `get_loop_state` | `useLoopStore` | Direct read | Polling / sync |
| `retry_loop` | `useLoopStore` | `retryFromIteration()` | User clicks Retry |
| `save_loop_metrics` | `useLoopStore` | Auto-subscription | Every 5s |
| `run_quality_gates` | `useQualityGateStore` | `runQualityGates()` | Before commit |
| `auto_detect_quality_gate_config` | `useQualityGateStore` | `autoDetectConfig()` | Project load |
| `save_gate_metrics` | `useQualityGateStore` | Auto-subscription | On report change |
| `check_branch_change` | `useArchiveStore` | `checkBranchChange()` | Every 5 min |
| `archive_current_session` | `useArchiveStore` | `archiveSession()` | Branch change / manual |
| `list_archives` | `useArchiveStore` | `loadArchives()` | App start |
| `restore_archive` | `useArchiveStore` | `restoreArchive()` | User clicks Restore |
| `delete_archive` | `useArchiveStore` | `deleteArchive()` | User clicks Delete |
| `get_archive_diff` | `useArchiveStore` | `getArchiveDiff()` | User selects archive |
| `get_archive_content` | — | Direct read | Archive viewer |
| `save_archive_metrics` | `useArchiveStore` | Auto-subscription | On archives change |

---

## Cross-Store Coordination

The `useCoordinatorStore` orchestrates between the three stores:

| Event | Source Store | Coordinator Action | Target Store |
|-------|-------------|-------------------|--------------|
| Loop completes | `useLoopStore` | `handleLoopCompleted()` | `useArchiveStore.archiveSession()` |
| Branch changes | `useArchiveStore` | `handleBranchChange()` | `useLoopStore` (notify) |
| Gate fails | `useQualityGateStore` | `handleGateFailure()` | `useLoopStore.pauseLoop()` |

---

## References

- [MOTHERSHIP-RALPH-GLOSSARY.md](./MOTHERSHIP-RALPH-GLOSSARY.md) — Canonical type definitions
- [UNIFIED-STORE.md](./UNIFIED-STORE.md) — Zustand store implementations
- [MOTHERSHIP-RALPH.md](./MOTHERSHIP-RALPH.md) — Loop controller design
- [QUALITY-GATE.md](./QUALITY-GATE.md) — Quality gate system
- [AUTO-ARCHIVE.md](./AUTO-ARCHIVE.md) — Archive system

---

*Last updated: 2026-06-16*
