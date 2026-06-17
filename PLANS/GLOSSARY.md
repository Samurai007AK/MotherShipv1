# Mothership — Glossary

---

| Term | Definition |
|---|---|
| **Agent** | A software component (local or web-based) that can perform tasks. Examples: Claude Code, ChatGPT, Codex, a custom terminal agent. |
| **Agent Registry** | A panel listing all registered agents with status indicators (idle/busy/offline). |
| **Bottleneck** | In the context of a 16GB RAM i5 laptop, a resource constraint that makes the machine unusable (freezing, swapping). The core problem Mothership solves. |
| **Browser Agent** | An AI tool accessible via web browser (e.g., ChatGPT, Gemini, Claude.ai). Mothership integrates them as WebView panels. |
| **Cold Storage** | When a terminal session is inactive for a configurable threshold (Phase 2 default: 5 min), its full output is compressed and archived to SQLite; only metadata remains in memory. |
| **ConPTY** | Windows Pseudo Console — the modern Windows API for PTY support. First appeared in Windows 10 1809. Mothership's primary PTY pathway on Windows. |
| **ContextGraph** | An open-source MCP-native governed shared memory bus. Mothership adapts its governance patterns for the memory layer. |
| **CrewAI** | Multi-agent orchestration framework with a Flow API (`@start`, `@listen`, `@router`). Used as the handoff orchestration engine. |
| **Fork (of Jan)** | Mothership starts as a fork of Jan's desktop app. We strip the chat interface, keep Tauri/theming/model management, and add our panels and sidecars. |
| **Gate** | A quality checkpoint at the end of each phase. The phase is not complete until the gate criteria are met. |
| **Handoff** | The act of switching from one agent to another. Mothership captures context from the current agent, packages it into a summary, and presents it to the next agent. |
| **Jan** | Open-source desktop app for running and managing local LLMs. Built with Tauri. Mothership's foundation. |
| **JSON-RPC** | Lightweight protocol used for communication between the Rust backend and Python sidecars. No HTTP overhead — communicates over STDIO. |
| **Memory Layer** | The shared context system that captures, stores, and retrieves session history. Built on SQLite with FTS5 for search. |
| **Mothership** | Codename for the Desktop AI Control Center project. |
| **MCP** | Model Context Protocol — an open standard for AI agents to interact with tools and data sources. |
| **Multi-Agent Collaboration** | Running the same prompt against multiple agents simultaneously (war room) or chaining agent outputs (task chaining). |
| **Named Pipes** | Inter-process communication mechanism used on Windows for Tauri ↔ Python sidecar communication. |
| **Ollama** | Local LLM runner that downloads and manages models. Bundled with Jan. |
| **OpenHands SDK** | Agent execution runtime with sandboxing and multi-provider support (Claude, GPT, Gemini). Used as the execution backend. |
| **Phase** | A major implementation stage with defined deliverables and a gate. There are 4 phases (0-3). |
| **PTY / Pseudo-Terminal** | A virtual terminal that allows programs to run as if in a real terminal. Used for CLI-based agents. |
| **Sidecar** | A separate process managed by the main Tauri app. Mothership uses Python sidecars for CrewAI and OpenHands. |
| **Shared Memory** | The SQLite database storing all handoff summaries, terminal outputs, and context. The "brain" of Mothership. |
| **Sub-Phase** | A smaller implementation step within a phase. Each sub-phase typically takes 4-8 hours. |
| **Task Dependency Graph** | A D3.js visualization showing the history of handoffs and task flows as a directed acyclic graph. |
| **Tauri** | A framework for building desktop apps with web frontends and Rust backends. Smaller and lighter than Electron. |
| **Terminal Multiplexer (Terminal Mux)** | Manages multiple PTY sessions, one per agent. Supports pause/resume to save RAM. |
| **War Room** | Multi-agent collaboration view — send the same prompt to multiple agents and compare results side-by-side. |
| **WebView** | OS-native web rendering component. Tauri uses WebView2 (Windows) or WKWebView (macOS) instead of bundling Chromium. |
| **WinPTY** | Older Windows PTY API. Fallback if ConPTY fails. Less feature-rich but more compatible. |
| **xterm.js** | Terminal emulator library that renders in the browser. Used for Mothership's terminal panels. |
| **Zustand** | Lightweight (1KB) state management library for React. Used for all frontend state. |
