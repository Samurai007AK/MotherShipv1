# Mothership — Key Design Decisions

**Last Updated:** 2026-06-15

---

This document records significant architectural decisions, the alternatives considered, and the rationale for each choice.

---

## Decision 1: Tauri over Electron

| | Tauri 2.x | Electron |
|---|---|---|
| **Binary size** | ~5-10MB | ~100-200MB |
| **RAM usage** | ~10-50MB idle | ~100-300MB idle |
| **Backend language** | Rust (safe, fast) | Node.js |
| **WebView** | OS-native (WebView2/WKWebView) | Bundled Chromium |
| **Learning curve** | Moderate (Rust) | Low (JS) |

**Decision:** Tauri 2.x

**Rationale:** Mothership's #1 constraint is running well on low-RAM laptops. Tauri's ~10MB RAM baseline vs Electron's ~100MB is a 10x difference. Rust gives us safe filesystem and process management without the overhead of Node.js. The existing Jan fork is already Tauri, so this aligns with our fork strategy.

**Trade-off:** Rust/TypeScript boundary is more work than pure JS. We accept this for the RAM savings.

---

## Decision 2: Fork Jan vs Build from Scratch

| | Fork Jan | Build from Scratch |
|---|---|---|
| **Time to MVP** | ~2 weeks | ~6-8 weeks |
| **Model management** | Built-in (Ollama, llama.cpp) | Must build |
| **Theme/UI** | Production quality | Must design |
| **Build system** | Working (Tauri + Vite) | Must configure |
| **Upstream drift risk** | Yes (merge conflicts) | None |

**Decision:** Fork Jan.

**Rationale:** Jan already has everything we need for the desktop shell — Tauri config, model management, theme system, updater. Stripping chat UI is faster than rebuilding all of that from zero. We keep the fork shallow (only touch UI layer + add sidecars) to minimize merge conflicts.

**Mitigation:** Pin to specific Jan release tags. Keep our changes in `mothership/` prefixed branches.

---

## Decision 3: CrewAI over LangGraph

| | CrewAI | LangGraph |
|---|---|---|
| **Language** | Python (standalone) | Python (LangChain) |
| **Speed** | Claims 5.76x faster | Baseline |
| **Orchestration** | Flows (event-driven) | StateGraph (manual graph) |
| **Learning curve** | Low (decorators) | High (graph theory) |
| **Dependencies** | Standalone (no LangChain) | Tightly coupled to LangChain |
| **Community** | 53K stars, active | Established but heavier |

**Decision:** CrewAI.

**Rationale:** CrewAI's Flow API (`@start`, `@listen`, `@router`) maps directly to our handoff orchestration needs. It's standalone — no LangChain dependency. Published benchmarks show significantly faster execution. The Python sidecar pattern is well-tested.

**Trade-off:** We double up Python runtimes (CrewAI + OpenHands). Acceptable because both are lightweight sidecars.

---

## Decision 4: OpenHands SDK over Direct CLI Integration

| | OpenHands SDK | Direct CLI Spawning |
|---|---|---|
| **Agent execution** | Composable, sandboxed | Raw terminal |
| **Multi-provider** | Built-in (Claude, GPT, Gemini) | Per-tool CLI flags |
| **Sandbox** | Docker isolation | None |
| **API surface** | Python SDK + REST | PTY I/O |
| **Control** | Programmatic | String parsing |

**Decision:** OpenHands SDK for agent execution.

**Rationale:** OpenHands provides a production-grade agent execution runtime with sandboxing and multi-provider support. Terminal output goes through OpenHands sessions → Mothership's terminal panels. This saves us from writing our own agent sandbox and provider abstraction.

**Note:** CLI agents (Claude Code, Codex, etc.) still run in PTY sessions. OpenHands is for API-based execution. Both coexist.

---

## Decision 5: SQLite + Pattern-Based Memory vs Dedicated Vector Store

| | SQLite + Patterns | Qdrant / Pinecone / Chroma |
|---|---|---|
| **Setup** | Zero (bundled) | External service or Docker |
| **Latency** | <1ms (local) | 5-50ms (network) |
| **Search quality** | FTS5 (good for keywords) | Semantic (good for meaning) |
| **RAM overhead** | ~5MB | ~200MB+ |
| **Offline** | Yes | Requires network for cloud |

**Decision:** SQLite + pattern-based memory (Phase 1-2), upgrade to vector search in Phase 3 if needed.

**Rationale:** For MVP, keyword search via FTS5 is sufficient. Vector search adds operational complexity and RAM overhead. The pattern-based approach is inspired by ContextGraph (governed shared memory), Zengram (dual storage), and Lore (auto-capture).

**Upgrade path:** Add `pgvector` or SQLite's own vector extension (`sqlite-vec`) in Phase 3 for semantic search.

---

## Decision 6: Python Sidecars vs All-in-Rust

| | Python Sidecars | Rust Native |
|---|---|---|
| **CrewAI** | ✅ First-class | Port needed (months) |
| **OpenHands** | ✅ First-class | Port needed (months) |
| **Memory layer** | Rust (rusqlite) | Rust |
| **Terminal** | Rust (portable-pty) | Rust |
| **IPC overhead** | STDIO JSON-RPC (~0.1ms) | None (in-process) |

**Decision:** Python sidecars for orchestration + execution; Rust for everything else.

**Rationale:** CrewAI and OpenHands are Python-native. Porting them to Rust would take months and constantly lag upstream. Instead, run them as sidecar processes managed by Tauri's Rust backend. Communication via JSON-RPC over STDIO (lightweight, no HTTP overhead).

---

## Decision 7: Zustand over Redux / Context

| | Zustand | Redux | React Context |
|---|---|---|---|
| **Bundle size** | 1KB | 12KB | 0KB (built-in) |
| **Boilerplate** | Minimal | Actions, reducers, dispatch | Provider, context, hooks |
| **TypeScript** | Excellent | Good | Manual |
| **Performance** | Isolated re-renders | Connected components | Re-renders all consumers |
| **Middleware** | Built-in (immer, devtools) | Extensive | None |

**Decision:** Zustand.

**Rationale:** 1KB, zero boilerplate, excellent TypeScript support, and isolated re-renders. The same choice made by AgentHub.

---

## Decision 8: Per-Agent PTY Sessions vs Shared Terminal

| | Per-Agent PTY | Shared Terminal |
|---|---|---|
| **Isolation** | Complete | None (agents interfere) |
| **Resource usage** | Higher (~10MB per session) | Lower |
| **Session resume** | Agent-specific | Full history mixed |
| **RAM optimization** | Pause hidden sessions | Always running |
| **Debugging** | Clear attribution | "Who did what?" |

**Decision:** Per-agent PTY sessions with pause/resume.

**Rationale:** Isolation is critical — agents should not see each other's terminal output. The RAM cost is acceptable because we pause hidden sessions (Phase 1 delivers this). Pattern inspired by Herdr and Agent of Empires.

---

## Decision 9: Windows First (then macOS/Linux)

**Decision:** Develop on Windows first, then port.

**Rationale:** The user's laptop is Windows. Windows has the most challenging PTY situation (ConPTY vs WinPTY). Getting it right on Windows first ensures the hardest platform is solved. Reference winsmux for Windows-native patterns.

macOS and Linux benefit from native PTY support via `forkpty`.

---

## Decision 10: Credits & Attribution Strategy

**Decision:** Create `THANKS.md` with explicit attribution to all projects referenced.

**Rationale:** We use open-source projects as references and patterns, not as copied code. Attribution in a THANKS.md acknowledges the influence transparently. Each Phase document already links to the specific patterns borrowed from each project.

We do not set up a CLA or Contributor License Agreement unless we accept external contributions.

---

## Design Decision Log

| # | Date | Decision | Revisit By |
|---|---|---|---|
| 1 | 2026-06-15 | Tauri over Electron | Never |
| 2 | 2026-06-15 | Fork Jan | After Phase 1 complete |
| 3 | 2026-06-15 | CrewAI over LangGraph | If performance issues arise |
| 4 | 2026-06-15 | OpenHands SDK for execution | After Phase 1 MVP |
| 5 | 2026-06-15 | SQLite + patterns for memory | Start of Phase 3 |
| 6 | 2026-06-15 | Python sidecars for orchestration | Never (CrewAI/OpenHands are Python) |
| 7 | 2026-06-15 | Zustand for state | Never |
| 8 | 2026-06-15 | Per-agent PTY sessions | After Phase 1 perf testing |
| 9 | 2026-06-15 | Windows first | After Phase 1 MVP |
| 10 | 2026-06-15 | THANKS.md attribution | Before first public release |
