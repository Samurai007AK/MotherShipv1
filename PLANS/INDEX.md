# Mothership — Desktop AI Control Center

**Project Codename:** Mothership
**Tagline:** One control plane, many workers.
**Mission:** A desktop AI workspace that unifies browser-based and local agents into one memory-aware control center, with isolated terminal sessions, shared context, and lightweight switching for low-RAM laptops.

---

## Document Map

| Document | Purpose |
|---|---|
| [`PLAN.md`](../PLAN.md) | Master plan — phases, timeline, risks, dependencies |
| [`VISUAL-ROADMAP.md`](./VISUAL-ROADMAP.md) | Visual diagrams — project at a glance for any agent |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | System architecture, stack decisions, data flow |
| [`OPENSOURCE-INVENTORY.md`](./OPENSOURCE-INVENTORY.md) | Catalog of all open-source tools leveraged |
| [`PHASE-0-FOUNDATION.md`](./PHASE-0-FOUNDATION.md) | Fork Jan, scaffold Tauri, establish patterns |
| [`PHASE-1A-CORE.md`](./PHASE-1A-CORE.md) | Agent registry + per-agent terminal multiplexer |
| [`PHASE-1B-CONTEXT.md`](./PHASE-1B-CONTEXT.md) | Shared memory layer + context capture + manual handoff |
| [`PHASE-2-ENHANCED.md`](./PHASE-2-ENHANCED.md) | Auto-summarization, context retrieval, file attachments |
| [`PHASE-3-ADVANCED.md`](./PHASE-3-ADVANCED.md) | Browser connectors, local models, task graphs, multi-agent |
| [`PHASE-4-DISTRIBUTION.md`](./PHASE-4-DISTRIBUTION.md) | Installer, onboarding, testing, documentation, polish |
| [`DESIGN-DECISIONS.md`](./DESIGN-DECISIONS.md) | Key architectural decisions and rationale |
| [`GLOSSARY.md`](./GLOSSARY.md) | Terminology reference |

### Ralph-Inspired Loop Engine

| Document | Purpose |
|---|---|
| [`LOOPS.md`](./LOOPS.md) | Agentic execution loops — iterative agent work pattern |
| [`MOTHERSHIP-RALPH.md`](./MOTHERSHIP-RALPH.md) | Native Ralph implementation — terminal loop engine with Zustand state |
| [`QUALITY-GATE.md`](./QUALITY-GATE.md) | Pre-commit quality validation — typecheck/test/lint before commit |
| [`AUTO-ARCHIVE.md`](./AUTO-ARCHIVE.md) | Automatic session archival on branch change and feature completion |
| [`MOTHERSHIP-RALPH-ROADMAP.md`](./MOTHERSHIP-RALPH-ROADMAP.md) | Unified implementation roadmap — phased development plan |
| [`UNIFIED-STORE.md`](./UNIFIED-STORE.md) | Unified Zustand store — loop, quality gates, and archive coordination |
| [`MOTHERSHIP-RALPH-COMMANDS.md`](./MOTHERSHIP-RALPH-COMMANDS.md) | Tauri IPC command reference — all request/response types |
| [`MOTHERSHIP-RALPH-GLOSSARY.md`](./MOTHERSHIP-RALPH-GLOSSARY.md) | Canonical type definitions — single source of truth for all Ralph-loop types |
| [`MOTHERSHIP-RALPH-TESTS.md`](./MOTHERSHIP-RALPH-TESTS.md) | Unit and integration test specifications for all Rust modules |

### Cross-Cutting Concerns

| Document | Purpose |
|---|---|
| [`ERROR-HANDLING.md`](./ERROR-HANDLING.md) | Sidecar crashes, SQLite corruption, terminal recovery, graceful degradation |
| [`SECURITY.md`](./SECURITY.md) | Sandbox isolation, IPC security, secrets management, agent permissions |
| [`TESTING-STRATEGY.md`](./TESTING-STRATEGY.md) | Unit, integration, and E2E testing across all layers from Phase 0 |
| [`MONITORING.md`](./MONITORING.md) | Logging, health checks, resource monitoring, crash reporting |
| [`CONFIGURATION.md`](./CONFIGURATION.md) | User preferences, agent config schema, project settings |
| [`SCHEMA-MIGRATIONS.md`](./SCHEMA-MIGRATIONS.md) | SQLite versioning, migration runner, rollback procedures |
| [`OFFLINE-BEHAVIOR.md`](./OFFLINE-BEHAVIOR.md) | Offline mode, local inference, data sync, degraded functionality |
| [`ACCESSIBILITY.md`](./ACCESSIBILITY.md) | WCAG compliance, screen readers, keyboard nav, color contrast |
| [`BACKUP-EXPORT.md`](./BACKUP-EXPORT.md) | Project backup, memory export, data portability, import |
| [`PHASE-TRANSITIONS.md`](./PHASE-TRANSITIONS.md) | Rollback procedures, parallel work, dependency tracking, gate validation |
| [`CROSS-CUTTING-RELATIONSHIPS.md`](./CROSS-CUTTING-RELATIONSHIPS.md) | Visual diagrams showing relationships between all 10 concerns |

---

## Quick Reference — Tools Stack

| Layer | Primary Tool | Secondary / Reference |
|---|---|---|
| Desktop Shell | [Jan](https://github.com/janhq/jan) (fork) | [Synapse](https://github.com/droxer/HiAgent), [OpenFlux](https://github.com/EDEAI/OpenFlux) |
| Multi-Agent Orchestration | [CrewAI](https://github.com/crewAIInc/crewAI) | [Orkas](https://github.com/Orkas-AI/Orkas), [Shogun](https://github.com/AlphaHorizon-AI/Shogun) |
| Agent Execution Runtime | [OpenHands SDK](https://github.com/OpenHands/OpenHands) | [OpenAgentd](https://github.com/lthoangg/openagentd) |
| Terminal Multiplexer | [xterm.js](https://xtermjs.org) + node-pty | [Herdr](https://github.com/ogulcancelik/herdr), [AoE](https://github.com/njbrake/agent-of-empires) |
| Shared Memory / Context | [ContextGraph](https://github.com/AllenMaxi/ContextGraph) + custom | [Zengram](https://github.com/ZenSystemAI/Zengram), [Lore](https://github.com/agentkitai/lore), [nmem](https://github.com/dayyanj/nmem) |
| Local LLM Inference | [Jan's built-in Ollama](https://ollama.ai) + [llama.cpp](https://github.com/ggerganov/llama.cpp) | [OpenFlux](https://github.com/EDEAI/OpenFlux) Playwright integration |
| State Management (Frontend) | [Zustand](https://github.com/pmndrs/zustand) | [AgentHub](https://github.com/Albaloola/AgentHub) patterns |
| Build System | Tauri v2 + Vite | [Synapse](https://github.com/droxer/HiAgent) Tauri config |

---

## Source of Truth

- **Plan docs:** `E:\Mother\PLANS\`
- **Code:** `E:\Mother\src\`
- **Config:** `E:\Mother\tauri.conf.json`, `E:\Mother\openflux.yaml`

---

## Quick Navigation

| Phase | Focus | Est. Hours | Depends On |
|---|---|---|---|---|
| [Phase 0](./PHASE-0-FOUNDATION.md) | Fork Jan, scaffold, establish patterns | 15-20 | — |
| [Phase 1a](./PHASE-1A-CORE.md) | Agent registry + terminal multiplexer | 20-30 | Phase 0 |
| [Phase 1b](./PHASE-1B-CONTEXT.md) | Shared memory + context capture + handoff | 20-30 | Phase 1a |
| [Phase 2](./PHASE-2-ENHANCED.md) | Auto-summarization, context retrieval, files | 30-40 | Phase 1b |
| [Phase 3](./PHASE-3-ADVANCED.md) | Browser, local models, task graphs, collab | 40-60 | Phase 2 |
| [Phase 4](./PHASE-4-DISTRIBUTION.md) | Installer, onboarding, testing, docs, polish | 30-40 | Phase 3 |

---

## Document Count Summary

| Category | Count |
|---|---|
| Phase Plans | 6 (Phase 0-4 + 1a/1b split) |
| Architecture & Design | 3 (Architecture, Design Decisions, Glossary) |
| Ralph Loop Engine | 9 (Loops, Ralph, Quality Gate, Archive, Roadmap, Store, Commands, Glossary, Tests) |
| Cross-Cutting Concerns | 11 (10 concerns + 1 relationship diagram) |
| Meta | 2 (Plan, Handbook) |
| **Total** | **31 documents** |

---

*Last updated: 2026-06-16*
