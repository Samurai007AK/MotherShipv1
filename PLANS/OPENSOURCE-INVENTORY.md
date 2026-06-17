# Mothership — Open-Source Tools Inventory

**Last Updated:** 2026-06-15
**Total Tools Catalogued:** 32

---

This document catalogs every open-source tool referenced in Mothership's design. Tools are categorized by how they are used:

| Badge | Meaning |
|---|---|
| **🔌 EMBED** | Directly integrated as a dependency |
| **📦 FORK** | Forked and modified |
| **📖 REFERENCE** | Architecture/UX inspiration, no code reuse |
| **🔬 PATTERN** | Implementation patterns adopted, no direct dependency |
| **⚙️ RUNTIME** | Required as a runtime dependency |

---

## Tier 1: Desktop Shell & UI

### Jan — Open-source ChatGPT Alternative
- **URL:** https://github.com/janhq/jan
- **Stars:** 43K
- **License:** Apache 2.0
- **Usage:** **📦 FORK**
- **Stack:** Tauri 2.x + React + TypeScript + Rust
- **What We Take:**
  - Tauri configuration and build system
  - Three-panel chat UI layout (repurposed for agent dashboard)
  - Theme system (light/dark, CSS variables)
  - Model management UI (model download, local inference control)
  - Ollama integration + llama.cpp bindings
  - Windows/macOS/Linux installer config
- **What We Change:**
  - Strip single-chat interface → multi-agent sidebar
  - Add terminal multiplexer panels
  - Add memory panel (replaces chat history list)
  - Add sidecar process management (CrewAI, OpenHands)

### Synapse — AI Agent Platform (Tauri v2 Reference)
- **URL:** https://github.com/droxer/HiAgent
- **Stars:** 5
- **License:** Apache 2.0
- **Usage:** **🔬 PATTERN**
- **What We Learn:**
  - Tauri sidecar process lifecycle management (backend + frontend as sidecars)
  - FastAPI + Tauri integration pattern
  - xterm.js embedding approach

### OpenFlux — Multi-LLM Desktop Client
- **URL:** https://github.com/EDEAI/OpenFlux
- **Stars:** 217
- **License:** MIT
- **Usage:** **🔬 PATTERN**
- **What We Learn:**
  - `openflux.yaml` configuration pattern for multi-provider setup
  - Playwright browser automation integration
  - Long-term memory + vector store architecture
  - Multi-agent routing and tool permissions

---

## Tier 2: Multi-Agent Orchestration

### CrewAI — Multi-Agent Orchestration Framework
- **URL:** https://github.com/crewAIInc/crewAI
- **Stars:** 53.6K
- **License:** MIT
- **Usage:** **🔌 EMBED**
- **Stack:** Python, standalone (no LangChain)
- **What We Use:**
  - **`Crew`** — role-based agent teams with autonomous collaboration
  - **`Flow`** — event-driven orchestration with `@start`, `@listen`, `@router`
  - **`or_` / `and_`** — conditional flow routing
  - **Pydantic structured state** — typed state management across handoffs
  - **Human-in-the-loop** — approval gates on sensitive actions
- **Integration:**
  - Runs as a Python sidecar process spawned by Tauri
  - REST API interface on `localhost:4891`
  - One Flow instance per project session
  - Flow routes trigger on handoff events from UI

### Orkas — Multi-Agent Desktop Client
- **URL:** https://github.com/Orkas-AI/Orkas
- **Stars:** 23
- **License:** MIT
- **Stack:** Electron + TypeScript
- **Usage:** **📖 REFERENCE**
- **What We Learn:**
  - Commander + sub-agent architecture pattern
  - Self-evolving agents via reflection
  - Visual agent management UI (no-code agent builder)

### Shogun — AI Command Center
- **URL:** https://github.com/AlphaHorizon-AI/Shogun
- **Stars:** 2
- **License:** Not specified
- **Usage:** **📖 REFERENCE**
- **What We Learn:**
  - "Tenshu" mission control dashboard design
  - Samurai sub-agent architecture
  - Semantic memory with salience scoring
  - Visual workflow builder concept

### Open Agentd — Desktop Cockpit for Local AI Agents
- **URL:** https://github.com/lthoangg/openagentd
- **Stars:** 196
- **License:** Apache 2.0
- **Stack:** Python + TypeScript + Rust, Tauri
- **Usage:** **📖 REFERENCE**
- **What We Learn:**
  - Lead agent spawns specialist executors pattern
  - Split view (agent stream + debug)
  - Session resume with `/continue`
  - 15 provider integrations

### Drodo — AI Agent Platform (Tauri Desktop)
- **URL:** https://github.com/Drodo44/Drodo.io
- **Stars:** 2
- **License:** Other
- **Usage:** **📖 REFERENCE**
- **What We Learn:**
  - 2,397 AI skill orchestration approach
  - n8n workflow automation embedding
  - Multi-agent swarm with live mission control
  - Windows CI automation patterns

---

## Tier 3: Agent Execution

### OpenHands — AI-Driven Development SDK
- **URL:** https://github.com/OpenHands/OpenHands
- **Stars:** 77.2K
- **License:** MIT
- **Usage:** **🔌 EMBED**
- **Stack:** Python + TypeScript
- **What We Use:**
  - **Software Agent SDK** — composable agent execution runtime
  - **Sandbox** — Docker-based isolated execution per agent
  - **Multi-provider routing** — Claude, GPT, Gemini through one interface
  - **AgentServer** — remote agent execution over WebSocket
- **Integration:**
  - Runs as a Python sidecar
  - Mothership terminal panels connect to OpenHands sessions
  - File operations through OpenHands sandbox
  - Combines with CrewAI: CrewAI orchestrates, OpenHands executes

### Nexus — Multi-Agent Orchestration (3 Modes)
- **URL:** https://github.com/sontianye/nexus
- **Stars:** Not specified
- **License:** MIT
- **Usage:** **📖 REFERENCE**
- **What We Learn:**
  - 3 orchestration modes: Graph (DAG), Router (LLM triage), Adaptive (embedding)
  - 100+ LLM providers via LiteLLM
  - Token budget management
  - MCP + A2A protocol support

### Overseer — Reliable Multi-Agent Framework
- **URL:** https://github.com/nikitavivat/Overseer
- **Stars:** Not specified
- **License:** Not specified
- **Usage:** **🔬 PATTERN**
- **What We Learn:**
  - Built-in quality verifiers as first-class nodes
  - Snapshot-based persistence (SQLite + JSON)
  - Retry budgets + user intervention
  - Live UI with graph visualization

---

## Tier 4: Terminal Multiplexing

### Herdr — Agent-Aware Terminal Multiplexer
- **URL:** https://github.com/ogulcancelik/herdr
- **Stars:** 5,561
- **License:** Other
- **Stack:** Rust TUI
- **Usage:** **🔬 PATTERN**
- **What We Learn:**
  - Agent status detection (blocked, working, done) from PTY output
  - Workspace / tab / pane management in React (we reimplement in web)
  - Mouse-native split pane (click, drag, resize)
  - Detach/reattach session lifecycle
  - Socket API for agent orchestration

### Agent of Empires (AoE) — AI Agent Session Manager
- **URL:** https://github.com/njbrake/agent-of-empires
- **Stars:** 1,497
- **License:** MIT
- **Stack:** Rust + tmux
- **Usage:** **🔬 PATTERN**
- **What We Learn:**
  - Git worktrees for parallel agent branches
  - Docker sandboxing per session
  - Diff view for reviewing agent changes
  - Per-repo config (`.agent-of-empires/config.toml`)
  - 9 agent support with auto-detection

### Tether — Desktop Session Multiplexer
- **URL:** https://github.com/maxthomas95/tether
- **Stars:** 2
- **License:** MIT
- **Stack:** Electron + xterm.js + node-pty
- **Usage:** **🔬 PATTERN**
- **What We Learn:**
  - PTY multiplexer architecture (dumb pipe, smart shell)
  - SSH session support via ssh2
  - Session grouping by working directory
  - Environment management + env vars per session

### CodeHub — Tauri + Docker Agent Manager
- **URL:** https://github.com/mpolatcan/codehub
- **Stars:** 2
- **License:** MIT
- **Stack:** Tauri 2.x + Docker + tmux
- **Usage:** **🔬 PATTERN**
- **What We Learn:**
  - Tauri + tmux integration pattern
  - Permission modes (Standard / Auto / YOLO)
  - Command palette implementation
  - Keyboard shortcut system

### winsmux — Windows-Native Agent Multiplexer
- **URL:** https://github.com/Sora-bluesky/winsmux
- **Stars:** Not specified
- **License:** Not specified
- **Stack:** Rust (ConPTY)
- **Usage:** **🔬 PATTERN**
- **What We Learn:**
  - Windows-native ConPTY pane management (no WSL!)
  - tmux-compatible runtime on Windows
  - Multi-agent orchestration from terminal surface
  - Decision cockpit for comparing agent runs

### gmux — Web-First Process Manager
- **URL:** https://github.com/gmuxapp/gmux
- **Stars:** Not specified
- **License:** Not specified
- **Stack:** Go + xterm.js + Preact
- **Usage:** **🔬 PATTERN**
- **What We Learn:**
  - 128KB scrollback replay on reconnect
  - Session lifecycle (live status, exit codes, kill from UI)
  - Runner-authoritative architecture
  - Phone-friendly responsive design

### dx-terminal — AI-Native Terminal Multiplexer
- **URL:** https://github.com/pdaxt/dx-terminal
- **Stars:** 2
- **License:** MIT
- **Stack:** Rust (Ratatui)
- **Usage:** **🔬 PATTERN**
- **What We Learn:**
  - 16+ agent monitoring from one screen
  - Priority-based task queue routing
  - Real-time status detection (Idle, Working, Awaiting, Error)
  - Multi-interface (TUI + Web + SSE + REST)

### CodeMux — Server-Client Agent Multiplexer
- **URL:** https://github.com/codemuxlab/codemux-cli
- **Stars:** Not specified
- **License:** Not specified
- **Usage:** **🔬 PATTERN**
- **What We Learn:**
  - React Native mobile UI for agent management
  - Smart prompt detection with web UI components
  - Project management via centralized sessions
  - WebSocket-based real-time updates

---

## Tier 5: Shared Memory & Context

### ContextGraph — Shared Memory Bus for MCP Agents
- **URL:** https://github.com/AllenMaxi/ContextGraph
- **Stars:** Not specified
- **License:** Not specified
- **Usage:** **🔬 PATTERN**
- **What We Learn:**
  - **Governed shared memory** — agents share facts with provenance and ACLs
  - **Delta compaction** — checkpoint coding sessions across compaction boundaries
  - **Context packs** — token-budgeted, explainable context compilation
  - **Branch-aware cache** — fork sessions from checkpoints
  - **MCP adapter** — expose memory as MCP tools
- **Integration:**
  - Core design inspiration for Mothership's memory layer
  - Context compiler pattern adapted to SQLite
  - Delta compaction → session handoff summaries

### Zengram — Multi-Agent Shared Memory
- **URL:** https://github.com/ZenSystemAI/Zengram
- **Stars:** Not specified
- **License:** Not specified
- **Stack:** Qdrant + SQLite/Postgres + MCP
- **Usage:** **🔬 PATTERN**
- **What We Learn:**
  - **Cross-agent briefings** — "What happened since I was last here?"
  - Dual storage (vector + structured) — Qdrant for semantic, SQLite for queries
  - MCP server with 14 tools
  - Credential scrubbing before storage
  - Entity extraction + LLM consolidation

### Lore — Universal AI Memory Layer
- **URL:** https://github.com/agentkitai/lore
- **Stars:** Not specified
- **License:** Not specified
- **Python + TypeScript SDK + MCP**
- **Usage:** **🔬 PATTERN**
- **What We Learn:**
  - **Auto-injection** into prompts via hooks (agents don't know Lore exists)
  - One-command hook install for all major coding agents
  - Semantic search with TTL, importance scoring, temporal decay
  - Knowledge graph query (hop-by-hop traversal)
  - Fact extraction (subject, predicate, object)

### ourmem — Shared Persistent Memory
- **URL:** https://github.com/ourmem/omem
- **Stars:** Not specified
- **License:** Not specified
- **Usage:** **🔬 PATTERN**
- **What We Learn:**
  - Three-tier spaces (Personal / Team / Organization)
  - Weibull decay model for memory lifecycle
  - 11-stage hybrid retrieval (vector + BM25 + reranker + MMR)
  - Provenance tracking for shared memories
  - Space-based sharing across agents

### MAGI — Universal Memory Server
- **URL:** https://github.com/j33pguy/magi
- **Stars:** Not specified
- **License:** Not specified
- **Stack:** Rust + SQLite + gRPC + MCP
- **Usage:** **📖 REFERENCE**
- **What We Learn:**
  - Multi-protocol memory server (MCP + gRPC + REST)
  - Knowledge graph auto-linking
  - Behavioral pattern detection
  - 24 MCP tools for integration
  - Async write pipeline (202 Accepted in <10ms)

### nmem — 6-Tier Memory Hierarchy
- **URL:** https://github.com/dayyanj/nmem
- **Stars:** Not specified
- **License:** Not specified
- **Usage:** **📖 REFERENCE**
- **What We Learn:**
  - Working → Journal → LTM → Shared Knowledge + Entity + Policy
  - **Social learning** — agents vote with queries to promote shared knowledge
  - 10-step consolidation engine
  - Hybrid search (pgvector + FTS BM25 + recency)

### memX — Real-Time Shared Memory Layer
- **URL:** https://github.com/MehulG/memX
- **Stars:** Not specified
- **License:** MIT
- **Stack:** FastAPI + Redis + WebSocket
- **Usage:** **📖 REFERENCE**
- **What We Learn:**
  - Pub/sub real-time memory synchronization
  - JSON Schema validation per key
  - SDK pattern for agent integration
  - Last-write-wins with timestamps

### ContextLoom — Shared Context for Multi-Agent
- **URL:** https://github.com/danielckv/ContextLoom
- **Stars:** Not specified
- **License:** Not specified
- **Usage:** **📖 REFERENCE**
- **What We Learn:**
  - Redis-first context state for sub-millisecond retrieval
  - Framework-agnostic connectors (CrewAI, DSPy, Agno)
  - Cycle detection — flags agent loops via hash comparison
  - Cold start hydration from SQL/NoSQL databases

### Akasha — Shared Cognitive Fabric
- **URL:** https://github.com/ocuil/akasha-public
- **Stars:** Not specified
- **License:** Not specified
- **Usage:** **📖 REFERENCE**
- **What We Learn:**
  - 4-layer memory (Working → Episodic → Semantic → Procedural)
  - **Stigmergy / pheromones** — agents coordinate without direct communication
  - Nidra consolidation engine (time-based, configurable)
  - Globbing patterns for agent state queries

---

## Tier 6: Specialized & Emerging

### Open Multi-Agent — TypeScript-Native Orchestration
- **URL:** https://github.com/open-multi-agent/open-multi-agent
- **Stars:** Not specified
- **License:** Not specified
- **Usage:** **📖 REFERENCE**
- **What We Learn:**
  - Goal-to-task DAG decomposition (alternative to CrewAI graph building)
  - Only 3 runtime dependencies
  - `runTeam(team, goal)` one-call orchestration

### SwarmKit — YAML-Defined Agent Swarms
- **URL:** https://github.com/delivstat/swarmkit
- **Stars:** Not specified
- **License:** Not specified
- **Usage:** **📖 REFERENCE**
- **What We Learn:**
  - YAML topology → LangGraph compilation
  - IAM scopes + policy engine
  - Hash-chained audit trail
  - 7,000+ MCP server integration

### Praxia — Workflow-Specific Multi-Agent Orchestrator
- **URL:** https://github.com/praxia-dev/praxia
- **Stars:** Not specified
- **License:** Apache 2.0
- **Usage:** **📖 REFERENCE**
- **What We Learn:**
  - Auto personal-to-org knowledge promotion
  - 6 pluggable LTM backends
  - Hallucination detection + retrieval evals built-in

### Orloj — Production Agent Orchestration Runtime
- **URL:** https://github.com/OrlojHQ/orloj
- **Stars:** Not specified
- **License:** Not specified
- **Stack:** Go + NATS JetStream + Kubernetes
- **Usage:** **📖 REFERENCE**
- **What We Learn:**
  - YAML resource definitions for agents, tools, policies
  - Workers with leases, heartbeats, retries
  - Not an agent framework — infrastructure for agents

### Agentic Titan — Polymorphic Agent Swarm
- **URL:** https://github.com/a-organvm/agentic-titan
- **Stars:** 5
- **License:** Not specified
- **Usage:** **📖 REFERENCE**
- **What We Learn:**
  - 9 topology patterns (swarm, hierarchy, pipeline, mesh, ring, star, etc.)
  - Runtime topology switching based on task analysis
  - Agent Forge — declarative YAML → executable agents
  - 1,095+ test suite coverage

### UnifAI — Visual Multi-Agent Workflow Builder
- **URL:** https://github.com/vdymna/UnifAI
- **Stars:** Not specified
- **License:** Not specified
- **Usage:** **📖 REFERENCE**
- **What We Learn:**
  - Drag-and-drop blueprint builder for agent graphs
  - Dual execution mode (LangGraph local, Temporal distributed)
  - RAG pipeline for enterprise knowledge
  - A2A + MCP protocol support

### tttt — Rust PTY Orchestrator
- **URL:** https://github.com/ayourtch-llm/tttt
- **Stars:** Not specified
- **License:** Not specified
- **Stack:** Rust + MCP
- **Usage:** **📖 REFERENCE**
- **What We Learn:**
  - PTY session management exposed as MCP tools
  - SIGUSR-based live reload preserving PTY sessions
  - Worker agent coordination pattern
  - SQLite logging + replay engine

### Agent Shared Fabric — Governance Layer
- **URL:** https://github.com/Fly-Carrot/agent-shared-fabric
- **Stars:** Not specified
- **License:** Not specified
- **Usage:** **📖 REFERENCE**
- **What We Learn:**
  - Preflight → Six-stage discipline → Postflight workflow
  - Memory lanes + receipts for audit trail
  - MCP/skills/workflow registries
  - Runtime-agnostic operating contract

---

## Tool Selection Decision Matrix

| Requirement | Our Choice | Alternative | Why This Won |
|---|---|---|---|
| Desktop Shell | Jan (fork) | Electron | -80% RAM, Rust safety, existing model mgmt |
| Multi-Agent Orchestration | CrewAI | LangGraph | 5.76x faster, standalone, Flows API |
| Agent Execution | OpenHands SDK | Claude Code API | Open source, sandboxed, multi-provider |
| Terminal Multiplexer | Custom (xterm.js + node-pty) | Embed Herdr | Desktop GUI + terminal in same app |
| Shared Memory | Custom (SQLite + patterns) | Embed Zengram | Lighter weight, no external service |
| Local LLM | Jan's built-in Ollama | Standalone Ollama | Integrated UX, model download UI |
| State Management | Zustand | Redux | 1KB, no boilerplate, TS-native |

---

## Tools We Explicitly Chose NOT to Use

| Tool | Reason for Skipping |
|---|---|
| LangGraph | Overkill for our orchestration needs; CrewAI is faster and simpler |
| Electron | 10x RAM compared to Tauri; contradicts laptop-friendly goal |
| Mem0 / Zep / Letta | Cloud-first or heavy dependencies; SQLite + patterns are lighter |
| AutoGen | Research-grade, not production-stable; CrewAI is more mature |
