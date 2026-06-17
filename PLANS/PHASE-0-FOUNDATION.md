# Mothership — Phase 0: Foundation

**Estimated Time:** 18-24 hours (updated from 15-20)
**Dependencies:** None
**Gate G0:** Tauri app compiles and shows 3-panel layout with resizable panels

---

## Overview

Phase 0 establishes the project foundation by creating the Tauri desktop shell, building the three-panel layout, setting up the theme system, and preparing the sidecar infrastructure for Python processes. No agent logic — just the desktop app structure.

**Deviation from original plan:** Jan fork failed to clone. Phase 0 was completed by building the Tauri shell from scratch, which is functionally equivalent but skips Jan's theme system and model management.

---

## Open-Source Tools Used

| Tool | Usage | Link |
|---|---|---|
| **Jan** | Fork base — Tauri config, theme, model mgmt | https://github.com/janhq/jan |
| **Synapse** | Reference for Tauri sidecar setup | https://github.com/droxer/HiAgent |
| **OpenFlux** | Reference for Tauri v2 config patterns | https://github.com/EDEAI/OpenFlux |
| **Shadcn/ui** | UI component primitives | https://ui.shadcn.com |
| **Zustand** | State management | https://github.com/pmndrs/zustand |
| **Tailwind CSS** | Utility-first CSS framework | https://tailwindcss.com |

---

## Sub-Phase 0.1: Project Scaffold & Environment Setup

**Time:** 4-6 hours ✅ Done
**Gate:** Tauri app compiles and launches

### Steps

1. Create Tauri 2.x project with React + Vite + TypeScript
2. Install dependencies (React, Zustand, Tailwind, Tauri API)
3. Create `src-tauri/Cargo.toml` with all Rust dependencies
4. Create `src-tauri/build.rs` for Tauri build script
5. Create `src-tauri/tauri.conf.json` with window config
6. Create `src-tauri/src/main.rs` with Tauri entry point
7. Create `src/main.tsx`, `src/index.css`, `index.html`
8. Verify `npm run build` succeeds

### OS Tool Reference

| Jan File/Module | What It Does | What We Change |
|---|---|---|
| `src-tauri/tauri.conf.json` | Window config, menu, updater | Keep, modify app name |
| `src-tauri/src/` | Rust backend | Keep, add sidecar commands later |
| `web-app/` | React frontend | Strip chat → agent layout |
| `core/` | Model management | Keep, add terminal + memory later |

---

## Sub-Phase 0.2: Three-Panel Layout & Zustand Stores

**Time:** 4-6 hours ✅ Done
**Gate:** Three-panel layout renders in dev mode

### Steps

1. Create three-panel layout structure:
   ```
   src/
   ├── components/
   │   ├── agents/
   │   │   ├── AgentSidebar.tsx    ← Left panel
   │   │   └── AddAgentDialog.tsx  ← Add agent modal
   │   ├── workspace/
   │   │   └── WorkspaceView.tsx   ← Center panel
   │   ├── memory/
   │   │   └── MemoryPanel.tsx     ← Right panel
   │   └── command-palette/
   │       └── CommandPalette.tsx  ← ⌘K quick switcher
   ├── stores/
   │   ├── agentStore.ts           ← Agent registry
   │   ├── workspaceStore.ts       ← Terminal tabs
   │   ├── memoryStore.ts          ← Notes + context
   │   └── fileStore.ts            ← File search
   └── App.tsx                     ← Three-panel root
   ```

2. Implement AgentSidebar with agent list, status dots, drag reorder
3. Implement WorkspaceView with terminal tabs and empty state
4. Implement MemoryPanel with notes/context/search tabs
5. Wire Zustand stores across all panels

### OS Tool Reference

| Tool | What We Borrow |
|---|---|
| **Shogun** | Three-panel "Tenshu" dashboard layout concepts |
| **Orkas** | Agent sidebar design (avatar, status dot, name) |
| **AgentHub** | Zustand store patterns for multi-agent state |

---

## Sub-Phase 0.3: Theme & Design System

**Time:** 2-3 hours ✅ Done
**Gate:** Theme switches correctly between light/dark

### Steps

1. Configure Tailwind with custom design tokens:
   ```css
   --agent-claude: #c977a0;
   --agent-codex: #4a9eff;
   --agent-gemini: #4285f4;
   --agent-opencode: #4ade80;
   --status-running: #22c55e;
   --status-idle: #a3a3a3;
   --status-error: #ef4444;
   ```
2. Create `tailwind.config.js` with Mothership color tokens
3. Implement light/dark theme toggle (themeStore.ts + ThemeToggle.tsx)
4. CSS variables for theme switching (index.css, tailwind.config.js)
5. All components updated to use CSS variable classes instead of hardcoded colors

### OS Tool Reference

| Tool | What We Borrow |
|---|---|
| **Jan** | Full theme system (CSS variables, dark/light, tokens) |
| **Shadcn/ui** | Button, badge, card, dialog, tooltip primitives |

---

## Sub-Phase 0.4: Sidecar Foundation

**Time:** 3-5 hours ✅ Done
**Gate:** Tauri can spawn a Python "hello world" sidecar

### Steps

1. Create sidecars directory:
   ```
   E:\Mother\sidecars\
   ├── crewai-bridge\       ← Phase 1b
   ├── openhands-bridge\    ← Phase 1b
   └── summary-engine\     ← Phase 2
   ```

2. Tauri sidecar config in `tauri.conf.json`:
   ```json
   {
     "bundle": {
       "externalBin": ["sidecars/crewai-bridge", "sidecars/openhands-bridge"]
     }
   }
   ```

3. Create Rust `SidecarManager` in `src-tauri/src/process.rs`:
   ```rust
   pub struct SidecarManager {
       processes: HashMap<String, ChildProcess>,
   }

   impl SidecarManager {
       pub fn spawn(&self, name: &str, command: &str, args: &[&str]) -> Result<u32, String>;
       pub fn kill(&self, name: &str) -> Result<(), String>;
       pub fn is_healthy(&self, name: &str) -> bool;
       pub fn restart(&self, name: &str) -> Result<(), String>;
   }
   ```

4. Create Python hello-world sidecar: `sidecars/hello-bridge/main.py` ✅
5. Register `SidecarManager` as Tauri managed state ✅
6. Add Tauri IPC commands: `spawn_sidecar`, `kill_sidecar`, `check_sidecar_health`, `list_sidecars` ✅

### OS Tool Reference

| Tool | What We Borrow |
|---|---|
| **Jan** | Tauri command pattern for Rust → frontend IPC |
| **Synapse** | Sidecar lifecycle management (auto-start, health check) |
| **OpenFlux** | openflux.yaml pattern (multi-provider config) |

---

## Sub-Phase 0.5: Resizable Panels

**Time:** 2-3 hours ✅ Done
**Gate:** Panels can be resized by dragging dividers

### Steps

1. Install `react-resizable-panels` or implement custom drag dividers
2. Create `src/components/layout/ResizableLayout.tsx`:
   ```tsx
   import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'

   <PanelGroup direction="horizontal">
     <Panel defaultSize={20} minSize={15}>
       <AgentSidebar />
     </Panel>
     <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-zinc-600" />
     <Panel defaultSize={50} minSize={30}>
       <WorkspaceView />
     </Panel>
     <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-zinc-600" />
     <Panel defaultSize={30} minSize={20}>
       <MemoryPanel />
     </Panel>
   </PanelGroup>
   ```

3. Persist panel sizes to localStorage
4. Add double-click to reset panel sizes

---

## Sub-Phase 0.6: Build Verification & Project Docs

**Time:** 2 hours ❌ NOT STARTED
**Gate:** Full project builds successfully

### Steps

1. Verify all builds:
   ```bash
   npm run build            # Frontend
   cargo build              # Rust backend
   cargo tauri build        # Full desktop build
   ```

2. Fix any compilation errors
3. Create `AGENTS.md` with project conventions
4. Create initial `README.md`
5. Verify TypeScript compiles clean: `npx tsc --noEmit`

---

## Phase 0 Deliverable Checklist

- [x] Tauri app shell built from scratch (Jan clone failed; built fresh)
- [x] Three-panel layout renders (AgentSidebar, WorkspaceView, MemoryPanel)
- [x] Zustand stores initialized (agents, workspace, memory + bonus stores)
- [x] Tailwind design tokens (agent colors, status colors)
- [x] TypeScript compiles clean
- [x] Theme system working (light/dark toggle with CSS variables)
- [x] Sidecar directory + Rust SidecarManager + Python hello-bridge
- [x] Resizable panels (react-resizable-panels v4 with localStorage persistence)
- [ ] Full build verification (npx tsc, README.md) — **REMAINING**

---

## Phase 0 Completion Criteria

> **Gate G0:** The app opens, shows a three-panel resizable layout with placeholder content, supports light/dark theme toggle, and Tauri can spawn a Python sidecar. No agent functionality yet — just the shell.

### Status (2026-06-16)

**~90% complete.** Sub-phases 0.1-0.5 are done. Only sub-phase 0.6 (build verification + README) remains.

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Jan upstream has moved significantly | Low | N/A — built from scratch |
| Tauri 2.x breaking changes | Medium | Pin to Tauri 2.x stable; test build weekly |
| Windows WebView2 not installed | Medium | Bundle WebView2 installer; detect on launch |
| Windows toolchain missing for cargo | High | Run rustup-init.exe to install stable toolchain |
