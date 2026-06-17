# Mothership — Phase 4: Distribution & Polish

**Estimated Time:** 35-45 hours (updated from 30-40)
**Dependencies:** Phase 3 complete
**Gate G4:** Mothership installable via single installer; onboarding walkthrough works; test suite passes

---

## Overview

Phase 4 takes Mothership from a developer tool to a shippable product. This covers installers, auto-update, onboarding, comprehensive testing, performance profiling, and documentation. No new features — just polish, packaging, and reliability.

**Subdivision note:** The original Sub-phase 4.3 (Testing Suite) was 10-14 hours and has been split into 4.3a (Unit/Integration) and 4.3b (E2E/Python).

---

## Open-Source Tools Used

| Tool | Usage | Link |
|---|---|---|
| **Tauri Bundler** | Cross-platform installer generation | https://v2.tauri.app/start/packaging/ |
| **NSIS** | Windows installer | https://nsis.sourceforge.io |
| **Sentry** | Error tracking & telemetry | https://sentry.io |
| **Playwright** | E2E testing | https://playwright.dev |
| **Vitest** | Unit testing | https://vitest.dev |
| **Pytest** | Python sidecar testing | https://docs.pytest.org |

---

## Sub-Phase 4.1: Installer & Auto-Update

**Time:** 8-10 hours ❌ NOT STARTED
**Gate:** One-command install on Windows; auto-update delivers new versions

### Steps

1. Tauri bundler configuration (NSIS for Windows, DMG for macOS)
2. Auto-update setup via GitHub Releases
3. Post-install smoke test
4. First-launch diagnostic log

---

## Sub-Phase 4.2: Onboarding & First-Run Experience

**Time:** 6-8 hours ❌ NOT STARTED
**Gate:** New users complete onboarding in under 2 minutes

### Steps

1. Welcome screen with "Get Started" button
2. 3-step wizard: Welcome → Agent Discovery → First Project
3. Contextual hints on first use (handoff, notes, split)
4. Skippable on every step

---

## Sub-Phase 4.3a: Unit & Integration Tests

**Time:** 6-8 hours ❌ NOT STARTED
**Gate:** Rust + frontend unit tests pass with 80%+ coverage

### Steps

1. **Rust unit tests** (`cargo test`):
   - SQLite commands (write_note, search_memory, record_handoff)
   - Terminal PTY management (spawn, write, resize, kill)
   - IPC command handlers
   - FileSystemGuard path traversal prevention

2. **Frontend unit tests** (Vitest + React Testing Library):
   - Zustand stores (agentStore, memoryStore, workspaceStore)
   - Components (AgentSidebar, MemoryPanel, TerminalPane)
   - Fuzzy search scoring

3. **CI pipeline** (`.github/workflows/test.yml`):
   - cargo fmt --check && cargo clippy && cargo test
   - npm run lint && npm run test:run && npm run build

---

## Sub-Phase 4.3b: E2E & Python Sidecar Tests

**Time:** 4-6 hours ❌ NOT STARTED
**Gate:** E2E critical flow works; Python sidecars tested

### Steps

1. **Playwright E2E tests:**
   - Full handoff flow (agent → terminal → handoff → next agent)
   - Terminal session persistence (switch tabs, verify state preserved)
   - Memory search (write note, search, verify results)

2. **Python sidecar tests** (Pytest):
   - Handoff flow state machine
   - Summary engine (template fallback, LLM integration)
   - CrewAI Flow lifecycle

3. **Coverage thresholds:** 80%+ branches, functions, lines

---

## Sub-Phase 4.4: Performance Profiling & Optimization

**Time:** 4-6 hours ❌ NOT STARTED
**Gate:** Mothership idle RAM < 200MB; handoff < 500ms

### Targets

| Metric | Target |
|---|---|
| Idle RAM | < 200MB |
| Active RAM (1 terminal) | < 300MB |
| Handoff latency | < 500ms |
| Terminal switch time | < 200ms |
| Cold start | < 3s |
| Memory search (FTS5) | < 100ms |

### Steps

1. Lazy load panels (mount on first activation, unmount after 10 min)
2. Terminal pausing (stop PTY output when hidden)
3. SQLite WAL mode + cache optimization
4. Batch memory writes (queue, flush every 2s)

---

## Sub-Phase 4.5: Documentation

**Time:** 4-6 hours ❌ NOT STARTED
**Gate:** README.md, ARCHITECTURE.md, and user guide complete

### Steps

1. **README.md** — Project description, quick start, build from source
2. **User guide** (`docs/USER_GUIDE.md`) — Panel walkthrough, agent setup, keyboard shortcuts
3. **Developer guide** (`docs/DEV_GUIDE.md`) — Architecture, adding agents, sidecar development
4. **CONTRIBUTING.md** (if open-source)

---

## Phase 4 Deliverable Checklist

- [ ] Windows installer (NSIS) — (4.1)
- [ ] Auto-update — (4.1)
- [ ] Onboarding wizard — (4.2)
- [ ] Unit tests (Rust + frontend, 80%+ coverage) — (4.3a)
- [ ] E2E tests (Playwright) — (4.3b)
- [ ] Python sidecar tests (Pytest) — (4.3b)
- [ ] Performance targets met — (4.4)
- [ ] README.md — (4.5)
- [ ] User guide — (4.5)

---

## Phase 4 Completion Criteria

> **Gate G4:** A new user can download Mothership, install it with one click, complete onboarding in under 2 minutes, start using agents immediately, and have automatic updates delivered. All tests pass at 80%+ coverage. RAM stays under 200MB idle.
