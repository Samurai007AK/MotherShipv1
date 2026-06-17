# Mothership — System Architecture

**Last Updated:** 2026-06-15
**Status:** Final Draft

---

## Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│                    MOTHERSHIP DESKTOP APP                          │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │                   Tauri 2.x Shell (Rust)                  │     │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐  │     │
│  │  │ Window   │  │ File     │  │ Process  │  │ Sidecar │  │     │
│  │  │ Manager  │  │ System   │  │ Spawner  │  │ Manager │  │     │
│  │  └──────────┘  └──────────┘  └──────────┘  └─────────┘  │     │
│  └──────────────────────────────────────────────────────────┘     │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │              React Frontend (TypeScript)                   │     │
│  │                                                           │     │
│  │  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐  │     │
│  │  │ Agent   │ │ Terminal │ │ Memory   │ │ Workspace   │  │     │
│  │  │ Sidebar │ │ Panels   │ │ Panel    │ │ (Chat/View) │  │     │
│  │  └─────────┘ └──────────┘ └──────────┘ └─────────────┘  │     │
│  │                                                           │     │
│  │  ┌──────────────────────────────────────────────────┐    │     │
│  │  │           Zustand State Store                     │    │     │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │    │     │
│  │  │  │ Agent    │ │ Session  │ │ Project/Memory   │  │    │     │
│  │  │  │ Registry │ │ Manager  │ │ Store            │  │    │     │
│  │  │  └──────────┘ └──────────┘ └──────────────────┘  │    │     │
│  │  └──────────────────────────────────────────────────┘    │     │
│  └──────────────────────────────────────────────────────────┘     │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │              Tauri IPC (invoke + events)                   │     │
│  └──────────────────────────────────────────────────────────┘     │
│                                                                   │
│  ┌──────────┐ ┌───────────┐ ┌────────────┐ ┌────────────────┐    │
│  │ Python   │ │ Python    │ │ Python     │ │ SQLite +       │    │
│  │ CrewAI   │ │ OpenHands │ │ Summary    │ │ ContextGraph   │    │
│  │ Sidecar  │ │ SDK       │ │ Engine     │ │ Memory Layer   │    │
│  │          │ │ Sidecar   │ │ (Ollama)   │ │                │    │
│  │ Crews +  │ │ Agent     │ │            │ │ Project store  │    │
│  │ Flows    │ │ Runtime   │ │ Summarize  │ │ Memory entries │    │
│  └──────────┘ └───────────┘ └────────────┘ └────────────────┘    │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │              Terminal Layer (node-pty + xterm.js)          │     │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐  │     │
│  │  │ Claude   │ │ Codex    │ │ Gemini   │ │ OpenCode    │  │     │
│  │  │ Terminal │ │ Terminal  │ │ Terminal │ │ Terminal    │  │     │
│  │  └──────────┘ └──────────┘ └──────────┘ └─────────────┘  │     │
│  └──────────────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────┘
```

---

## Layer Responsibilities

### 1. Desktop Shell (Tauri 2.x) — Rust

| Module | Responsibility | Open-Source Reference |
|---|---|---|
| Window Manager | Window creation, resizable panels, minimize to tray | [Jan](https://github.com/janhq/jan) `src-tauri/` |
| File System | Read/write project files, watch for changes | Rust std `fs` |
| Process Spawner | Launch Python sidecars, manage lifecycle | [Synapse](https://github.com/droxer/HiAgent) Tauri config |
| Sidecar Manager | Start/stop/restart CrewAI, OpenHands, Summary Engine | [OpenFlux](https://github.com/EDEAI/OpenFlux) Rust backend |

**Why Tauri over Electron:** ~10MB binary vs ~100MB+, lower RAM footprint, Rust gives safe filesystem + process management.

**Fork source:** [Jan's src-tauri/](https://github.com/janhq/jan/tree/main/src-tauri) — stripping chat-specific code, keeping window manager, updater, and tray.

### 2. Frontend (React + TypeScript)

| Component | Responsibility | Inspired By |
|---|---|---|
| Agent Sidebar | List agents, status indicators, drag reorder | [Orkas](https://github.com/Orkas-AI/Orkas), [Shogun](https://github.com/AlphaHorizon-AI/Shogun) |
| Terminal Panels | xterm.js instances, split panes, tab bar | [Herdr](https://github.com/ogulcancelik/herdr) agent awareness, [AoE](https://github.com/njbrake/agent-of-empires) TUI dashboard |
| Memory Panel | Notes, context history, search | [ContextGraph](https://github.com/AllenMaxi/ContextGraph) memory bus |
| Workspace View | Current agent's chat/output display | [OpenAgentd](https://github.com/lthoangg/openagentd) split view |
| Quick Switcher | Cmd+K to jump between agents/projects | [CodeHub](https://github.com/mpolatcan/codehub) command palette |

**State Management:** [Zustand](https://github.com/pmndrs/zustand) — 1KB, no boilerplate, same pattern as [AgentHub](https://github.com/Albaloola/AgentHub).

### 3. Agent Orchestration (CrewAI — Python Sidecar)

**Why CrewAI over LangGraph:** CrewAI claims 5.76x faster execution in benchmarks, has built-in Flows (event-driven orchestration), and is fully standalone (no LangChain dependency).

| Feature | How CrewAI Implements It |
|---|---|
| Session Handoff | `@router` + `@listen` decorators orchestrate agent-to-agent transitions |
| Multi-Agent Teams | `Crew` with role-based agents (researcher, coder, reviewer) |
| Task Dependencies | `Process.sequential` or `Process.hierarchical` |
| Output Structuring | `output_pydantic` for typed results |
| Human-in-the-Loop | `human_input=True` on tasks |

**Integration pattern:** Tauri spawns `crewai serve` as a sidecar. Frontend communicates via REST API on `localhost:4891`. Each project gets its own `Flow` instance.

### 4. Agent Execution (OpenHands SDK — Python Sidecar)

**Why OpenHands:** 77K stars, production-grade SDK with sandboxed execution, multi-provider LLM routing, and composable agent definitions.

| Capability | How We Use It |
|---|---|
| Agent Runtime | OpenHands SDK executes coding tasks (Codex, Claude CLI, etc.) |
| Sandbox | Docker container isolation per agent session |
| Multi-Provider | Route to Claude, GPT, Gemini through one interface |
| File Operations | Read/write project files in sandbox |

**Integration pattern:** OpenHands runs as a sidecar process. Mothership's terminal panels connect to OpenHands sessions for real-time output streaming.

### 5. Terminal Multiplexer (xterm.js + node-pty)

**Architecture:** Each agent gets its own pseudo-terminal (PTY) session. Sessions persist in the background even when the tab is hidden.

| Feature | Implementation | Inspired By |
|---|---|---|
| PTY per agent | node-pty spawns `cmd.exe` / `bash` | [Tether](https://github.com/maxthomas95/tether), [CodeHub](https://github.com/mpolatcan/codehub) |
| Split panes | Binary tree layout in React | [Herdr](https://github.com/ogulcancelik/herdr) panes |
| Status detection | Passive tap on PTY output stream | [AoE](https://github.com/njbrake/agent-of-empires) status detection |
| Session persistence | JSON snapshot of terminal state | [Tether](https://github.com/maxthomas95/tether) session resume |
| Log streaming | WebSocket push to memory panel | [gmux](https://github.com/gmuxapp/gmux) WebSocket |

**Windows support:** Uses ConPTY (Windows 10+ native) via node-pty. Falls back to WinPTY for older versions. Reference: [winsmux](https://github.com/Sora-bluesky/winsmux).

### 6. Shared Memory Layer (SQLite + ContextGraph Patterns)

**Architecture:** Two-tier storage — SQLite for structured metadata, ContextGraph-inspired memory bus for cross-agent context.

| Tier | Technology | Stores |
|---|---|---|
| Metadata | SQLite (via `rusqlite`) | Projects, sessions, agent configs, file references |
| Working Memory | In-memory + SQLite | Current task, last prompt, output logs |
| Episodic Memory | SQLite + JSON | Decisions, handoff summaries, timestamps |
| Cross-Agent Bus | ContextGraph pattern | Shared facts, context packs, delta compaction |

**Inspired by:**
- [ContextGraph](https://github.com/AllenMaxi/ContextGraph) — governed shared memory bus, delta compaction, context packs
- [Zengram](https://github.com/ZenSystemAI/Zengram) — cross-agent briefings, Qdrant + SQLite dual storage
- [Lore](https://github.com/agentkitai/lore) — auto-injection into prompts, MCP tools
- [nmem](https://github.com/dayyanj/nmem) — 6-tier memory hierarchy, social learning across agents
- [ourmem](https://github.com/ourmem/omem) — team/personal spaces, provenance tracking

---

## Data Flow — Session Handoff

```
Agent A (Claude) working...
  │
  ├─► Context capture hook runs every 30s
  │     ├─ snapshot: current prompt, output tail, branch, open files
  │     └─ write to SQLite (episodic memory)
  │
  ├─► User clicks "Handoff to Agent B (Codex)"
  │     ├─ CrewAI Flow triggers @router
  │     ├─ ContextGraph compiles context pack from recent snapshots
  │     ├─ Local LLM (Ollama) generates 3-line summary
  │     ├─ Summary + context pack injected into Agent B's workspace
  │     └─ Agent B's terminal auto-focuses
  │
  └─► Memory updated
        ├─ handoff recorded in project timeline
        ├─ "last active agent" = Agent B
        └─ Agent A's session paused (RAM saved)
```

---

## Communication Protocols

| Between | Protocol | Details |
|---|---|---|
| Frontend ↔ Tauri | IPC | `invoke()` for commands, `events` for streaming |
| Frontend ↔ xterm.js | WebSocket | Terminal I/O per session |
| Tauri ↔ Python Sidecars | STDIO JSON-RPC | Lightweight, no HTTP overhead |
| Tauri ↔ SQLite | rusqlite | Direct Rust bindings |
| CrewAI ↔ OpenHands SDK | Localhost HTTP | Port 4892 for agent execution |
| ContextGraph ↔ Agents | MCP (stdin/stdout) | 15+ tools for memory read/write |

---

## File Layout

```
E:\Mother\
├── src\                           ← React frontend
│   ├── components\
│   │   ├── agents\               ← Agent sidebar, cards, status
│   │   ├── terminal\             ← xterm.js wrappers, split panes
│   │   ├── memory\               ← Notes panel, context viewer, search
│   │   ├── workspace\            ← Chat/output view, quick switcher
│   │   └── layout\              ← Three-panel layout, resizable
│   ├── stores\                   ← Zustand stores
│   ├── hooks\                    ← useTerminal, useMemory, useCrewAI
│   ├── lib\                      ← API clients, utilities
│   └── App.tsx
│
├── src-tauri\                    ← Rust backend
│   ├── src\
│   │   ├── commands\             ← Tauri invoke handlers
│   │   ├── memory\               ← SQLite, ContextGraph bridge
│   │   ├── process\              ← Sidecar lifecycle management
│   │   └── terminal\             ← node-pty bindings
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── sidecars\                     ← Python sidecar processes
│   ├── crewai-bridge\            ← CrewAI orchestration server
│   ├── openhands-bridge\         ← OpenHands SDK agent runtime
│   └── summary-engine\           ← Ollama summarization
│
└── PLANS\                        ← Plan documents
```

---

## Scalability Notes

- **Single user laptop** — all processes local, no network dependency
- **Multi-gateway (future)** — sidecars could run on remote machines, communicating via WebSocket
- **Team memory (future)** — SQLite → Postgres migration, ContextGraph multi-user spaces
- **10+ agents** — RAM budget enforced at architectural level (pause, cold store, lazy load)
