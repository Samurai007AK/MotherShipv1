# Mothership — Phase 1b: Context & Handoff

**Estimated Time:** 25-35 hours (updated from 20-30)
**Dependencies:** Phase 1a complete
**Gate G1b:** Users can write notes, handoff between agents with context summary

---

## Overview

Phase 1b completes the MVP by adding shared memory (SQLite), context capture, and manual handoff. After this phase, Mothership is a functional "AI control center": agents have persistent memory, context is captured automatically, and handoffs carry summaries across agent boundaries.

---

## Open-Source Tools Used

| Tool | Usage | Link |
|---|---|---|
| **rusqlite** | SQLite bindings for Rust | https://github.com/rusqlite/rusqlite |
| **CrewAI** | Multi-agent orchestration (Python sidecar) | https://github.com/crewAIInc/crewAI |
| **ContextGraph** | Reference for shared memory architecture | https://github.com/AllenMaxi/ContextGraph |
| **Zengram** | Reference for cross-agent briefings | https://github.com/ZenSystemAI/Zengram |
| **Lore** | Reference for auto-capture via hooks | https://github.com/agentkitai/lore |

---

## Sub-Phase 1b.1: SQLite Memory Layer

**Time:** 10-14 hours ❌ NOT STARTED
**Gate:** Users can write notes, save context snapshots, view memory timeline

### Architecture

```
Memory Layer
├── SQLite Database (via rusqlite)
│   ├── projects              ← Project metadata
│   ├── sessions              ← Agent session records
│   ├── memory_entries        ← Notes, context snapshots, decisions
│   └── handoffs              ← Handoff records
├── Rust Commands             ← Tauri IPC handlers
│   ├── write_note, get_notes, search_memory
│   ├── save_snapshot, get_snapshots
│   └── record_handoff, get_handoffs
└── Frontend
    ├── MemoryPanel.tsx       ← Right panel display
    ├── NoteEditor.tsx        ← Markdown note editor
    └── Timeline.tsx          ← Chronological memory view
```

### Steps

1. **Create SQLite schema** (`src-tauri/src/memory/mod.rs`):
   ```sql
   CREATE TABLE projects (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     root_path TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );

   CREATE TABLE sessions (
     id TEXT PRIMARY KEY,
     project_id TEXT REFERENCES projects(id),
     agent_id TEXT NOT NULL,
     started_at TEXT NOT NULL DEFAULT (datetime('now')),
     ended_at TEXT,
     context_snapshot TEXT
   );

   CREATE TABLE memory_entries (
     id TEXT PRIMARY KEY,
     project_id TEXT REFERENCES projects(id),
     agent_id TEXT,
     session_id TEXT REFERENCES sessions(id),
     type TEXT NOT NULL CHECK(type IN ('note','snapshot','decision','handoff')),
     content TEXT NOT NULL,
     summary TEXT,
     tags TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );

   CREATE TABLE handoffs (
     id TEXT PRIMARY KEY,
     project_id TEXT REFERENCES projects(id),
     from_agent_id TEXT NOT NULL,
     to_agent_id TEXT NOT NULL,
     summary TEXT,
     context_before TEXT,
     context_after TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   ```

2. **Add `rusqlite` to Cargo.toml:**
   ```toml
   rusqlite = { version = "0.31", features = ["bundled"] }
   ```

3. **Create Rust memory module** (`src-tauri/src/memory/mod.rs`):
   ```rust
   pub struct MemoryDb {
       conn: Connection,
   }

   impl MemoryDb {
       pub fn new(db_path: &Path) -> Result<Self, DbError>;
       pub fn write_note(&self, project_id: &str, content: &str, tags: &str) -> Result<(), DbError>;
       pub fn get_notes(&self, project_id: &str) -> Result<Vec<MemoryEntry>, DbError>;
       pub fn search_memory(&self, project_id: &str, query: &str) -> Result<Vec<MemoryEntry>, DbError>;
       pub fn record_handoff(&self, project_id: &str, from: &str, to: &str, summary: &str) -> Result<(), DbError>;
       pub fn save_snapshot(&self, session_id: &str, content: &str) -> Result<(), DbError>;
   }
   ```

4. **Create Tauri IPC commands** (`src-tauri/src/commands/memory_commands.rs`):
   ```rust
   #[tauri::command]
   fn write_note(project_id: String, content: String, tags: String) -> Result<(), String>;
   #[tauri::command]
   fn get_notes(project_id: String) -> Result<Vec<MemoryEntry>, String>;
   #[tauri::command]
   fn search_memory(project_id: String, query: String) -> Result<Vec<MemoryEntry>, String>;
   #[tauri::command]
   fn record_handoff(from: String, to: String, summary: String) -> Result<(), String>;
   ```

5. **Register MemoryDb** as Tauri managed state in `main.rs`

6. **Update `memoryStore.ts`** to use Tauri IPC instead of in-memory state:
   ```typescript
   // Replace Zustand in-memory notes with invoke() calls
   const addNote = async (content: string, tags: string[]) => {
     await invoke('write_note', { projectId: activeProject, content, tags: tags.join(',') })
     await refreshNotes() // Re-fetch from SQLite
   }
   ```

### Implementation Notes

| Pattern We Adopt | Source |
|---|---|
| Governed shared memory bus design | ContextGraph |
| Cross-agent briefings; dual storage | Zengram |
| Auto-capture via hooks; session accumulator | Lore |

---

## Sub-Phase 1b.2: NoteEditor Component

**Time:** 3-4 hours ❌ NOT STARTED
**Gate:** Users can write, edit, and save markdown notes

### Steps

1. **Create `src/components/memory/NoteEditor.tsx`:**
   ```tsx
   interface NoteEditorProps {
     onSave: (content: string, tags: string[]) => void
     initialContent?: string
     initialTags?: string[]
   }

   export function NoteEditor({ onSave, initialContent, initialTags }: NoteEditorProps) {
     const [content, setContent] = useState(initialContent ?? '')
     const [tags, setTags] = useState(initialTags ?? [])

     return (
       <div className="flex flex-col gap-2 p-3">
         <textarea
           value={content}
           onChange={(e) => setContent(e.target.value)}
           placeholder="Write a note..."
           rows={4}
           className="bg-zinc-800 border border-zinc-700 rounded p-2 text-sm resize-none"
           onKeyDown={(e) => {
             if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSave(content, tags)
           }}
         />
         <TagInput tags={tags} onChange={setTags} />
         <div className="flex justify-end">
           <button onClick={() => onSave(content, tags)} disabled={!content.trim()}>
             Save Note
           </button>
         </div>
       </div>
     )
   }
   ```

2. **Create `TagInput` sub-component** for adding/removing tags
3. **Ctrl+Enter** to save
4. **Auto-focus** on new note creation

---

## Sub-Phase 1b.3: Timeline Component

**Time:** 3-4 hours ❌ NOT STARTED
**Gate:** Memory entries displayed as chronological timeline with agent attribution

### Steps

1. **Create `src/components/memory/Timeline.tsx`:**
   ```tsx
   interface TimelineProps {
     entries: MemoryEntry[]
     onSelect: (entry: MemoryEntry) => void
   }

   export function Timeline({ entries, onSelect }: TimelineProps) {
     return (
       <div className="space-y-1">
         {entries.map((entry) => (
           <TimelineCard key={entry.id} entry={entry} onClick={() => onSelect(entry)} />
         ))}
       </div>
     )
   }
   ```

2. **TimelineCard** shows: type icon, content preview, agent name, timestamp
3. **Type icons**: 📝 note, 📸 snapshot, 💡 decision, 🔄 handoff
4. **Click to expand** full content
5. **Filter by type** and **filter by agent**
6. **Infinite scroll** for large timelines (virtualize if >100 entries)

---

## Sub-Phase 1b.4: Manual Handoff System

**Time:** 6-8 hours ❌ NOT STARTED
**Gate:** User clicks "Handoff to Agent X" → context summary copied to target agent

### Steps

1. **Handoff button** in AgentSidebar context menu or WorkspaceView:
   ```tsx
   <Button onClick={() => initiateHandoff(currentAgent, targetAgent)}>
     Handoff to {targetAgent.name}
   </Button>
   ```

2. **Handoff logic:**
   ```typescript
   async function initiateHandoff(fromAgent: Agent, toAgent: Agent) {
     const context = await invoke('capture_current_context', { agentId: fromAgent.id })
     const summary = generateSummary(context)

     await invoke('record_handoff', {
       from: fromAgent.id,
       to: toAgent.id,
       summary,
       contextBefore: context,
     })

     await pushToWorkspace(toAgent, { summary, context })
     useAgentStore.getState().setActiveAgent(toAgent.id)
     await pauseSession(fromAgent)
   }
   ```

3. **Context capture** — gather current terminal output, branch, open files, last prompt
4. **Summary generation** — template-based (no LLM yet; Phase 2 adds Ollama):
   ```typescript
   function generateSummary(context: Context): string {
     return [
       `## Handoff: ${context.fromAgent} → ${context.toAgent}`,
       `**Last prompt:** ${truncate(context.lastPrompt, 200)}`,
       `**Current branch:** ${context.branch}`,
       `**Open files:** ${context.openFiles.join(', ')}`,
     ].join('\n')
   }
   ```

5. **Handoff banner** in target agent's workspace showing the context summary
6. **Pause source agent session** (stop PTY output forwarding)

---

## Sub-Phase 1b.5: Keyboard Shortcuts

**Time:** 2-3 hours ⚠️ Partial (⌘K done)
**Gate:** All keyboard shortcuts functional

### Steps

1. **Register global shortcuts** in `App.tsx`:
   ```typescript
   useEffect(() => {
     const handler = (e: KeyboardEvent) => {
       if ((e.metaKey || e.ctrlKey) && e.key === 't') { /* New terminal */ }
       if ((e.metaKey || e.ctrlKey) && e.key === 'w') { /* Close tab */ }
       if ((e.metaKey || e.ctrlKey) && e.key === '\\') { /* Split pane */ }
       if ((e.metaKey || e.ctrlKey) && e.key === ',') { /* Settings */ }
       if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
         /* Switch to agent by index */
       }
     }
     document.addEventListener('keydown', handler)
     return () => document.removeEventListener('keydown', handler)
   }, [])
   ```

2. **⌘T** → New terminal tab for current agent
3. **⌘W** → Close current terminal tab
4. **⌘\\** → Split pane
5. **⌘1-9** → Switch to agent by position
6. **⌘,** → Open settings panel

---

## Sub-Phase 1b.6: RAM-Saving Defaults & Error Boundaries

**Time:** 3-4 hours ❌ NOT STARTED
**Gate:** Hidden sessions paused after 5 min; each panel has error boundary

### Steps

1. **Pause hidden terminals** after 5 minutes idle:
   ```typescript
   // hooks/useMemoryManager.ts
   useEffect(() => {
     const interval = setInterval(() => {
       hiddenSessions.forEach(session => {
         if (Date.now() - session.lastVisible > 5 * 60 * 1000) {
           invoke('pause_terminal', { sessionId: session.id })
         }
       })
     }, 60_000)
     return () => clearInterval(interval)
   }, [])
   ```

2. **Error boundaries** on each panel:
   ```tsx
   // src/components/layout/ErrorBoundary.tsx
   class ErrorBoundary extends React.Component {
     state = { hasError: false, error: null }

     static getDerivedStateFromError(error: Error) {
       return { hasError: true, error }
     }

     render() {
       if (this.state.hasError) {
         return (
           <div className="p-4 text-center text-red-400">
             <p>Something went wrong in this panel.</p>
             <button onClick={() => this.setState({ hasError: false })}>
               Try Again
             </button>
           </div>
         )
       }
       return this.props.children
     }
   }
   ```

3. **Wrap each panel** in ErrorBoundary in `App.tsx`
4. **Flush memory writes** every 2 seconds (batch writes)

---

## Phase 1b Deliverable Checklist

- [x] Quick switcher (⌘K) with fuzzy search, agents, notes, files, recent
- [x] MemoryPanel with notes, context history, and search tabs
- [x] Fuzzy search scoring (exact, prefix, contains, word boundary, subsequence)
- [x] Recent agents tracking (localStorage persistence, max 5)
- [ ] SQLite memory layer (notes, snapshots, handoffs) — **STILL NEEDED** (1b.1)
- [ ] NoteEditor component — **STILL NEEDED** (1b.2)
- [ ] Timeline component — **STILL NEEDED** (1b.3)
- [ ] Manual handoff system with context summary — **STILL NEEDED** (1b.4)
- [ ] Keyboard shortcuts (⌘T, ⌘W, ⌘\, ⌘1-9, ⌘,) — **STILL NEEDED** (1b.5)
- [ ] RAM-saving defaults + error boundaries — **STILL NEEDED** (1b.6)

---

## Phase 1b Completion Criteria

> **Gate G1b:** A user can open Mothership, write a note in memory (persisted to SQLite), switch agents, click "Handoff" to push a context summary to the target agent, use ⌘K to quickly navigate, and use keyboard shortcuts. The MVP is functional.

### Status (2026-06-16)

**~20% complete.** Command palette and memory panel UI are done. SQLite, NoteEditor, Timeline, handoff, shortcuts, and error boundaries are all not started.

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| SQLite write contention from context capture | Low | Batch writes every 2s; debounce idle |
| CrewAI sidecar fails to start | Medium | Auto-restart with exponential backoff; user notification |
| rusqlite bundling issues on Windows | Low | Use `bundled` feature flag |
