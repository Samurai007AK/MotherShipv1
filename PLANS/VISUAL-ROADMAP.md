# Mothership — Visual Roadmap

**Last Updated:** 2026-06-15
**Purpose:** Single source of truth for any agent working on this project
**Status:** ✅ Planning Complete — Ready for Phase 0

---

## 🎯 Project At A Glance

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MOTHERSHIP                                          │
│                    Desktop AI Control Center                                │
│                                                                             │
│   One control plane, many workers.                                         │
│                                                                             │
│   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│   │ Claude  │  │  Codex  │  │ Gemini  │  │ChatGPT  │  │ Ollama  │        │
│   └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
│        │            │            │            │            │              │
│        └────────────┴────────────┴─────┬──────┴────────────┘              │
│                                        │                                   │
│                              ┌─────────▼─────────┐                        │
│                              │   MOTHERSHIP      │                        │
│                              │   (Tauri + React) │                        │
│                              └─────────┬─────────┘                        │
│                                        │                                   │
│                    ┌───────────────────┼───────────────────┐              │
│                    │                   │                   │              │
│              ┌─────▼─────┐      ┌──────▼──────┐     ┌─────▼─────┐       │
│              │  Terminals │      │   Memory    │     │  Context  │       │
│              │  (xterm.js)│      │  (SQLite)   │     │  (Handoff)│       │
│              └───────────┘      └─────────────┘     └───────────┘       │
│                                                                             │
│   Target: Windows 10+ │ < 200MB idle │ 165-220 hours │ 6 phases          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Complete File Tree

```
E:\Mother\
├── PLAN.md                              ← Master plan (start here)
├── HANDBOOK.md                          ← Agent handoff context
├── THANKS.md                            ← Open-source attribution (32+ projects)
│
├── PLANS/
│   ├── INDEX.md                         ← 📋 Document map (22 docs)
│   │
│   ├── 🏗️ ARCHITECTURE & DESIGN
│   │   ├── ARCHITECTURE.md              ← 6-layer system design
│   │   ├── DESIGN-DECISIONS.md          ← 10 key decisions + rationale
│   │   ├── OPENSOURCE-INVENTORY.md      ← 32 open-source tools catalog
│   │   └── GLOSSARY.md                  ← 30+ terms defined
│   │
│   ├── 📅 PHASE PLANS
│   │   ├── PHASE-0-FOUNDATION.md        ← Fork Jan, scaffold (15-20h)
│   │   ├── PHASE-1A-CORE.md             ← Agent registry + terminals (20-30h)
│   │   ├── PHASE-1B-CONTEXT.md          ← Memory + handoff (20-30h)
│   │   ├── PHASE-2-ENHANCED.md          ← Auto-summary + search (30-40h)
│   │   ├── PHASE-3-ADVANCED.md          ← Browser + models + graphs (40-60h)
│   │   └── PHASE-4-DISTRIBUTION.md      ← Installer + testing (30-40h)
│   │
│   ├── 🔧 CROSS-CUTTING CONCERNS
│   │   ├── ERROR-HANDLING.md            ← 8 failure modes + recovery
│   │   ├── SECURITY.md                  ← Secrets + sandboxing + permissions
│   │   ├── TESTING-STRATEGY.md          ← Unit/Integration/E2E + CI/CD
│   │   ├── MONITORING.md                ← Logging + health + crash reports
│   │   ├── CONFIGURATION.md             ← User/Agent/Project config
│   │   ├── SCHEMA-MIGRATIONS.md         ← DB versioning + rollback
│   │   ├── OFFLINE-BEHAVIOR.md          ← Offline mode + local inference
│   │   ├── ACCESSIBILITY.md             ← WCAG 2.1 AA + keyboard nav
│   │   ├── BACKUP-EXPORT.md             ← Auto-backups + export/import
│   │   ├── PHASE-TRANSITIONS.md         ← Rollback + parallel work + gates
│   │   └── CROSS-CUTTING-RELATIONSHIPS.md  ← Visual diagrams
│   │
│   └── 📦 _archive/
│       └── PHASE-1-MVP.md               ← Deprecated (superseded by 1a+1b)
│
├── src/                                 ← 🔨 Source code (NOT YET CREATED)
├── src-tauri/                           ← 🦀 Rust backend (NOT YET CREATED)
└── sidecars/                            ← 🐍 Python sidecars (NOT YET CREATED)
```

---

## 🗺️ Phase Dependency Map

```
                           ┌─────────────────────────────┐
                           │      PHASE 0: FOUNDATION    │
                           │      15-20 hours            │
                           │      Gate G0: 3-panel app   │
                           └──────────────┬──────────────┘
                                          │
                    ┌─────────────────────┴─────────────────────┐
                    │                                           │
                    ▼                                           ▼
      ┌─────────────────────────┐               ┌─────────────────────────┐
      │    PHASE 1A: CORE       │               │    PHASE 1A: CORE       │
      │    20-30 hours          │               │    20-30 hours          │
      │    Gate G1a: Agents     │               │    Gate G1a: Agents     │
      └────────────┬────────────┘               └────────────┬────────────┘
                   │                                         │
                   └──────────────────┬──────────────────────┘
                                      │
                                      ▼
                    ┌─────────────────────────────────┐
                    │    PHASE 1B: CONTEXT            │
                    │    20-30 hours                  │
                    │    Gate G1b: Notes + Handoff    │
                    └──────────────┬──────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────────┐
                    │    PHASE 2: ENHANCED            │
                    │    30-40 hours                  │
                    │    Gate G2: Auto-summary +      │
                    │             Search works        │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
      ┌─────────────────────────┐     ┌─────────────────────────┐
      │    PHASE 3: ADVANCED    │     │    PHASE 4: DIST        │
      │    40-60 hours          │     │    30-40 hours          │
      │    Gate G3: Browser +   │     │    Gate G4: Installable │
      │             Graph + Collab     │             + Tested   │
      └────────────┬────────────┘     └────────────┬────────────┘
                   │                               │
                   └───────────────┬───────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────────┐
                    │         🚀 SHIP IT!             │
                    └─────────────────────────────────┘
```

---

## 🏗️ Architecture Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LAYER 1: DESKTOP SHELL                           │
│                              (Tauri 2.x + Rust)                            │
│                                                                             │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│   │ Window   │  │ File     │  │ Process  │  │ Sidecar  │                  │
│   │ Manager  │  │ System   │  │ Spawner  │  │ Manager  │                  │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LAYER 2: FRONTEND                                │
│                         (React + TypeScript)                               │
│                                                                             │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│   │  Agent   │  │ Terminal │  │  Memory  │  │Workspace │                  │
│   │ Sidebar  │  │  Panels  │  │  Panel   │  │  View    │                  │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘                  │
│                                                                             │
│   ┌──────────────────────────────────────────────────────────────┐         │
│   │                    Zustand State Store                       │         │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │         │
│   │  │  Agent   │  │ Session  │  │ Project  │                  │         │
│   │  │ Registry │  │ Manager  │  │  Store   │                  │         │
│   │  └──────────┘  └──────────┘  └──────────┘                  │         │
│   └──────────────────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       LAYER 3: Tauri IPC                                    │
│                    (invoke + events)                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Python     │ │   Python     │ │   Python     │ │   SQLite +   │
│   CrewAI     │ │  OpenHands   │ │   Summary    │ │ ContextGraph │
│   Sidecar    │ │    SDK       │ │   Engine     │ │ Memory Layer │
│              │ │              │ │  (Ollama)    │ │              │
│  Crews +     │ │    Agent     │ │              │ │ Project store│
│  Flows       │ │   Runtime    │ │  Summarize   │ │ Memory entries│
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      LAYER 5: TERMINAL LAYER                               │
│                    (node-pty + xterm.js)                                    │
│                                                                             │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
│   │  Claude  │  │  Codex   │  │  Gemini  │  │ OpenCode │                  │
│   │ Terminal │  │ Terminal │  │ Terminal │  │ Terminal │                  │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow: Session Handoff

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SESSION HANDOFF FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

    Agent A (Claude) working...
        │
        ├─► Context capture hook runs every 30s
        │     ├─ snapshot: current prompt, output tail, branch, open files
        │     └─ write to SQLite (episodic memory)
        │
        ├─► User clicks "Handoff to Agent B (Codex)"
        │     │
        │     ├─► CrewAI Flow triggers @router
        │     │     │
        │     │     └─► ContextGraph compiles context pack from recent snapshots
        │     │
        │     ├─► Local LLM (Ollama) generates 3-line summary
        │     │     │
        │     │     └─► Fallback: template-based summary if LLM unavailable
        │     │
        │     ├─► Summary + context pack injected into Agent B's workspace
        │     │
        │     └─► Agent B's terminal auto-focuses
        │
        └─► Memory updated
              ├─ handoff recorded in project timeline
              ├─ "last active agent" = Agent B
              └─ Agent A's session paused (RAM saved)
```

---

## 📊 Implementation Progress Tracker

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CURRENT STATUS: PLANNING COMPLETE                   │
│                         NEXT: PHASE 0 IMPLEMENTATION                        │
└─────────────────────────────────────────────────────────────────────────────┘

Phase 0: Foundation                              [░░░░░░░░░░] 0%
├── 0.1 Fork Jan                                 [░░░░░░░░░░] 0%
├── 0.2 Strip & Reshape                          [░░░░░░░░░░] 0%
├── 0.3 Theme & Design                           [░░░░░░░░░░] 0%
├── 0.4 Sidecar Foundation                       [░░░░░░░░░░] 0%
└── 0.5 Build Verification                       [░░░░░░░░░░] 0%

Phase 1a: Core                                   [░░░░░░░░░░] 0%
├── 1a.1 Agent Registry                          [░░░░░░░░░░] 0%
└── 1a.2 Terminal Multiplexer                    [░░░░░░░░░░] 0%

Phase 1b: Context                                [░░░░░░░░░░] 0%
├── 1b.1 Shared Memory                           [░░░░░░░░░░] 0%
├── 1b.2 Manual Handoff                          [░░░░░░░░░░] 0%
└── 1b.3 Quick Switcher                          [░░░░░░░░░░] 0%

Phase 2: Enhanced                                [░░░░░░░░░░] 0%
├── 2.1 Context Capture                          [░░░░░░░░░░] 0%
├── 2.2 LLM Summarization                        [░░░░░░░░░░] 0%
├── 2.3 Context Search                           [░░░░░░░░░░] 0%
├── 2.4 File Attachments                         [░░░░░░░░░░] 0%
└── 2.5 Memory Consolidation                     [░░░░░░░░░░] 0%

Phase 3: Advanced                                [░░░░░░░░░░] 0%
├── 3.1 Browser Connector                        [░░░░░░░░░░] 0%
├── 3.2 Local Model Router                       [░░░░░░░░░░] 0%
├── 3.3 Task Dependency Graph                    [░░░░░░░░░░] 0%
├── 3.4 War Room                                 [░░░░░░░░░░] 0%
└── 3.5 MCP Integration                          [░░░░░░░░░░] 0%

Phase 4: Distribution                            [░░░░░░░░░░] 0%
├── 4.1 Installer                                [░░░░░░░░░░] 0%
├── 4.2 Onboarding                               [░░░░░░░░░░] 0%
├── 4.3 Testing Suite                            [░░░░░░░░░░] 0%
├── 4.4 Performance                              [░░░░░░░░░░] 0%
└── 4.5 Documentation                            [░░░░░░░░░░] 0%

Overall Progress: 0% complete (22 sub-phases remaining)
```

---

## 🔧 Tech Stack Quick Reference

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TECH STACK                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   DESKTOP SHELL                                                             │
│   ├── Tauri 2.x (Rust backend)                                             │
│   ├── React + TypeScript (Frontend)                                         │
│   └── Forked from: janhq/jan                                                │
│                                                                             │
│   AGENT ORCHESTRATION                                                       │
│   ├── CrewAI (Python sidecar)                                              │
│   └── Flow API for handoffs                                                │
│                                                                             │
│   AGENT EXECUTION                                                           │
│   ├── OpenHands SDK (Python sidecar)                                       │
│   └── Sandboxed, multi-provider                                            │
│                                                                             │
│   TERMINAL                                                                  │
│   ├── xterm.js (browser terminal)                                          │
│   └── node-pty / portable-pty (Rust PTY)                                   │
│                                                                             │
│   MEMORY                                                                    │
│   ├── SQLite via rusqlite                                                   │
│   ├── FTS5 full-text search                                                │
│   └── ContextGraph patterns                                                │
│                                                                             │
│   STATE MANAGEMENT                                                          │
│   └── Zustand (1KB, isolated re-renders)                                   │
│                                                                             │
│   LOCAL INFERENCE                                                           │
│   ├── Ollama                                                                │
│   └── llama.cpp (via Jan fork)                                              │
│                                                                             │
│   BUILD SYSTEM                                                              │
│   ├── Tauri v2                                                              │
│   └── Vite                                                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Gate Criteria (What "Done" Looks Like)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GATE G0: FOUNDATION                              │
├─────────────────────────────────────────────────────────────────────────────┤
│   □ `cargo tauri build` completes without errors                           │
│   □ App launches and shows 3-panel layout                                  │
│   □ Theme switching works (light/dark)                                     │
│   □ Zustand stores initialized (agents, sessions)                          │
│   □ Python sidecar spawns successfully                                     │
│   □ Basic Tauri IPC works (invoke command → response)                      │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           GATE G1a: CORE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│   □ Agent sidebar shows 10 agents with status dots                         │
│   □ Clicking agent opens terminal                                          │
│   □ Terminal accepts input and shows output                                │
│   □ Multiple terminals can run simultaneously                              │
│   □ Terminal session persists when switching tabs                          │
│   □ Split pane works (⌘\)                                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           GATE G1b: CONTEXT                                │
├─────────────────────────────────────────────────────────────────────────────┤
│   □ Memory panel shows notes                                               │
│   □ Can write and save a note                                              │
│   □ Context capture runs every 30s                                         │
│   □ Handoff button available                                               │
│   □ Handoff produces context summary                                       │
│   □ Quick switcher works (⌘K)                                              │
│   □ Keyboard shortcuts functional                                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           GATE G2: ENHANCED                                │
├─────────────────────────────────────────────────────────────────────────────┤
│   □ Context capture is event-driven (git, output, switch)                  │
│   □ Auto-summary generates on handoff                                      │
│   □ Template fallback works when Ollama unavailable                        │
│   □ FTS5 search returns relevant results                                   │
│   □ Search filters by agent/project/type                                   │
│   □ File drag-drop works                                                   │
│   □ Memory pruning keeps size bounded                                      │
│   □ Cold storage archives old sessions                                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           GATE G3: ADVANCED                                │
├─────────────────────────────────────────────────────────────────────────────┤
│   □ WebView loads ChatGPT/Gemini                                           │
│   □ Screenshot captured on handoff                                         │
│   □ Local model router selects Ollama model                                │
│   □ Model comparison shows side-by-side                                    │
│   □ D3.js task graph renders                                               │
│   □ Graph is interactive (click, hover, zoom)                              │
│   □ War room sends to multiple agents                                      │
│   □ Task chaining works (output → next input)                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           GATE G4: DISTRIBUTION                            │
├─────────────────────────────────────────────────────────────────────────────┤
│   □ Windows installer (NSIS) builds and installs                           │
│   □ Auto-update checks and prompts                                         │
│   □ Onboarding wizard completes in < 2 min                                 │
│   □ All unit tests pass (80%+ coverage)                                    │
│   □ All integration tests pass                                             │
│   □ Performance targets met (< 200MB idle)                                 │
│   □ README.md complete                                                     │
│   □ User guide complete                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔗 Cross-Cutting Concerns Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CROSS-CUTTING CONCERNS                                   │
│                    (Apply to ALL phases)                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                 │
│   │   ERROR     │────►│  MONITORING │────►│  SECURITY   │                 │
│   │  HANDLING   │◄────│             │◄────│             │                 │
│   └──────┬──────┘     └──────┬──────┘     └──────┬──────┘                 │
│          │                    │                    │                        │
│          ▼                    ▼                    ▼                        │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                 │
│   │  TESTING    │────►│   CONFIG    │────►│  MIGRATIONS │                 │
│   │  STRATEGY   │◄────│             │◄────│             │                 │
│   └──────┬──────┘     └──────┬──────┘     └──────┬──────┘                 │
│          │                    │                    │                        │
│          ▼                    ▼                    ▼                        │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                 │
│   │  OFFLINE    │────►│ ACCESSIBILITY│────►│   BACKUP    │                 │
│   │  BEHAVIOR   │◄────│             │◄────│   & EXPORT  │                 │
│   └─────────────┘     └─────────────┘     └─────────────┘                 │
│                                                                             │
│   All 10 concerns have bidirectional cross-references (34 total)           │
│   See CROSS-CUTTING-RELATIONSHIPS.md for detailed diagrams                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 How To Use This Document

### For Any Agent Starting Work:

1. **Read this file first** — Understand the project at a glance
2. **Check the phase you're working on** — Find the relevant PHASE-X-*.md
3. **Review cross-cutting concerns** — Check ERROR-HANDLING.md, SECURITY.md, etc.
4. **Check gate criteria** — Know what "done" looks like
5. **Update this document** — Mark progress in the tracker section

### For Code Reviews:

1. **Verify against gate criteria** — Does the change meet the gate requirements?
2. **Check cross-cutting concerns** — Does it handle errors? Is it secure? Is it tested?
3. **Check architecture alignment** — Does it fit the 6-layer architecture?

### For New Team Members:

1. **Read HANDBOOK.md** — Quick orientation
2. **Read this file** — Visual overview
3. **Read ARCHITECTURE.md** — Deep dive into system design
4. **Read the relevant phase plan** — Detailed implementation steps

---

## 📚 Document Quick Reference

| Need to... | Read this document |
|---|---|
| Understand the project | `HANDBOOK.md`, `VISUAL-ROADMAP.md` |
| See the architecture | `ARCHITECTURE.md` |
| Make a design decision | `DESIGN-DECISIONS.md` |
| Find an open-source tool | `OPENSOURCE-INVENTORY.md` |
| Implement Phase 0 | `PHASE-0-FOUNDATION.md` |
| Handle a crash | `ERROR-HANDLING.md` |
| Secure something | `SECURITY.md` |
| Test a feature | `TESTING-STRATEGY.md` |
| Monitor health | `MONITORING.md` |
| Configure something | `CONFIGURATION.md` |
| Migrate the database | `SCHEMA-MIGRATIONS.md` |
| Handle offline | `OFFLINE-BEHAVIOR.md` |
| Make it accessible | `ACCESSIBILITY.md` |
| Backup/export data | `BACKUP-EXPORT.md` |
| Manage phase transitions | `PHASE-TRANSITIONS.md` |
| See all relationships | `CROSS-CUTTING-RELATIONSHIPS.md` |
| Look up a term | `GLOSSARY.md` |
| Find open-source credits | `THANKS.md` |

---

## 📊 Statistics

| Metric | Value |
|---|---|
| Total documents | 25 |
| Phase plans | 6 (22 sub-phases) |
| Cross-cutting concerns | 11 |
| Architecture docs | 3 |
| Meta docs | 2 |
| Estimated hours | 165-220 |
| Quality gates | 6 |
| Open-source references | 32+ |
| Cross-references | 34 bidirectional |

---

*This document is the single source of truth for project state. Update it as work progresses.*
