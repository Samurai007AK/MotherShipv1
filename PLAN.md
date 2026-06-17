# Mothership — Implementation Master Plan

**Version:** 9.0
**Last Updated:** 2026-06-17 (Phase 4 complete)
**Status:** Phase 0 ✅ — Phase 1a ✅ — Phase 1b ✅ — Phase 2 ✅ — Phase 3 ✅ — Phase 4 ✅ — DONE

---

## Executive Summary

Mothership is a desktop AI control center that unifies browser-based and local AI agents into one memory-aware workspace. It provides isolated terminal sessions per agent, shared context across tools, session handoff with automatic summarization, and lightweight resource management for low-RAM laptops.

Built from scratch with Tauri 2.x (Jan clone failed), combining CrewAI orchestration, OpenHands SDK execution, and custom shared memory inspired by ContextGraph/Zengram.

---

## Guiding Principles

1. **Low-RAM first** — under 200MB idle, lazy-unload inactive sessions
2. **Plug-in architecture** — every agent is a connector, not a hard-coded integration
3. **Shared context above all** — the memory layer is the product, not the UI
4. **Proven OS components** — fork/extend before inventing
5. **Deterministic handoffs** — no magic, every handoff produces an auditable summary

---

## Phase Overview

```
Phase 0 ── Foundation: Tauri app shell (18-24 hrs) ✅ COMPLETE
  │
  ▼
Phase 1a ─ Agent registry + terminal multiplexer (25-35 hrs) ✅ COMPLETE
  │
  ▼
Phase 1b ─ Shared memory layer + manual handoff (25-35 hrs) ✅ COMPLETE
  │
  ▼
Phase 2 ── Auto-summarization + context retrieval + files (30-40 hrs) ✅ COMPLETE
  │
  ▼
Phase 3 ── Browser connectors + local models + graphs + collab (45-65 hrs) ✅ COMPLETE
  │
  ▼
Phase 4 ── Distribution + onboarding + testing + polish (35-45 hrs) next
```

---

## Active Todos — Work Through These One by One

> **How this works:** Each checkbox below is a discrete task. Work through them in order. After completing a task, check it off and update the "Last Updated" timestamp at the top of this file. Do NOT skip ahead to a new phase until all tasks in the current phase are checked off.

---

### Phase 0: Foundation (18-24 hrs) — ✅ COMPLETE

- [x] **0.1.1** Create Tauri 2.x project with React + Vite + TypeScript
- [x] **0.1.2** Install dependencies (React, Zustand, Tailwind, Tauri API)
- [x] **0.1.3** Create `src-tauri/Cargo.toml` with all Rust dependencies
- [x] **0.1.4** Create `src-tauri/build.rs` for Tauri build script
- [x] **0.1.5** Create `src-tauri/tauri.conf.json` with window config
- [x] **0.1.6** Create `src-tauri/src/main.rs` with Tauri entry point
- [x] **0.1.7** Create `src/main.tsx`, `src/index.css`, `index.html`
- [x] **0.1.8** Verify `npm run build` succeeds

- [x] **0.2.1** Create `src/components/agents/AgentSidebar.tsx` (left panel)
- [x] **0.2.2** Create `src/components/agents/AddAgentDialog.tsx` (add agent modal)
- [x] **0.2.3** Create `src/components/workspace/WorkspaceView.tsx` (center panel)
- [x] **0.2.4** Create `src/components/memory/MemoryPanel.tsx` (right panel)
- [x] **0.2.5** Create `src/stores/agentStore.ts` (agent registry)
- [x] **0.2.6** Create `src/stores/workspaceStore.ts` (terminal tabs)
- [x] **0.2.7** Create `src/stores/memoryStore.ts` (notes + context)
- [x] **0.2.8** Wire Zustand stores across all panels in `App.tsx`

- [x] **0.3.1** Create `src/stores/themeStore.ts` with Zustand + localStorage persistence
- [x] **0.3.2** Create `src/components/layout/ThemeToggle.tsx` with sun/monitor/moon icons
- [x] **0.3.3** Update `src/index.css` with light/dark CSS variables and base styles
- [x] **0.3.4** Remove hardcoded dark class from `index.html`
- [x] **0.3.5** Wire theme initialization into `App.tsx`
- [x] **0.3.6** Update all components to use CSS variable classes instead of hardcoded zinc colors
- [x] **0.3.7** Verify TypeScript compiles clean after theme changes

- [x] **0.4.1** Create `sidecars/hello-bridge/main.py` (Python JSON-RPC sidecar test)
- [x] **0.4.2** Create `sidecars/README.md` (sidecar protocol documentation)
- [x] **0.4.3** Create `src-tauri/src/process.rs` (SidecarManager: spawn, kill, health, list)
- [x] **0.4.4** Create `src-tauri/src/commands/sidecar_commands.rs` (4 Tauri IPC commands)
- [x] **0.4.5** Update `src-tauri/src/commands/mod.rs` (add sidecar_commands module)
- [x] **0.4.6** Update `src-tauri/src/main.rs` (register process module, SidecarManager, commands)
- [x] **0.4.7** Update `src-tauri/tauri.conf.json` (add externalBin for hello-bridge)

- [x] **0.5.1** Install `react-resizable-panels` package
- [x] **0.5.2** Create `src/components/layout/ResizableLayout.tsx` (Group/Panel/Separator, localStorage, double-click reset)
- [x] **0.5.3** Update `src/App.tsx` to use ResizableLayout
- [x] **0.5.4** Remove fixed widths from AgentSidebar and MemoryPanel
- [x] **0.5.5** Verify TypeScript compiles clean after resizable changes

- [x] **0.6.1** Run `npx tsc --noEmit` and fix any TypeScript errors
- [x] **0.6.2** Create `README.md` with project overview, setup instructions, and phase status
- [x] **0.6.3** Update `PLANS/STATUS.md` to mark Phase 0 as complete
- [x] **0.6.4** Update this file (PLAN.md) to mark Phase 0 as complete and set next phase

**Gate G0:** ✅ Complete — Tauri app with resizable 3-panel layout, theme toggle, sidecar manager, 10 agents

---

### Phase 1a: Agent Registry + Terminal Multiplexer (25-35 hrs) — ✅ COMPLETE

**1a.1 — Agent Registry Expansion (6-8 hrs)**

- [x] **1a.1.1** Add 6 more agents to `agentStore.ts` default list (10 total)
- [x] **1a.1.2** Add agent category/type field (coding, research, ops, creative)
- [x] **1a.1.3** Update AgentSidebar to show agent categories
- [x] **1a.1.4** Add agent description tooltips or expandable details
- [x] **1a.1.5** Implement basic status detection (idle → running transition on terminal activity)

**1a.2a — xterm.js Setup (3-4 hrs)**

- [x] **1a.2a.1** Install `@xterm/xterm` and `@xterm/addon-fit` packages
- [x] **1a.2a.2** Create `src/components/terminal/TerminalPane.tsx` with xterm.js renderer
- [x] **1a.2a.3** Create `src/hooks/useTerminal.ts` hook that connects xterm to Tauri PTY
- [x] **1a.2a.4** Style terminal pane with theme-aware colors

**1a.2b — Wire Rust PTY → xterm.js (4-5 hrs)**

- [x] **1a.2b.1** Create Tauri event channel for PTY output (`terminal-output` event)
- [x] **1a.2b.2** Create Tauri event channel for PTY input (`terminal-input` command)
- [x] **1a.2b.3** Wire `useTerminal` hook to listen for PTY output events
- [x] **1a.2b.4** Wire `useTerminal` hook to send input via Tauri invoke
- [x] **1a.2b.5** Update WorkspaceView to render TerminalPane instead of plain text output
- [x] **1a.2b.6** Test: spawn terminal, type commands, verify output renders in xterm.js

**1a.2c — Session Persistence (3-4 hrs)**

- [x] **1a.2c.1** Implement terminal buffer snapshot (last N lines)
- [x] **1a.2c.2** Implement snapshot restore on tab switch
- [x] **1a.2c.3** Pause hidden terminal sessions to save RAM
- [x] **1a.2c.4** Resume paused sessions on tab focus

**1a.2d — Split Panes (3-4 hrs)**

- [x] **1a.2d.1** Add split pane state to `workspaceStore.ts`
- [x] **1a.2d.2** Create `src/components/terminal/SplitPane.tsx` layout component
- [x] **1a.2d.3** Add ⌘\ keyboard shortcut to split current terminal
- [x] **1a.2d.4** Add pane resize handles within workspace

**1a.2e — Terminal Polish & Error Handling (2-3 hrs)**

- [x] **1a.2e.1** Add terminal reconnection logic on PTY crash
- [x] **1a.2e.2** Add "Connection lost" overlay on terminal errors
- [x] **1a.2e.3** Add terminal copy/paste integration with clipboard
- [x] **1a.2e.4** Add terminal search (Ctrl+F) via xterm.js search addon

**Gate G1a:** ✅ Complete — agents listed with categories, terminals work with xterm.js + PTY, split panes, session persistence, search, clipboard, error recovery

---

### Phase 1b: Shared Memory + Context Handoff (25-35 hrs) — ✅ COMPLETE

**1b.1 — SQLite Memory Layer (10-14 hrs)**

- [x] **1b.1.1** Add `rusqlite` dependency to `src-tauri/Cargo.toml`
- [x] **1b.1.2** Create `src-tauri/src/memory/mod.rs` (memory module)
- [x] **1b.1.3** Create `src-tauri/src/memory/store.rs` (SQLite schema + CRUD)
- [x] **1b.1.4** Create `src-tauri/src/memory/models.rs` (MemoryEntry, Session, Project)
- [x] **1b.1.5** Create Tauri IPC commands: `save_memory`, `query_memory`, `list_sessions`
- [x] **1b.1.6** Wire frontend stores to use Tauri IPC instead of in-memory only
- [x] **1b.1.7** Add auto-save on memory mutations (debounced 2s)

**1b.2 — NoteEditor Component (3-4 hrs)**

- [x] **1b.2.1** Create `src/components/memory/NoteEditor.tsx` (rich text editor)
- [x] **1b.2.2** Add tag autocomplete to NoteEditor
- [x] **1b.2.3** Add markdown preview toggle
- [x] **1b.2.4** Wire NoteEditor to memoryStore save/load

**1b.3 — Timeline Component (3-4 hrs)**

- [x] **1b.3.1** Create `src/components/memory/Timeline.tsx` (chronological view)
- [x] **1b.3.2** Add timestamp grouping (today, yesterday, this week, older)
- [x] **1b.3.3** Add filtering by agent, type, and date range
- [x] **1b.3.4** Wire Timeline to memoryStore context history

**1b.4 — Manual Handoff System (6-8 hrs)**

- [x] **1b.4.1** Create `src/components/memory/HandoffDialog.tsx` (handoff UI)
- [x] **1b.4.2** Create Rust `compile_handoff` command (compile context pack)
- [x] **1b.4.3** Implement context pack compilation (recent prompts, outputs, decisions)
- [x] **1b.4.4** Wire handoff to inject context into target agent's workspace
- [x] **1b.4.5** Add handoff history tracking in memory store

**1b.5 — Keyboard Shortcuts (2-3 hrs)** *(done in Phase 1a)*

- [x] **1b.5.1** Add ⌘T shortcut (new terminal for current agent)
- [x] **1b.5.2** Add ⌘W shortcut (close current tab)
- [x] **1b.5.3** Add ⌘\\ shortcut (split pane)
- [x] **1b.5.4** Add ⌘1-9 shortcuts (switch to tab by index)

**1b.6 — RAM-Saving Defaults + Error Boundaries (3-4 hrs)**

- [x] **1b.6.1** Implement auto-pause for hidden terminal sessions (>5 min idle) *(done in 1a)*
- [x] **1b.6.2** Implement memory pressure detection (>200MB threshold) *(sysinfo dep added)*
- [x] **1b.6.3** Add React error boundaries around each panel
- [x] **1b.6.4** Add graceful degradation on sidecar crashes

**Gate G1b:** ✅ Complete — SQLite memory layer, NoteEditor with tags + preview, Timeline with grouping/filters, HandoffDialog, error boundaries

---

### Phase 2: Enhanced Context & Intelligence (30-40 hrs) — ✅ COMPLETE

- [x] **2.1** Event-driven context capture (6-8 hrs)
- [x] **2.2** LLM summarization engine via Ollama (8-10 hrs)
- [x] **2.3** SQLite FTS5 full-text search (6-8 hrs)
- [x] **2.4** File attachments & drag-drop (4-6 hrs)
- [x] **2.5** Memory consolidation & cold storage (4-6 hrs)

**Gate G2:** ✅ Complete — context capture works, FTS5 search, file attachments, cold storage

---

### Phase 3: Advanced Features (45-65 hrs) — ✅ COMPLETE

- [x] **3.1** Browser connector via WebView (12-16 hrs)
- [x] **3.2** Local model router via Ollama (8-10 hrs)
- [x] **3.3** Task dependency graph via D3.js (8-12 hrs)
- [x] **3.4a** War Room — multi-agent broadcast (6-8 hrs)
- [x] **3.4b** War Room — task chaining (4-6 hrs)
- [x] **3.5** MCP server integration (4-6 hrs)

**Gate G3:** ✅ Complete — browser connector, model router, D3 task graph, War Room with broadcast + chaining, MCP server integration

---

### Phase 4: Distribution & Polish (35-45 hrs) — ✅ COMPLETE

- [x] **4.1** Installer & auto-update (NSIS/MSI config, tauri-plugin-updater)
- [x] **4.2** Onboarding wizard (3-step first-run with localStorage persistence)
- [x] **4.3a** Unit & integration tests — 33 tests across 5 Vitest files
- [x] **4.3b** E2E & Python sidecar tests — Playwright configured + 5 Pytest tests
- [x] **4.4** Performance profiling — BatchQueue for writes, lazy panel loading, idle unmount
- [x] **4.5** Documentation — README, User Guide, Developer Guide

**Gate G4:** ✅ Complete — installer config, onboarding, tests (38 total), performance optimizations, documentation

---

## What's Built (Reference)

- Tauri 2.x app shell (built from scratch)
- CrewAI integration: Python sidecar with Flow API (`@start`, `@listen`, `@router`) for orchestrated handoffs, Tauri IPC commands, frontend toggle in HandoffDialog
- Three-panel resizable layout (react-resizable-panels v4)
- Agent sidebar with drag reorder, status dots, add agent dialog
- Workspace view with terminal tabs
- Memory panel with notes, context, search
- Command palette (⌘K) with fuzzy search, file search, recent agents
- Light/dark theme toggle with CSS variables (all components themed)
- Zustand stores (agent, workspace, memory, file, theme, coordinator)
- Rust backend: portable-pty, sidecar manager, file commands, loop controller, quality gates
- Python hello-bridge sidecar (JSON-RPC over STDIO)
- Event-driven context capture (global singleton hook)
- LLM summarization engine via Ollama (Python sidecar + TypeScript client)
- SQLite FTS5 full-text search with sync triggers
- File attachments with drag-drop and metadata
- Memory cold storage (gzip archive, prune/restore)
- **Phase 3 features:**
  - Browser connector panel with tabbed browsing, URL bar, navigation
  - Local model router via Ollama (model discovery, dropdown, chat interface)
  - Task dependency graph via D3.js (drag nodes, create edges, DAG layout)
  - War Room with multi-agent broadcast, side-by-side view, task chaining
  - MCP server integration (WebSocket client, tool/resource discovery)
- **Phase 4 features:**
  - NSIS/MSI installer config + auto-updater plugin
  - 3-step onboarding wizard (Welcome → Agents → Complete)
  - 38 tests passing (33 Vitest + 5 Pytest)
  - Performance utilities (BatchQueue, debounce, throttle, LazyPanels)
  - Documentation (README, User Guide, Developer Guide)

---

## Risk Registry

| Risk | Level | Impact | Mitigation |
|---|---|---|---|
| ~~Jan upstream diverges from fork~~ | ~~MEDIUM~~ | ~~Merge conflicts~~ | N/A — built from scratch |
| Python sidecar latency via Tauri | MEDIUM | Slow handoffs | Pre-warm Python processes; Unix sockets |
| Windows pty compatibility | HIGH | No terminal mux | Portable-pty with ConPTY; cmd.exe fallback |
| RAM budget exceeds target | HIGH | Slows laptop | Lazy-load, pause terminals, cold storage |
| CrewAI + OpenHands overlap | LOW | Duplicate orchestration | CrewAI = handoff, OpenHands = execution |
| react-resizable-panels v4 API | LOW | Resize breaks | Pinned to v4.11.2; tested |

---

*This plan is a living document. Update the checkbox and "Last Updated" timestamp after every completed task.*
