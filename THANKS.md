# Thanks

Mothership's architecture draws inspiration from the following open-source projects. Each has influenced specific design decisions, patterns, or implementation approaches.

---

## Operator harness and governance

| Project | What We Learned |
|---|---|
| **[BossConsole](https://github.com/risa-labs-inc/BossConsole)** | Per-tool MCP kill-switches that fail closed and persist, mirrored in our MCP panel. Documents the loopback `boss` server harness in `docs/BOSS_CONSOLE.md`. User-scoped secrets with browser autofill set the model for our roadmap. License: Apache-2.0 |

---

## Desktop Shell & Foundation

| Project | What We Learned |
|---|---|
| **[Jan](https://github.com/janhq/jan)** | Tauri desktop shell, theme system, model management, updater — the foundation we fork |
| **[Synapse](https://github.com/droxer/HiAgent)** | Agent webview integration inside Tauri |
| **[OpenFlux](https://github.com/EDEAI/OpenFlux)** | Multi-provider routing with openflux.yaml, Playwright automation |

## Multi-Agent Orchestration

| Project | What We Learned |
|---|---|
| **[CrewAI](https://github.com/crewAIInc/crewAI)** | Flow API (`@start`, `@listen`, `@router`) for handoff orchestration; role-based agent collaboration |
| **[Orkas](https://github.com/Orkas-AI/Orkas)** | Commander + sub-agent team topology |
| **[Nexus](https://github.com/sontianye/nexus)** | Graph/Router/Adaptive orchestration modes |
| **[Overseer](https://github.com/nikitatat/Overseer)** | Quality gates + task graph visualization |
| **[Shogun](https://github.com/AlphaHorizon-AI/Shogun)** | Samurai sub-agents, visual workflow builder, shared workspaces |

## Agent Execution & Terminal

| Project | What We Learned |
|---|---|
| **[OpenHands](https://github.com/OpenHands/OpenHands)** | Agent execution SDK with sandboxing and multi-provider support |
| **[OpenAgentd](https://github.com/lthoangg/openagentd)** | Custom agent daemon agent loop with MCP server layer |
| **[Herdr](https://github.com/ogulcancelik/herdr)** | Multi-terminal agent manager, persistent session concept |
| **[Agent of Empires](https://github.com/njbrake/agent-of-empires)** | PTY session management patterns |
| **[Xterm.js](https://xtermjs.org)** | Terminal emulation in the browser |
| **[node-pty](https://github.com/microsoft/node-pty)** | PTY spawning for cross-platform terminal support |

## Shared Memory & Context

| Project | What We Learned |
|---|---|
| **[ContextGraph](https://github.com/AllenMaxi/ContextGraph)** | MCP-native governed shared memory bus |
| **[Zengram](https://github.com/ZenSystemAI/Zengram)** | Dual storage (vector + relational) for context; cross-agent briefings |
| **[Lore](https://github.com/agentkitai/lore)** | MCP tool integration for memory operations |
| **[nmem](https://github.com/dayyanj/nmem)** | Social learning across agents via shared memory |

## State Management & UI

| Project | What We Learned |
|---|---|
| **[Zustand](https://github.com/pmndrs/zustand)** | Lightweight state management (1KB), isolated re-renders |
| **[AgentHub](https://github.com/Albaloola/AgentHub)** | Zustand patterns for agent state management |
| **[D3.js](https://d3js.org)** | Force-directed graph visualization for task dependency graphs |

## Additional References

| Project | What We Learned |
|---|---|
| **[Agentic Titan](https://github.com/dkrikler/Agentic_Titan)** | 9 topology patterns for multi-agent coordination |
| **[UnifAI](https://github.com/PunGrumpy/UnifAI)** | Drag-and-drop blueprint builder for agent graphs |
| **[Drodo](https://github.com/DS4A/Drodo)** | Mission control with n8n + browser integration |
| **[Autonomous Agent Harness](https://github.com/nicholasgriffintn/autonomous-agent-harness)** | Scheduled tasks + persistent memory loop |
| **[SwarmKit](https://github.com/HN333/SwarmKit)** | 7,000+ MCP server integration |
| **[Roo-Code](https://github.com/RooVetGit/Roo-Code)** | Multi-model provider support pattern |
| **[AG2](https://github.com/ag2ai/ag2)** | Multi-agent conversation framework patterns |
| **[CrewAI Flows Documentation](https://docs.crewai.com/core-concepts/Flow/)** | Event-driven agent orchestration patterns |
| **[Dify](https://github.com/langgenius/dify)** | Multi-platform agent deployment patterns |
| **[Mem0](https://github.com/mem0ai/mem0)** | Memory layer design patterns |
| **[Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)** | Browser agent instrumentation |
| **[ConPTY](https://devblogs.microsoft.com/commandline/windows-command-line-introducing-the-windows-pseudo-console-conpty/)** | Windows PTY support |
| **[winsmux](https://github.com/time-killer-games/winsmux)** | Windows terminal multiplexing patterns |
| **[Jan Inference Engine](https://github.com/janhq/jan/tree/main/core/)** | Local model inference infrastructure |

---

*Mothership is not affiliated with any of the above projects. All trademarks and copyrights belong to their respective owners.*
