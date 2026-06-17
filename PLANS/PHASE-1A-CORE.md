# Mothership — Phase 1a: Agent Registry + Terminal Multiplexer

**Estimated Time:** 25-35 hours (updated from 20-30)
**Dependencies:** Phase 0 complete
**Gate G1a:** Agent sidebar shows 10 agents with status; each agent has a working terminal session with xterm.js rendering

---

## Overview

Phase 1a delivers the foundational runtime: an agent registry panel with status indicators and a per-agent terminal multiplexer. After this phase, Mothership can show all available agents and spawn isolated, real terminal sessions for each one.

**Subdivision note:** The original Sub-phase 1a.2 (Terminal Multiplexer) was 12-16 hours and has been split into 5 smaller, independently verifiable sub-phases.

---

## Open-Source Tools Used

| Tool | Usage | Link |
|---|---|---|
| **xterm.js** | Terminal emulation in browser | https://xtermjs.org |
| **@xterm/addon-fit** | Auto-fit terminal to container | https://xtermjs.org |
| **@xterm/addon-web-links** | Clickable links in terminal | https://xtermjs.org |
| **portable-pty** | Native PTY bindings for Rust | https://github.com/flickerfly/portable-pty |
| **Herdr** | Reference for agent-aware terminal patterns | https://github.com/ogulcancelik/herdr |
| **AoE** | Reference for session management | https://github.com/njbrake/agent-of-empires |

---

## Sub-Phase 1a.1: Agent Registry (Expand to 10 Agents)

**Time:** 6-8 hours ⚠️ Partial (4/10 agents done)
**Gate:** Agent sidebar shows 10 agents with status indicators

### What's Done
- ✅ AgentSidebar component with drag reorder
- ✅ AddAgentDialog with provider selection, model picker, API key input
- ✅ Zustand agentStore with registerAgent, removeAgent, updateAgentStatus
- ✅ Status dots (running/idle/error/offline)
- ✅ Recent agents tracking (localStorage)

### What's Still Needed

1. **Expand to 10 agents** — Add to `DEFAULT_AGENTS` in `agentStore.ts`:
   ```typescript
   // Current 4:
   { id: 'claude',   name: 'Claude',   provider: 'claude',   type: 'local-cli' },
   { id: 'codex',    name: 'Codex',    provider: 'codex',    type: 'local-cli' },
   { id: 'gemini',   name: 'Gemini',   provider: 'gemini',   type: 'local-cli' },
   { id: 'opencode', name: 'OpenCode', provider: 'opencode', type: 'local-cli' },

   // Add 6 more:
   { id: 'chatgpt',  name: 'ChatGPT',  provider: 'openai',   type: 'browser',   url: 'https://chat.openai.com' },
   { id: 'deepseek', name: 'DeepSeek', provider: 'deepseek', type: 'api' },
   { id: 'mistral',  name: 'Mistral',  provider: 'mistral',  type: 'api' },
   { id: 'kimi',     name: 'Kimi',     provider: 'kimi',     type: 'api' },
   { id: 'qwen',     name: 'Qwen',     provider: 'qwen',     type: 'api' },
   { id: 'ollama',   name: 'Ollama',   provider: 'ollama',   type: 'local-model' },
   ```

2. **Add agent types** — Extend `AgentProvider` to include `'openai' | 'deepseek' | 'mistral' | 'kimi' | 'qwen' | 'ollama'`

3. **Add provider colors** for new agents

4. **Status detection mechanism** — ❌ NOT STARTED
   - CLI agents: passive tap on PTY output stream (Herdr pattern)
   - Browser agents: manual (user sets status)
   - API agents: health check ping every 30s
   - Local models: Ollama API ping

5. **Context menu on agent** — Right-click → "Open Terminal", "Handoff to...", "View Memory"

---

## Sub-Phase 1a.2a: Install xterm.js & Create Terminal Component

**Time:** 3-4 hours ❌ NOT STARTED
**Gate:** xterm.js renders a static terminal in the workspace

### Steps

1. **Install xterm.js and addons:**
   ```bash
   npm install @xterm/xterm @xterm/addon-fit @xterm/addon-web-links
   ```

2. **Create `src/components/terminal/TerminalPane.tsx`:**
   ```tsx
   import { useEffect, useRef } from 'react'
   import { Terminal } from '@xterm/xterm'
   import { FitAddon } from '@xterm/addon-fit'
   import { WebLinksAddon } from '@xterm/addon-web-links'
   import '@xterm/xterm/css/xterm.css'

   interface TerminalPaneProps {
     sessionId: string
     onData?: (data: string) => void
   }

   export function TerminalPane({ sessionId, onData }: TerminalPaneProps) {
     const containerRef = useRef<HTMLDivElement>(null)
     const terminalRef = useRef<Terminal | null>(null)
     const fitAddonRef = useRef<FitAddon | null>(null)

     useEffect(() => {
       if (!containerRef.current) return

       const terminal = new Terminal({
         cursorBlink: true,
         fontSize: 13,
         fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace',
         theme: {
           background: '#18181b',
           foreground: '#e4e4e7',
           cursor: '#a1a1aa',
         },
         scrollback: 10000,
       })

       const fitAddon = new FitAddon()
       terminal.loadAddon(fitAddon)
       terminal.loadAddon(new WebLinksAddon())
       terminal.open(containerRef.current)
       fitAddon.fit()

       terminalRef.current = terminal
       fitAddonRef.current = fitAddon

       // Forward keystrokes to PTY
       terminal.onData((data) => onData?.(data))

       // Resize observer
       const observer = new ResizeObserver(() => fitAddon.fit())
       observer.observe(containerRef.current)

       return () => {
         observer.disconnect()
         terminal.dispose()
       }
     }, [sessionId])

     return <div ref={containerRef} className="h-full w-full" />
   }
   ```

3. **Add `@xterm/xterm` CSS import** to `src/index.css` or component

4. **Verify** xterm.js renders a working terminal cursor in the workspace panel

---

## Sub-Phase 1a.2b: Wire Rust PTY → xterm.js via Tauri Events

**Time:** 4-5 hours ❌ NOT STARTED
**Gate:** Typing in xterm.js sends keystrokes to PTY; PTY output renders in xterm.js

### Steps

1. **Update Rust `TerminalManager` to emit events** — modify `start_reader_task` to use `tauri::AppHandle` for event emission:
   ```rust
   // When PTY produces output:
   app_handle.emit("terminal-output", TerminalOutput {
       session_id: sid.clone(),
       data: String::from_utf8_lossy(&buf[..n]).to_string(),
   })?;
   ```

2. **Create `src/hooks/useTerminalSession.ts`:**
   ```typescript
   export function useTerminalSession(agentId: string, terminalRef: Terminal) {
     useEffect(() => {
       let sessionId: string | null = null

       // Spawn PTY session
       invoke<string>('spawn_terminal_session', {
         config: { agent_id: agentId, working_dir: '.', cols: 120, rows: 30 }
       }).then((id) => {
         sessionId = id
         // Listen for output
         listen(`terminal-output`, (event) => {
           if (event.payload.sessionId === sessionId) {
             terminalRef.write(event.payload.data)
           }
         })
       })

       // Forward keystrokes to PTY
       const disposable = terminalRef.onData((data) => {
         if (sessionId) {
           invoke('write_terminal_input', { sessionId, data })
         }
       })

       return () => {
         disposable.dispose()
         if (sessionId) invoke('close_terminal_session', { sessionId })
       }
     }, [agentId])
   }
   ```

3. **Wire TerminalPane into WorkspaceView** — replace `<pre>` output with `<TerminalPane>`

4. **Test end-to-end:** Type `echo hello` in xterm.js → see output in terminal

---

## Sub-Phase 1a.2c: Session Persistence (Snapshot/Restore)

**Time:** 3-4 hours ❌ NOT STARTED
**Gate:** Switching tabs preserves terminal scrollback

### Steps

1. **Snapshot on tab switch:**
   ```typescript
   // When switching away from a terminal tab:
   const snapshot = terminalRef.current.serialize()
   setTerminalSnapshot(agentId, snapshot)
   terminalRef.current.clear()
   ```

2. **Restore on tab return:**
   ```typescript
   // When switching back to a terminal tab:
   const snapshot = getTerminalSnapshot(agentId)
   if (snapshot) {
     terminalRef.current.loadSnapshot(snapshot)
   } else {
     // Reconnect to PTY
   }
   ```

3. **Pause hidden terminals** — Stop forwarding PTY output when tab is not active (RAM savings)

4. **Resume on tab switch** — Flush buffered output, resume PTY event forwarding

---

## Sub-Phase 1a.2d: Split Panes

**Time:** 3-4 hours ❌ NOT STARTED
**Gate:** ⌘\ splits the terminal view; drag to resize

### Steps

1. **Create `src/components/terminal/SplitPane.tsx`** — Binary tree split layout:
   ```tsx
   interface SplitNode {
     type: 'leaf' | 'split'
     direction: 'horizontal' | 'vertical'
     children?: SplitNode[]
     agentId?: string
     size: number // percentage
   }
   ```

2. **Implement split:** ⌘\ splits the current pane in half
3. **Implement resize:** Drag the split divider to resize panes
4. **Implement close:** Close a split pane (sibling takes full space)
5. **Max 4 panes** per tab (RAM budget constraint)
6. **Persist split layout** in workspace store

---

## Sub-Phase 1a.2e: Terminal Polish & Error Handling

**Time:** 2-3 hours ❌ NOT STARTED
**Gate:** Terminal gracefully handles disconnections, crashes, and resize

### Steps

1. **Connection status indicator** in terminal tab (connected/disconnected/reconnecting)
2. **Auto-reconnect** when PTY exits unexpectedly
3. **Crash overlay** with "Restart Session" and "Discard" buttons
4. **Terminal scrollback limit** (10,000 lines, configurable)
5. **Copy/paste** integration with system clipboard
6. **Right-click context menu** (Copy, Paste, Clear, Select All)

---

## Phase 1a Deliverable Checklist

- [x] Agent sidebar with 4 agents + status indicators + drag reorder
- [x] Add Agent dialog with provider selection, model picker, API key input
- [x] Zustand agent store with recent agents
- [x] Rust PTY backend: spawn, write, resize, close, list, get
- [x] TerminalManager (Arc<Mutex<HashMap>> pattern)
- [ ] Expand to 10 agents — **STILL NEEDED**
- [ ] Status detection mechanism — **STILL NEEDED**
- [ ] xterm.js integration — **STILL NEEDED** (Sub-phase 1a.2a)
- [ ] Wire PTY → xterm.js via Tauri events — **STILL NEEDED** (Sub-phase 1a.2b)
- [ ] Session persistence (snapshot/restore) — **STILL NEEDED** (Sub-phase 1a.2c)
- [ ] Split panes (⌘\) — **STILL NEEDED** (Sub-phase 1a.2d)
- [ ] Terminal polish & error handling — **STILL NEEDED** (Sub-phase 1a.2e)

---

## Phase 1a Completion Criteria

> **Gate G1a:** A user can open Mothership, see all 10 agents with live status dots, click any agent to open a real terminal session (xterm.js), type commands that execute in a PTY, split the terminal view with ⌘\, and switch between agents without losing terminal state.

### Status (2026-06-16)

**~40% complete.** Agent registry is partially done (4/10 agents). Rust PTY backend is done. All xterm.js frontend work is not started.

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| portable-pty Windows issues | Medium | Test ConPTY path first; fallback to cmd.exe |
| xterm.js performance with many terminals | Low | Max 4 terminals visible; others paused |
| xterm.js CSS import issues | Low | Use Vite CSS import; test in dev mode |
