# Mothership — Phase 1: MVP

**Estimated Time:** 40-60 hours
**Dependencies:** Phase 0 complete
**Gate G1:** Can list agents, run terminals, write memory, handoff manually

---

## Overview

Phase 1 delivers the working MVP: agent registry with status indicators, terminal multiplexer with per-agent PTY sessions, shared memory notes panel, and manual handoff button. This is the "I can actually use this" milestone.

---

## Open-Source Tools Used

| Tool | Usage | Link |
|---|---|---|
| **CrewAI** | Multi-agent orchestration engine (Python sidecar) | https://github.com/crewAIInc/crewAI |
| **OpenHands SDK** | Agent execution runtime (Python sidecar) | https://github.com/OpenHands/OpenHands |
| **xterm.js** | Terminal emulation in browser | https://xtermjs.org |
| **node-pty** | Native PTY bindings for Node.js | https://github.com/microsoft/node-pty |
| **Herdr** | Reference for agent-aware terminal patterns | https://github.com/ogulcancelik/herdr |
| **AoE (Agent of Empires)** | Reference for session management | https://github.com/njbrake/agent-of-empires |
| **ContextGraph** | Reference for shared memory architecture | https://github.com/AllenMaxi/ContextGraph |
| **Tether** | Reference for session multiplexer design | https://github.com/maxthomas95/tether |

---

## Sub-Phase 1.1: Agent Registry

**Time:** 6-8 hours
**Gate:** Agent sidebar shows 10 agents with status indicators

### Implementation Steps

1. **Define Agent data model**
   ```typescript
   // src/lib/agents/types.ts
   interface Agent {
     id: string
     name: string           // "Claude", "Codex", "Gemini", etc.
     type: 'local-cli' | 'browser' | 'api' | 'terminal'
     status: 'online' | 'offline' | 'busy' | 'idle' | 'error'
     icon: string           // Agent brand icon
     provider: string       // Which LLM provider if API-based
     terminalSessionId: string | null
     lastActive: Date | null
   }
   
   const AGENT_MANIFEST: Agent[] = [
     { id: 'claude',   name: 'Claude',     type: 'local-cli', status: 'idle', ... },
     { id: 'codex',    name: 'Codex',      type: 'local-cli', status: 'idle', ... },
     { id: 'gemini',   name: 'Gemini',     type: 'local-cli', status: 'idle', ... },
     { id: 'opencode', name: 'OpenCode',   type: 'local-cli', status: 'idle', ... },
     { id: 'chatgpt',  name: 'ChatGPT',    type: 'browser',   status: 'online', ... },
     { id: 'deepseek', name: 'DeepSeek',   type: 'api',       status: 'online', ... },
     { id: 'mistral',  name: 'Mistral',    type: 'api',       status: 'online', ... },
     { id: 'kimi',     name: 'Kimi',       type: 'api',       status: 'online', ... },
     { id: 'qwen',     name: 'Qwen',       type: 'api',       status: 'online', ... },
     { id: 'ollama',   name: 'Ollama',     type: 'local-cli', status: 'idle', ... },
   ]
   ```

2. **Build AgentSidebar component**
   - Scrollable agent list with icons
   - Status dot (green/amber/red/gray)
   - Click to activate → highlights in center panel
   - Context menu (handoff to, open terminal, view memory)

3. **Status detection mechanism**
   - For CLI agents: passive tap on PTY output stream (Herdr pattern)
   - For browser agents: manual (user sets status)
   - For API agents: health check ping every 30s

4. **Zustand store wiring**
   ```typescript
   // agentStore.ts
   const useAgentStore = create<AgentState>((set) => ({
     agents: AGENT_MANIFEST,
     activeAgentId: null,
     setActiveAgent: (id) => set({ activeAgentId: id }),
     updateAgentStatus: (id, status) => set((state) => ({
       agents: state.agents.map(a => a.id === id ? { ...a, status } : a)
     })),
   }))
   ```

### OS Tool Reference

| Tool | Pattern We Adopt |
|---|---|
| **Orkas** | Agent team composition UI (commander + sub-agents) |
| **Shogun** | Agent status dashboard with live indicators |
| **OpenAgentd** | 15-provider integration manifest |
| **Herdr** | Status detection from PTY output stream |

---

## Sub-Phase 1.2: Terminal Multiplexer

**Time:** 12-16 hours
**Gate:** Each agent has its own terminal session; sessions persist when switching

### Architecture

```
React Component Layer
├── TerminalContainer.tsx       ← Manages all terminal instances
│   ├── TerminalTab.tsx         ← Per-agent tab (with status dot)
│   └── TerminalPane.tsx        ← xterm.js wrapper
│       ├── xterm.js instance   ← Renders terminal
│       └── FitAddon           ← Auto-fit to pane size
│
Tauri IPC Layer
├── commands/terminal.rs        ← Rust PTY commands
│   ├── spawn_session(agent_id, cwd) → PTY
│   ├── write_input(session_id, data)
│   ├── resize(session_id, cols, rows)
│   └── kill_session(session_id)
│
PTY Layer (node-pty via Tauri sidecar or native Rust)
├── node-pty / portmaster-pty   ← Native PTY
│   ├── ConPTY (Windows 10+)
│   ├── forkpty (macOS/Linux)
│   └── WinPTY (Windows 7-8 fallback)
```

### Implementation Steps

1. **Install xterm.js + addons**
   ```bash
   npm install xterm @xterm/xterm @xterm/addon-fit @xterm/addon-web-links
   ```

2. **Rust PTY backend** (or use node-pty via sidecar)
   ```rust
   // src-tauri/src/terminal.rs
   use portable_pty::{PtyMaster, PtySize, native_pty_system, ChildKiller};
   
   struct TerminalSession {
       agent_id: String,
       pty: PtyMaster,
       reader: Box<dyn Read + Send>,
       writer: Box<dyn Write + Send>,
   }
   
   #[tauri::command]
   fn spawn_terminal(agent_id: String) -> Result<i32, String> {
       let pty_system = native_pty_system();
       let pair = pty_system.openpty(PtySize::new(24, 80, 0, 0)).unwrap();
       // spawn cmd.exe or bash in the PTY
       // return session ID to frontend
   }
   ```

3. **xterm.js React wrapper**
   ```tsx
   // components/terminal/TerminalPane.tsx
   const TerminalPane: React.FC<{ agentId: string }> = ({ agentId }) => {
     const terminalRef = useRef<HTMLDivElement>(null)
     const term = useRef<Terminal>()
     
     useEffect(() => {
       term.current = new Terminal({
         cursorBlink: true,
         fontSize: 13,
         fontFamily: 'JetBrains Mono, monospace',
       })
       
       const fitAddon = new FitAddon()
       term.current.loadAddon(fitAddon)
       term.current.open(terminalRef.current!)
       fitAddon.fit()
       
       // Connect to PTY via Tauri IPC
       const sessionId = await invoke('spawn_terminal', { agentId })
       await listen(`terminal:${sessionId}:data`, (event) => {
         term.current?.write(event.payload)
       })
       term.current?.onData((data) => {
         invoke('write_terminal_input', { sessionId, data })
       })
       
       return () => { term.current?.dispose() }
     }, [agentId])
     
     return <div ref={terminalRef} className="h-full w-full" />
   }
   ```

4. **Session persistence**
   - Snapshot terminal state to JSON on tab switch
   - Restore scrollback on reattach (Tether pattern)
   - Pause PTY output stream when tab is hidden (RAM savings)

5. **Split panes**
   - Binary tree split layout (Herdr pattern)
   - ⌘\ to split, drag to resize
   - Max 4 panes per tab (RAM budget)

### OS Tool Reference

| Tool | Pattern We Adopt |
|---|---|
| **Herdr** | Agent status from PTY; workspace/tab/pane model |
| **AoE** | Session persistence; per-repo config; diff view pattern |
| **Tether** | Dumb pipe PTY multiplexer; session grouping by directory |
| **CodeHub** | Permission modes (Standard/Auto/YOLO); command palette |
| **winsmux** | Windows ConPTY native support; tmux-compatible runtime |
| **gmux** | 128KB scrollback replay; WebSocket streaming |
| **CodeMux** | Server-client architecture; project session management |

---

## Sub-Phase 1.3: Shared Memory Layer

**Time:** 10-14 hours
**Gate:** Users can write notes, save context snapshots, view memory timeline

### Architecture

```
Memory Layer
├── SQLite Database (via rusqlite)
│   ├── projects          ← Project metadata
│   ├── sessions          ← Agent session records
│   ├── memory_entries    ← Note entries, context snapshots
│   │   ├── id, project_id, agent_id, type (note|snapshot|decision)
│   │   ├── content (markdown), summary (auto-generated), tags
│   │   └── created_at, source_agent_id
│   └── handoffs          ← Handoff records
│       ├── from_agent_id, to_agent_id
│       ├── summary, context_before, context_after
│       └── created_at
│
├── Context Bus (in-memory + SQLite)
│   ├── Write context → tagged memory entry
│   ├── Read context → search by project/agent/tag
│   └── Subscribe → WebSocket push on new context (future)
│
└── Frontend
    ├── MemoryPanel.tsx    ← Right panel display
    ├── NoteEditor.tsx     ← Markdown note editor
    └── Timeline.tsx       ← Chronological memory view
```

### Implementation Steps

1. **SQLite schema (Rust)**
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
     context_snapshot TEXT  -- JSON blob
   );
   
   CREATE TABLE memory_entries (
     id TEXT PRIMARY KEY,
     project_id TEXT REFERENCES projects(id),
     agent_id TEXT,
     session_id TEXT REFERENCES sessions(id),
     type TEXT NOT NULL CHECK(type IN ('note','snapshot','decision','handoff')),
     content TEXT NOT NULL,
     summary TEXT,
     tags TEXT,  -- comma-separated
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   
   CREATE TABLE handoffs (
     id TEXT PRIMARY KEY,
     project_id TEXT REFERENCES projects(id),
     from_agent_id TEXT NOT NULL,
     to_agent_id TEXT NOT NULL,
     summary TEXT,
     context_before TEXT,  -- JSON
     context_after TEXT,   -- JSON
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   ```

2. **Rust commands**
   ```rust
   #[tauri::command]
   fn write_note(project_id: String, content: String, tags: String) -> Result<(), String>
   
   #[tauri::command]
   fn save_snapshot(session_id: String, content: String) -> Result<(), String>
   
   #[tauri::command]
   fn search_memory(project_id: String, query: String) -> Result<Vec<MemoryEntry>, String>
   
   #[tauri::command]
   fn get_project_timeline(project_id: String) -> Result<Vec<MemoryEntry>, String>
   
   #[tauri::command]
   fn record_handoff(from: String, to: String, summary: String) -> Result<(), String>
   ```

3. **MemoryPanel React component**
   ```tsx
   // components/memory/MemoryPanel.tsx
   const MemoryPanel: React.FC = () => {
     return (
       <div className="h-full flex flex-col">
         <NoteEditor onSave={handleSaveNote} />
         <Timeline entries={entries} />
         <SearchBar onSearch={handleSearch} />
       </div>
     )
   }
   ```

4. **Context capture hook** (runs every 30s when agent is active)
   ```typescript
   // hooks/useContextCapture.ts
   function useContextCapture(agentId: string) {
     useEffect(() => {
       const interval = setInterval(async () => {
         const snapshot = {
           agentId,
           prompt: await getLastPrompt(agentId),
           output: await getLastOutputLines(agentId, 20),
           branch: await getCurrentBranch(),
           openFiles: await getOpenFiles(),
           timestamp: new Date().toISOString(),
         }
         await invoke('save_snapshot', {
           sessionId: getActiveSession(),
           content: JSON.stringify(snapshot),
         })
       }, 30000)  // every 30s
       return () => clearInterval(interval)
     }, [agentId])
   }
   ```

### OS Tool Reference

| Tool | Pattern We Adopt |
|---|---|
| **ContextGraph** | Governed shared memory bus design; delta compaction concept |
| **Zengram** | Cross-agent briefings; dual storage (structured + vector future) |
| **Lore** | Auto-capture via hooks; session accumulator pattern |
| **nmem** | 6-tier hierarchy concept (we implement 3 tiers initially) |
| **memX** | Timestamp-based writes; pub/sub pattern for context sync |

---

## Sub-Phase 1.4: Manual Handoff System

**Time:** 6-10 hours
**Gate:** User clicks "Handoff to Agent X" → context summary copied to target agent

### Implementation Steps

1. **Handoff UI button**
   ```tsx
   // In AgentSidebar or QuickSwitcher
   <Button onClick={() => initiateHandoff(currentAgent, targetAgent)}>
     Handoff to {targetAgent.name}
   </Button>
   ```

2. **Handoff logic**
   ```typescript
   // lib/handoff/handoffManager.ts
   async function initiateHandoff(fromAgent: Agent, toAgent: Agent) {
     // 1. Capture current context
     const context = await captureCurrentContext(fromAgent)
     
     // 2. Generate summary (template-based in MVP)
     const summary = generateSummary(context)
     
     // 3. Write to handoff log + memory
     await invoke('record_handoff', {
       from: fromAgent.id,
       to: toAgent.id,
       summary,
       contextBefore: context,
     })
     
     // 4. Push summary to target agent's workspace
     await pushToWorkspace(toAgent, { summary, context })
     
     // 5. Switch active agent
     useAgentStore.getState().setActiveAgent(toAgent.id)
     
     // 6. Pause source agent terminal (RAM savings)
     await pauseSession(fromAgent)
   }
   
   function generateSummary(context: Context): string {
     return [
       `## Handoff: ${context.fromAgent} → ${context.toAgent}`,
       ``,
       `**Last prompt:** ${truncate(context.lastPrompt, 200)}`,
       `**Current branch:** ${context.branch}`,
       `**Open files:** ${context.openFiles.join(', ')}`,
       `**Key decisions:**`,
       ...context.decisions.map(d => `- ${d}`),
       `**Pending TODOs:**`,
       ...context.todos.map(t => `- [${t.done ? 'x' : ' '}] ${t.text}`),
     ].join('\n')
   }
   ```

3. **Workspace display**
   ```tsx
   // In workspace, show handoff summary as first message
   const WorkspaceView = () => {
     const handoff = useActiveHandoff()
     return (
       <div>
         {handoff && <HandoffBanner handoff={handoff} />}
         <AgentOutput agentId={activeAgent.id} />
       </div>
     )
   }
   ```

4. **CrewAI Flow integration** (bridge to Python sidecar)
   ```python
   # sidecars/crewai-bridge/handoff_flow.py
   from crewai.flow.flow import Flow, listen, start, router
   from pydantic import BaseModel
   
   class HandoffState(BaseModel):
       from_agent: str = ""
       to_agent: str = ""
       context: str = ""
       summary: str = ""
   
   class SessionFlow(Flow[HandoffState]):
       @start()
       def receive_handoff(self):
           # Called via REST API from Tauri
           self.state.summary = self.state.context[:500]
           return self.state
       
       @listen(receive_handoff)
       def log_handoff(self):
           # Write to CrewAI's own log
           print(f"Handoff: {self.state.from_agent} → {self.state.to_agent}")
           return {"logged": True}
   ```

### OS Tool Reference

| Tool | Pattern We Adopt |
|---|---|
| **CrewAI** | Flow orchestration for handoff lifecycle (`@start`, `@listen`, `@router`) |
| **ContextGraph** | Context pack compilation on handoff |
| **Zengram** | Cross-agent briefing format |

---

## Sub-Phase 1.5: Quick Switcher & Polish

**Time:** 4-6 hours
**Gate:** ⌘K opens quick switcher; MVP feels cohesive

### Steps

1. **Quick switcher** (⌘K)
   - Search agents, projects, recent sessions
   - Keyboard navigable
   - Shows status + last active

2. **Keyboard shortcuts**
   ```
   ⌘K    → Quick switcher
   ⌘T    → New terminal tab
   ⌘\    → Split pane
   ⌘W    → Close tab
   ⌘1-9  → Switch agent
   ⌘,    → Settings
   ```

3. **RAM-saving defaults**
   - Pause hidden terminal sessions after 5 min
   - Unload inactive agent views after 10 min
   - Batch memory writes every 2 seconds

4. **Error boundaries** on each panel

---

## Phase 1 Deliverable Checklist

- [ ] Agent sidebar with 10 agents + status indicators
- [ ] Per-agent terminal sessions (PTY via xterm.js + node-pty)
- [ ] Split panes (⌘\ to split, drag to resize)
- [ ] Terminal session persistence (pause/resume on tab switch)
- [ ] SQLite memory layer (notes, snapshots, handoffs)
- [ ] Context capture hook runs every 30s
- [ ] MemoryPanel with note editor + timeline
- [ ] Manual handoff button copies context summary
- [ ] Quick switcher (⌘K)
- [ ] Keyboard shortcuts wired
- [ ] RAM: pause hidden sessions after 5 min idle

---

## Phase 1 Completion Criteria

> **Gate G1:** A user can open Mothership, see all their agents, open a terminal for Claude, write a note in memory, switch to Codex (terminal pauses), and click "Handoff" to push a summary. The MVP is functional.

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| node-pty Windows issues | Medium | Test ConPTY path first; fallback to basic cmd.exe |
| xterm.js performance with many terminals | Low | Max 4 terminals visible; others paused |
| SQLite write contention from context capture | Low | Batch writes every 2s; debounce idle |
| CrewAI sidecar fails to start | Medium | Auto-restart with exponential backoff; user notification |
