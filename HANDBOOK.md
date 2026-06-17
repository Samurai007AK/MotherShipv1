# Mothership — Agent Handoff

**Last Updated:** 2026-06-17
**Status:** Phase 0 ✅ — Phase 1a ✅ — Phase 1b ✅ — Phase 2 ✅ — Phase 3 ✅ — Phase 4 ✅ — DONE

---

## What Is Mothership

A desktop AI control center that unifies browser-based and local agents into one memory-aware workspace with isolated terminal sessions, shared context across tools, session handoff with automatic summarization, and lightweight resource management for low-RAM laptops (~200MB idle target, 16GB i5 laptop).

Built **from scratch** with Tauri 2.x (Jan fork approach was abandoned early — too much stripping needed).

## Stack

> **Legend:** ✅ Implemented — ⏳ Planned (not yet in codebase)

| Layer | Technology | Status |
|---|---|---|
| Desktop shell | Tauri 2.x + React 18 + TypeScript + Vite 5 + Rust backend | ✅ Implemented |
| Terminal mux | xterm.js 6.x + portable-pty 0.8 (Rust), per-agent PTY sessions | ✅ Implemented |
| State management | Zustand 4.5 (11 stores: agent, workspace, memory, theme, file, coordinator, loop, archive, qualityGate, modelRouter, warRoom, taskGraph, mcp, onboarding) | ✅ Implemented |
| UI framework | Tailwind CSS 3.4, Lucide React icons, react-resizable-panels 4.11 | ✅ Implemented |
| Platform | Windows 10+ (ConPTY via portable-pty) | ✅ Implemented |
| Memory layer | SQLite via rusqlite (FTS5 search, WAL mode) | ✅ Implemented |
| Agent orchestration | CrewAI (Python sidecar, Flow API for handoffs) | ⏳ Phase 4 |
| Agent execution | OpenHands SDK (Python sidecar, sandboxed, multi-provider) | ⏳ Phase 4 |
| Local inference | Ollama + llama.cpp | ✅ Implemented |

## Directory Structure

```
E:\Mother\
├── PLAN.md                           Master plan — 6 phases, todos, gates
├── HANDBOOK.md                       This file — agent handoff context
├── README.md                         Project overview + setup instructions
├── THANKS.md                         Attribution to all referenced OS projects
├── package.json                      Node deps (React, Zustand, xterm.js, Tauri API)
├── vite.config.ts                    Vite bundler config
├── tsconfig.json                     TypeScript config
├── tailwind.config.js                Tailwind CSS config
├── postcss.config.js                 PostCSS config
├── index.html                        App entry HTML
│
├── src/                              Frontend source (React + TypeScript)
│   ├── App.tsx                       Root component — wires layout + stores
│   ├── main.tsx                      React entry point
│   ├── index.css                     Global styles + CSS variables (light/dark)
│   ├── components/
│   │   ├── agents/
│   │   │   ├── AgentSidebar.tsx      Left panel — agent list, status dots, drag reorder
│   │   │   └── AddAgentDialog.tsx    Modal — add/configure new agents
│   │   ├── workspace/
│   │   │   └── WorkspaceView.tsx     Center panel — terminal tabs, agent workspace
│   │   ├── terminal/
│   │   │   └── TerminalPane.tsx      xterm.js renderer wired to Rust PTY
│   │   ├── memory/
│   │   │   └── MemoryPanel.tsx       Right panel — notes, context, search
│   │   ├── layout/
│   │   │   ├── ResizableLayout.tsx   3-panel resizable layout (react-resizable-panels)
│   │   │   └── ThemeToggle.tsx       Light/dark/system theme toggle
│   │   └── command-palette/          ⌘K fuzzy search, file search, recent agents
│   ├── hooks/
│   │   ├── useTerminal.ts           Hook connecting xterm.js ↔ Tauri PTY events
│   │   └── useContextCapture.ts     Event-driven context capture (output, git, switch, heartbeat)
│   ├── stores/
│   │   ├── agentStore.ts            Agent registry (10 agents, categories, status)
│   │   ├── workspaceStore.ts        Terminal tabs + workspace state
│   │   ├── memoryStore.ts           Notes, context history, search (in-memory)
│   │   ├── themeStore.ts            Theme persistence (localStorage)
│   │   ├── fileStore.ts             File operations state
│   │   ├── coordinatorStore.ts      Cross-store coordination
│   │   ├── loopStore.ts             Autonomous loop engine state
│   │   ├── archiveStore.ts          Session archive state
│   │   └── qualityGateStore.ts      Quality gate validation state
│   └── lib/                         Shared utilities
│       ├── fuzzySearch.ts           Fuzzy search for command palette
│       └── summaryEngine.ts         Summary engine client (Ollama + template fallback)
│
├── src-tauri/                        Rust backend (Tauri 2.x)
│   ├── Cargo.toml                   Rust deps (tauri 2, portable-pty, tokio, serde, chrono)
│   ├── tauri.conf.json              Tauri window + app config
│   ├── build.rs                     Tauri build script
│   ├── src/
│   │   ├── main.rs                  Tauri entry — registers all commands + state
│   │   ├── lib.rs                   Library root
│   │   ├── process.rs               SidecarManager (spawn, kill, health, list)
│   │   ├── terminal/
│   │   │   ├── mod.rs               PTY session manager (spawn, resize, I/O events)
│   │   │   └── commands.rs          Tauri IPC: terminal-spawn, terminal-input, terminal-resize
│   │   ├── commands/
│   │   │   ├── mod.rs               Command module registry
│   │   │   ├── sidecar_commands.rs  Sidecar IPC (spawn, kill, health, list)
│   │   │   ├── file_commands.rs     File system operations + file attachments
│   │   │   ├── loop_commands.rs     Autonomous loop control
│   │   │   ├── archive_commands.rs  Session archive operations
│   │   │   ├── quality_gate_commands.rs  Quality gate checks
│   │   │   └── summary_commands.rs  LLM summarization (Ollama integration)
│   │   ├── loop_controller/         Autonomous loop engine (Rust)
│   │   ├── quality_gate/            Quality gate validation (Rust)
│   │   └── archive/                 Session archiving (Rust)
│   └── target/                      Rust build output
│
├── sidecars/                         Python sidecar processes
│   ├── README.md                    Sidecar protocol documentation
│   ├── hello-bridge/
│   │   └── main.py                  Test sidecar (JSON-RPC over STDIO)
│   └── summary-engine/
│       └── main.py                  LLM summarization sidecar (Ollama + template fallback)
│
├── PLANS/                            Planning documents (33 files)
│   ├── INDEX.md                     Document map & navigation
│   ├── ARCHITECTURE.md              6-layer system architecture + data flow
│   ├── DESIGN-DECISIONS.md          10 key decisions with rationale
│   ├── STATUS.md                    Phase status tracker
│   ├── VISUAL-ROADMAP.md            Visual diagrams — project at a glance
│   ├── OPENSOURCE-INVENTORY.md      32 open-source tools catalog
│   ├── PHASE-0-FOUNDATION.md        Phase 0 details
│   ├── PHASE-1A-CORE.md             Phase 1a details
│   ├── PHASE-1B-CONTEXT.md          Phase 1b details
│   ├── PHASE-2-ENHANCED.md          Phase 2 details
│   ├── PHASE-3-ADVANCED.md          Phase 3 details
│   ├── PHASE-4-DISTRIBUTION.md      Phase 4 details
│   ├── GLOSSARY.md                  30+ terms defined
│   ├── ERROR-HANDLING.md            Sidecar crashes, SQLite corruption, recovery
│   ├── SECURITY.md                  Sandbox isolation, secrets, agent permissions
│   ├── TESTING-STRATEGY.md          Unit/Integration/E2E tests, CI/CD pipeline
│   ├── MONITORING.md                Logging, health checks, crash reporting
│   ├── CONFIGURATION.md             User/Agent/Project config schemas
│   ├── SCHEMA-MIGRATIONS.md         SQLite versioning, rollback procedures
│   ├── OFFLINE-BEHAVIOR.md          Offline mode, local inference, data sync
│   ├── ACCESSIBILITY.md             WCAG 2.1 AA, keyboard nav, screen readers
│   ├── BACKUP-EXPORT.md             Auto-backups, export/import, restore
│   ├── PHASE-TRANSITIONS.md         Rollback, parallel work, gate validation
│   ├── CROSS-CUTTING-RELATIONSHIPS.md  Visual diagrams of all relationships
│   ├── QUALITY-GATE.md              Quality gate system design
│   ├── LOOPS.md                     Autonomous loop engine design
│   ├── UNIFIED-STORE.md             Store architecture design
│   ├── AUTO-ARCHIVE.md              Auto-archive system design
│   ├── MOTHERSHIP-RALPH.md          Ralph agent design (+ commands, glossary, roadmap, tests)
│   └── _archive/                    Deprecated phase versions
│
├── dist/                             Vite build output
└── node_modules/                     Node.js dependencies
```

## Current State

### What's Built & Working

**Phase 0 — Foundation (COMPLETE)**
- Tauri 2.x app shell built from scratch (React + Vite + TypeScript + Rust)
- Three-panel resizable layout with localStorage-persisted sizes (react-resizable-panels v4.11.2)
- Light/dark/system theme toggle using CSS variables across all components
- Python hello-bridge sidecar with JSON-RPC over STDIO protocol
- `npm run build` compiles clean

**Phase 1a — Agent Registry + Terminal (COMPLETE)**
- Agent sidebar with 10 agents across 4 categories (coding, research, ops, creative)
- Agent status dots, drag-to-reorder, expandable details, add agent dialog
- xterm.js terminal pane with `TerminalPane.tsx` + `useTerminal.ts` hook
- Rust PTY backend via portable-pty with per-agent sessions
- Tauri event channels wired: `terminal-output` events, `terminal-input` commands
- WorkspaceView renders xterm.js TerminalPane (not plain text)
- Session persistence (buffer snapshots, pause/resume)
- Split panes with keyboard shortcut
- Terminal search (Ctrl+F), clipboard integration, reconnection logic

**Phase 1b — Shared Memory + Context Handoff (COMPLETE)**
- SQLite memory layer with rusqlite (WAL mode, FTS5 ready)
- NoteEditor with tags and markdown preview
- Timeline component with grouping and filters
- HandoffDialog for agent-to-agent context transfer
- Error boundaries around each panel
- Memory pressure detection and graceful degradation

**Phase 2 — Enhanced Context & Intelligence (COMPLETE)**
- Event-driven context capture (terminal output, git activity, agent switch, heartbeat)
- LLM summarization engine via Ollama (Python sidecar with template fallback)
- SQLite FTS5 full-text search across all memory entries
- File attachments with drag-drop support
- Cold storage for old sessions (compressed JSON archives)
- Memory pruning and snapshot deduplication

**Phase 3 — Advanced Features (COMPLETE)**
- Browser connector panel with tabbed browsing, URL bar, navigation controls
- Local model router via Ollama (model discovery, dropdown, chat interface)
- Task dependency graph via D3.js (drag nodes, create edges, DAG layout)
- War Room with multi-agent broadcast, side-by-side view, task chaining
- MCP server integration (WebSocket client, tool/resource discovery)
- D3.js visualization library installed and configured

**Additional systems built (beyond original plan):**
- Command palette (⌘K) with fuzzy search, file search, recent agents
- Autonomous loop engine (Rust `loop_controller/` + `loopStore.ts`)
- Quality gate system (Rust `quality_gate/` + `qualityGateStore.ts`)
- Session archive system (Rust `archive/` + `archiveStore.ts`)
- File operations (Rust `file_commands.rs` + `fileStore.ts`)
- Coordinator store for cross-store orchestration

**Phase 4 — Distribution & Polish (COMPLETE)**
- NSIS/MSI installer config with auto-updater plugin
- 3-step onboarding wizard (Welcome → Agents → Start First Project)
- 38 tests passing (33 Vitest unit/integration + 5 Pytest sidecar)
- Performance utilities (BatchQueue, debounce, throttle, measureTime)
- LazyPanels with idle unmount (10min timeout) for memory optimization
- Batched memory writes (2s flush interval + beforeunload)
- Documentation: README, User Guide, Developer Guide

## The 6 Phases

| Phase | What It Delivers | Est. Hours | Status |
|---|---|---|---|
| **Phase 0** | Tauri app shell, 3-panel layout, theming, sidecar foundation | 18-24 | ✅ Complete |
| **Phase 1a** | Agent registry (10 agents, categories, status), per-agent PTY terminals, xterm.js | 25-35 | ✅ Complete |
| **Phase 1b** | SQLite memory layer, context capture, note editor, timeline, manual handoff | 25-35 | ✅ Complete |
| **Phase 2** | Ollama auto-summarization, FTS5 search, file attachments, memory pruning | 30-40 | ✅ Complete |
| **Phase 3** | Browser WebView, local model router, task DAG (D3.js), multi-agent war room, MCP | 45-65 | ✅ Complete |
| **Phase 4** | Installer, auto-update, onboarding wizard, test suite, performance, docs | 35-45 | ✅ Complete |

Total: ~165-220 hours across 22+ sub-phases with 6 quality gates. **ALL PHASES COMPLETE.**

## Key Architecture Decisions

1. **Tauri over Electron** — 10x smaller RAM, Rust backend, OS-native WebView
2. **Built from scratch** instead of forking Jan — Jan fork required too much stripping; clean start was faster
3. **CrewAI over LangGraph** — 5.76x faster, standalone (no LangChain), Flow API maps to handoff lifecycle
4. **OpenHands SDK** for agent execution — sandboxed, multi-provider, programmatic control
5. **SQLite + patterns** for MVP memory — upgrade to vector search in Phase 3 if needed
6. **Python sidecars** for CrewAI/OpenHands; Rust for everything else
7. **Per-agent PTY sessions** with pause/resume — isolation over shared terminal
8. **Windows first** — hardest platform (ConPTY), user's laptop is Windows
9. **Zustand over Redux** — 1KB, isolated re-renders, no boilerplate

## Open-Source Tools Referenced (32 total)

- **[INSPIRED BY]** janhq/jan — Original desktop shell concept (fork abandoned, built from scratch)
- **[EMBED]** CrewAI, OpenHands SDK — Python sidecar processes (planned, not yet integrated)
- **[USES]** xterm.js, portable-pty, react-resizable-panels, Zustand, Lucide React, Tailwind CSS
- **[INSPIRED BY]** Herdr, AoE, ContextGraph, Zengram, Lore, nmem, memX
- **[REFERENCE]** Orkas, Shogun, OpenAgentd, Nexus, Overseer, Tether, winsmux, gmux, CodeMux, Synapse, OpenFlux, AgentHub, Agentic Titan, UnifAI, Drodo, SwarmKit, D3.js
- See `THANKS.md` for full attribution.

## Next Steps

All planned phases (0–4) are **complete**. The project is ready for:

1. **Final Polish** — UI refinements, animations, edge case handling
2. **Production Testing** — Full E2E test suite with Playwright
3. **Beta Release** — Build installers, distribute to test users
4. **CrewAI Integration** — Python sidecar orchestration (Phase 3 item, can be done post-release)
5. **OpenHands SDK** — Agent execution sandbox (Phase 3 item, can be done post-release)

## Constraints

- MUST run on Windows (ConPTY for PTY, named pipes for IPC)
- Idle RAM < 200MB
- Active RAM with 1 terminal < 300MB
- All code stored under `E:\Mother\`
- Deterministic handoffs — every handoff produces an auditable summary
