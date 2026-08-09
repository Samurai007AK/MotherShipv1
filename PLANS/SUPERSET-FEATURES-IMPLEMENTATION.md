# Porting Superset's Top 3 Features to Mothership

## Feature Assessment Matrix

| Feature | Superset Implementation | Mothership Status | Effort | Impact |
|---|---|---|---|---|
| **Worktree Isolation** | Git worktrees per task, auto setup, port isolation, agent-terminable CLI | ✅ Basic worktrees exist (CRUD + terminal) | Medium | High |
| **Diff Viewer** | Split/inline views, syntax highlighting, stage/unstage, file list nav | ❌ Bare `<pre>` tag with raw diff text | Medium | High |
| **Workspace Presets** | `.superset/config.json` with setup/teardown, run shortcuts, port mapping | ❌ Not implemented | Medium | Medium |

---

## Feature 1: Enhanced Worktree Isolation

### Current State
Mothership already has:
- 10 Rust git commands (`create_worktree_workspace`, `list`, `status`, `diff`, `delete`, `sync`, `commit`, `push`, `detect_git_project`, `check_git_available`)
- Zustand store (`worktreeStore.ts`) with CRUD, diff caching, memory integration
- UI component (`WorktreeManager.tsx`) with expandable cards, create panel, delete confirmation, inline commit/Push/Sync/View Diff, worktree-scoped notes
- Workspace view toggle ("Terminals" / "Worktrees") with `workingDir` threaded to TerminalPane

### Gaps vs Superset
1. No worktree creation from external task sync (Linear/GitHub issues)
2. No port isolation for workspace services
3. No environment variable injection per worktree
4. No setup/teardown hooks on create/delete
5. No `.mothership/config.json` preset system (see Feature 3)

### Implementation Plan

#### Step 1.1: Add Port Isolation (Rust + Store)
Superset auto-assigns ports per worktree so multiple agent tasks don't conflict.

**Rust (`git_commands.rs`):**
```rust
// Add to create_worktree_workspace:
// 1. Scan currently assigned ports from .mothership/port-allocations.json
// 2. Find next available port in range 40000-50000
// 3. Write port allocation to the worktree's metadata
// 4. Set PORT, SUPERSET_PORT env vars in the worktree's terminal session

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortAllocation {
    pub port: u16,
    pub service_name: String,
    pub worktree_id: String,
}
```

**Store (`worktreeStore.ts`):**
```typescript
// Add to WorktreeState:
allocatedPorts: Map<string, { port: number; service: string }[]>

// Methods:
listAllocatedPorts: (worktreeId: string) => Promise<PortAllocation[]>
releasePorts: (worktreeId: string) => Promise<void>
```

**New Rust command:**
```rust
#[tauri::command]
pub async fn allocate_worktree_port(
    worktree_path: String,
    service_name: String,
) -> Result<PortAllocation, String>
```

#### Step 1.2: Add Per-Worktree Environment Variables
Superset copies `.env` into each worktree and allows overrides.

**Rust:**
```rust
#[tauri::command]
pub async fn set_worktree_env(
    worktree_path: String,
    env_vars: HashMap<String, String>,
) -> Result<(), String>

#[tauri::command]
pub async fn get_worktree_env(
    worktree_path: String,
) -> Result<HashMap<String, String>, String>
```

**Store:**
```typescript
// Merges project-root .env with worktree overrides
setWorktreeEnv: (worktreeId: string, env: Record<string, string>) => Promise<void>
getWorktreeEnv: (worktreeId: string) => Promise<Record<string, string>>
```

#### Step 1.3: Agent-Operable CLI Mode
Superset agents can create their own worktrees via `runpane <task>`.

**New Rust command:**
```rust
/// Creates a new worktree from within an agent session.
/// Parses task description from terminal, creates branch + worktree,
/// returns the path so agent can `cd` into it.
#[tauri::command]
pub async fn agent_create_worktree(
    project_path: String,
    task_description: String,
) -> Result<CreateWorktreeResult, String>
```

**UI:**
- Add a "Create from task" button in the Worktree panel that opens a simple prompt
- Show recently created worktrees as quick-select options in the terminal toolbar

#### Step 1.4: Worktree Monitoring & Resource Limits
Prevent runaway agents from consuming all disk space.

**Store:**
```typescript
// Resource tracking
getWorktreeDiskUsage: (worktreePath: string) => Promise<{ bytes: number; files: number }>
getWorktreeProcessCount: (worktreePath: string) => Promise<number>

// Limits (configurable in presets)
maxWorktreesPerProject: number // default 10
maxWorktreeDiskMB: number       // default 1024
```

---

## Feature 2: Diff Viewer

### Current State
A plain `<pre>` element showing raw unified diff output:
```tsx
<pre className="text-[9px] font-mono text-c-text leading-relaxed p-2 whitespace-pre-wrap">
  {diffText}
</pre>
```

### Superset's Approach
Uses `react-diff-viewer-continued` (or similar) with:
- **Split view** (side-by-side) and **inline view** (unified) toggle
- **Syntax highlighting** via `shiki` or `prism-react-renderer`
- **File list** sidebar showing all changed files with status icons
- **Stage/unstage** individual files or hunks
- **Collapsible file sections** for multi-file diffs

### Implementation Plan

#### Step 2.1: Install Dependencies
```bash
npm install react-diff-viewer-continued shiki
# or use diff + shiki for a more custom approach
npm install diff shiki @types/diff
```

#### Step 2.2: Create DiffViewer Component

```tsx
// src/components/diff/DiffViewer.tsx

interface DiffViewerProps {
  files: ChangedFile[]
  diffText: string
  viewMode: 'split' | 'inline'
  onViewModeChange: (mode: 'split' | 'inline') => void
  onStageFile?: (path: string) => void
  onUnstageFile?: (path: string) => void
  stagedFiles?: Set<string>
}
```

Sub-features:

**File List Sidebar:**
```
┌──────────────────────────────────┐
│ [M] src/components/foo.tsx       │ +12 -3
│ [A] src/components/bar.tsx       │ +45 -0
│ [D] src/lib/old-util.ts          │ +0 -28
│ [?] src/new-untracked.ts         │ +8 -0
└──────────────────────────────────┘
```
- Colored status badges (M=blue, A=green, D=red, ?=yellow)
- Click a file to scroll to its diff section
- File-level stage/unstage checkboxes

**Diff Display Area:**
```
┌─────────────────────┬─────────────────────┐
│ OLD (HEAD)          │ NEW (Working Tree)  │
│                     │                     │
│  import { foo }     │  import { foo, bar }│
│  from './foo'       │  from './foo'      │
│  ↓                  │  ↓                  │
│  const result =     │  const result =     │
│    compute(data)    │    compute(data,    │
│                     │      options)       │
└─────────────────────┴─────────────────────┘
```
- Split view by default, inline toggle available
- Syntax highlighting per file extension
- Line numbers on both sides
- Hunk-level stage buttons (`[+]` to stage this hunk)

#### Step 2.3: Add Rust Command for Structured Diff
The current `get_worktree_diff` returns raw text. Add a structured version:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructuredHunk {
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffLine {
    pub kind: String,       // "added" | "removed" | "context"
    pub old_lineno: Option<u32>,
    pub new_lineno: Option<u32>,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructuredFileDiff {
    pub path: String,
    pub status: String,
    pub old_path: Option<String>,  // for renames
    pub hunks: Vec<StructuredHunk>,
    pub insertions: usize,
    pub deletions: usize,
}

#[tauri::command]
pub async fn get_structured_worktree_diff(
    worktree_path: String,
) -> Result<Vec<StructuredFileDiff>, String>
```

**Rust parsing approach:** Use regex to parse the unified diff output into per-file, per-hunk structures with line numbers.

#### Step 2.4: Create DiffViewerPanel Component

```tsx
// src/components/diff/DiffViewerPanel.tsx
//
// Full-page diff viewer that replaces the worktree card's inline diff.
// Opens as an overlay or replaces the worktree panel when "View Diff" is clicked.

interface DiffViewerPanelProps {
  worktree: WorktreeInfo
  onClose: () => void
  onCommit: (message: string) => void
}
```

Features:
- File list on the left (~200px), diff content on the right
- Split/inline toggle in the toolbar
- "Stage All" / "Unstage All" buttons in the toolbar
- Commit message input at the bottom with "Commit" button
- File search/filter input to find files by name

#### Step 2.5: Integrate with WorktreeManager
Replace the current `showDiff` section in `WorktreeCard`:

**Before:**
```tsx
{showDiff && diffText !== null && (
  <div className="mt-1 max-h-40 overflow-auto bg-black/20 border border-c-border rounded">
    <pre className="text-[9px] font-mono...">{diffText}</pre>
  </div>
)}
```

**After:**
```tsx
{showDiff && (
  <DiffViewerPanel
    worktree={worktree}
    onClose={() => setShowDiff(false)}
    onCommit={(msg) => commitWorktreeChanges(worktree.worktreePath, msg)}
  />
)}
```

#### Step 2.6: (Optional) Integrate with War Room
Add a "View Changes" link in War Room broadcast responses that opens the DiffViewer for that agent's workspace.

---

## Feature 3: Workspace Presets (.mothership/config.json)

### What Superset Does
Superset's `.superset/config.json` is an optional file at the project root that configures how workspaces behave:

```json
{
  "setup": ["fnm use", "./.superset/setup.sh"],
  "teardown": ["./.superset/teardown.sh"],
  "run": {
    "Web App": "npm run dev --port $PORT",
    "Run Tests": "npm test",
    "Lint": "npm run lint"
  },
  "ports": {
    "web": "script:./scripts/get-port.sh web",
    "api": 3001
  },
  "auto_workspace": {
    "provider": "linear",
    "team_id": "eng"
  }
}
```

### Implementation Plan

#### Step 3.1: Define Config Schema (TypeScript)
```typescript
// src/types/workspacePreset.ts

export interface WorkspacePresetConfig {
  /** Shell commands to run when a workspace is created (cwd = worktree root) */
  setup?: string[]
  /** Shell commands to run when a workspace is deleted/archived */
  teardown?: string[]
  /** Named commands surfaced as quick-run buttons in the UI */
  run?: Record<string, string>
  /** Port assignments for services in this workspace */
  ports?: Record<string, number | string>  // number for static, string for dynamic
  /** Auto-create workspace from external task provider */
  auto_workspace?: {
    provider: 'linear' | 'github' | 'jira'
    team_id?: string
    project_id?: string
    label?: string
  }
}
```

#### Step 3.2: Add Rust Commands for Config

```rust
/// Read and parse the .mothership/config.json from the project root.
#[tauri::command]
pub async fn read_workspace_presets(
    project_path: String,
) -> Result<Option<WorkspacePresetConfig>, String>

/// Execute a preset setup/teardown/run command in a worktree.
/// Streams output back via Tauri events.
#[tauri::command]
pub async fn execute_preset_command(
    worktree_path: String,
    command: String,
) -> Result<(), String>
```

#### Step 3.3: Create PresetRunner Store
```typescript
// src/stores/presetRunnerStore.ts

interface PresetRunnerState {
  config: WorkspacePresetConfig | null
  isRunning: boolean
  output: string[]
  activeCommand: string | null

  loadConfig: (projectPath: string) => Promise<void>
  runSetup: (worktreePath: string) => Promise<void>
  runTeardown: (worktreePath: string) => Promise<void>
  runCommand: (worktreePath: string, name: string, command: string) => Promise<void>
  cancelCommand: () => void
}
```

#### Step 3.4: Integrate Setup/Teardown into Worktree Lifecycle

**On Worktree Create (`worktreeStore.ts`):**
```typescript
// After successful creation:
const presets = usePresetRunnerStore.getState()
if (presets.config?.setup?.length) {
  for (const cmd of presets.config.setup) {
    await presets.runSetup(worktreePath, cmd)
  }
}
```

**On Worktree Delete:**
```typescript
// Before deleting:
const presets = usePresetRunnerStore.getState()
if (presets.config?.teardown?.length) {
  // Run teardown in the worktree (still exists at this point)
  for (const cmd of presets.config.teardown) {
    await presets.runTeardown(worktreePath, cmd)
  }
}
```

**UI Indicator:**
- Worktree card shows a spinner/"Setting up..." badge during setup execution
- Failed setup commands surface an error on the card
- Setup output is viewable in the expanded card section
- Teardown progress shown during delete confirmation

#### Step 3.5: Create PresetEditor Component
```tsx
// src/components/settings/PresetEditor.tsx
//
// Editable UI for .mothership/config.json, shown:
// - Onboarding (if no config exists)
// - Settings panel
// - Via "Workspace Presets" button in the Worktree panel header

interface PresetEditorProps {
  projectPath: string
}
```

Features:
- Visual form with fields for setup/teardown/run commands
- Port mapping editor (add/remove services, static or script-based)
- Auto-workspace provider selector (Linear/GitHub/Jira toggle)
- "Save" writes to `.mothership/config.json`
- "Run Now" buttons to test setup/teardown commands

#### Step 3.6: "Run" Shortcuts in UI
Add a dropdown or button group in the Worktree panel header showing the `run` commands from config:

```
[Web App ▾] [Run Tests] [Lint]
```

When clicked, the command runs in the active worktree's terminal (or spawns a new terminal tab). The command's `$PORT` variable is replaced with the allocated port for that worktree.

#### Step 3.7: Auto-Workspace from External Tasks (Optional / Phase 2)
When `auto_workspace` is configured, Mothership can:
1. Poll the external provider (Linear/GitHub/Jira) for assigned tasks
2. Auto-create a worktree when a new task appears
3. Name the branch after the task ID
4. Show a notification: "New workspace created for task ABC-123"

**Implementation:** This requires an external polling service. The simplest approach is a Rust async task that runs every 60 seconds, checks for new tasks, and emits a Tauri event.

---

## Dependency & Effort Summary

### Feature 1: Enhanced Worktrees
| Step | Files | Lines | Dependencies |
|---|---|---|---|
| 1.1 Port isolation | 1 Rust, 1 TypeScript store | ~150 | `serde_json` (exists) |
| 1.2 Env vars | 1 Rust, 1 store | ~100 | None |
| 1.3 Agent CLI | 1 Rust command | ~50 | None |
| 1.4 Monitoring | 1 store | ~80 | `sysinfo` (exists in Cargo.toml) |

### Feature 2: Diff Viewer
| Step | Files | Lines | Dependencies |
|---|---|---|---|
| 2.1 Dep install | `package.json` | ~3 | `react-diff-viewer-continued`, `shiki` |
| 2.2 Component | 1 TSX, 1 CSS | ~400 | Above |
| 2.3 Structured diff (Rust) | 1 Rust | ~200 | `regex` (exists in Cargo.toml) |
| 2.4 Panel | 1 TSX | ~300 | Above |
| 2.5 Integration | 1 TSX (modify) | ~20 | None |

### Feature 3: Workspace Presets
| Step | Files | Lines | Dependencies |
|---|---|---|---|
| 3.1 Schema | 1 TypeScript | ~40 | None |
| 3.2 Rust commands | 1 Rust | ~120 | None |
| 3.3 Store | 1 TypeScript | ~150 | None |
| 3.4 Lifecycle hooks | 1 store (modify) | ~40 | None |
| 3.5 Editor | 1 TSX | ~250 | None |
| 3.6 Run shortcuts | 1 TSX (modify) | ~80 | None |
| 3.7 Auto-workspace | 1 Rust + 1 TSX | ~200 | HTTP client (exists) |

**Total estimated: ~2,200 lines across ~15 files**

## Recommended Order

```
Phase 1 (1 session): Feature 2 — Diff Viewer
  The diff viewer is the highest-impact standalone improvement.
  No dependency on other features.
  → Structured diff Rust command + DiffViewerPanel component

Phase 2 (1 session): Feature 1 — Enhanced Worktrees
  Port isolation + env vars make worktrees truly isolated.
  No dependency on presets.
  → Port allocation + env override commands + store

Phase 3 (1 session): Feature 3 — Workspace Presets
  Presets unlock the full Superset-like workflow.
  Depends on Phase 2 (port isolation uses port config).
  → Config schema + Rust commands + editor + lifecycle hooks
```
