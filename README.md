# ✦ Mothership

```
 ██████╗██╗  ██╗███████╗██████╗ ██╗   ██╗███████╗██████╗ 
██╔════╝██║  ██║██╔════╝██╔══██╗██║   ██║██╔════╝██╔══██╗
██║     ███████║█████╗  ██████╔╝██║   ██║█████╗  ██║  ██║
██║     ██╔══██║██╔══╝  ██╔══██╗██║   ██║██╔══╝  ██║  ██║
╚██████╗██║  ██║███████╗██║  ██║╚██████╔╝███████╗██████╔╝
 ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═════╝ 
```

**Desktop AI Control Center.** Unify browser-based and local AI agents into one
memory-aware workspace. Isolated terminal sessions per agent, shared context
across tools, session handoff with automatic summarization, and lightweight
resource management for low-RAM laptops.

---

## Features

- **Multi-Agent Dashboard** -- 10 AI agents in a unified sidebar: Claude, Codex,
  Gemini, OpenCode, Researcher, Writer, Debugger, Reviewer, DevOps, and Designer.
- **Resizable Three-Panel Layout** -- Drag dividers to resize Agent Sidebar,
  Workspace, and Memory Panel.
- **Light/Dark Theme** -- Full theme toggle with CSS variables, system preference
  detection.
- **Command Palette** -- `⌘K` fuzzy search across agents, notes, files, and context.
- **Agent Management** -- Drag reorder, add custom agents, status indicators.
- **Memory Panel** -- Notes, context history, timeline, search, and cross-agent search.
- **Model Router** -- Local LLM inference via Ollama with model discovery and chat.
- **War Room** -- Multi-agent broadcast, side-by-side responses, task chaining.
- **Task Graph** -- D3.js-powered dependency visualization with drag-and-drop.
- **Browser Connector** -- Integrated browser panel with URL bar and navigation.
- **MCP Integration** -- Model Context Protocol server support with per-tool
  kill-switches that fail closed and persist across restarts.
- **Onboarding Wizard** -- 3-step first-run experience.
- **Sidecar Infrastructure** -- Python sidecar management for CrewAI and OpenHands.
- **Low-RAM Design** -- Tauri 2.x at ~10MB against Electron's ~100MB, with
  session pause/resume.

---

## Tech stack

| Layer | Technology |
|---|---|
| Desktop Shell | [Tauri 2.x](https://tauri.app/) (Rust) |
| Frontend | React 18 + TypeScript + Vite |
| State | [Zustand](https://github.com/pmndrs/zustand) |
| Styling | Tailwind CSS + CSS Variables |
| Layout | [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels) |
| Icons | [Lucide React](https://lucide.dev/) |
| Terminal | portable-pty, Rust |
| Graph | [D3.js](https://d3js.org/) |
| Database | SQLite via rusqlite with FTS5 and WAL mode |
| Sidecars | Python (JSON-RPC over STDIO) |
| Testing | Vitest + Playwright + Pytest |

---

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/), stable toolchain
- [Tauri CLI](https://tauri.app/) v2
- [Python](https://python.org/) 3.8+, needed for sidecars
- [Ollama](https://ollama.com/), optional, serves local LLM inference

### Install

```bash
# Install frontend dependencies
npm install

# Install Tauri CLI (if not already installed)
cargo install tauri-cli
```

### Development

```bash
# Start dev server (frontend + Tauri)
npm run tauri dev

# Or start frontend only (for UI development)
npm run dev
```

### Build

```bash
# Build frontend
npm run build

# Build desktop app
npm run tauri build
```

### Testing

```bash
# Run unit tests (Vitest)
npm test

# Run unit tests with coverage
npm run test:coverage

# Run E2E tests (Playwright)
npx playwright test

# Run Python sidecar tests
cd sidecars && python -m pytest tests/
```

---

## Project structure

```
Mothership/
├── src/                              # React frontend
│   ├── components/
│   │   ├── agents/                   # AgentSidebar, AddAgentDialog
│   │   ├── browser/                  # BrowserConnector panel
│   │   ├── command-palette/          # ⌘K quick switcher
│   │   ├── layout/                   # TopBar, FileSidebar, AgentBar, ActivityBar
│   │   ├── mcp/                      # MCPPanel (server management)
│   │   ├── memory/                   # MemoryPanel (notes, context, search)
│   │   ├── model-router/             # ModelRouterPanel (Ollama integration)
│   │   ├── onboarding/               # OnboardingWizard (first-run)
│   │   ├── task-graph/               # TaskGraph (D3.js visualization)
│   │   ├── terminal/                 # TerminalPane (xterm.js)
│   │   ├── war-room/                 # WarRoom (broadcast, chaining)
│   │   └── workspace/                # WorkspaceView (terminal tabs)
│   ├── hooks/                        # Custom React hooks
│   │   ├── useTerminal.ts            # xterm.js ↔ PTY connection
│   │   └── useContextCapture.ts      # Event-driven context capture
│   ├── lib/                          # Utilities
│   │   ├── fuzzySearch.ts            # Fuzzy search scoring
│   │   ├── performance.ts            # Performance utilities
│   │   ├── mcp/                      # MCP client library
│   │   └── summaryEngine.ts          # LLM summarization client
│   ├── stores/                       # Zustand stores (21 total)
│   │   ├── agentStore.ts             # Agent registry + status
│   │   ├── memoryStore.ts            # Notes + context + FTS5 search
│   │   ├── modelRouterStore.ts       # Local model management
│   │   ├── warRoomStore.ts           # War Room sessions
│   │   ├── taskGraphStore.ts         # Task dependency graphs
│   │   ├── mcpStore.ts               # MCP server + kill-switches
│   │   ├── onboardingStore.ts        # Onboarding state
│   │   ├── workspaceStore.ts         # Terminal tabs
│   │   ├── fileStore.ts              # File search
│   │   ├── themeStore.ts             # Light/dark theme
│   │   ├── coordinatorStore.ts       # Cross-store coordination
│   │   ├── acpStore.ts               # ACP event listeners
│   │   ├── archiveStore.ts           # Session archiving
│   │   ├── editorStore.ts            # Code editor state
│   │   ├── executionEngineStore.ts   # Parallel agent execution
│   │   ├── loopStore.ts              # Agentic loop engine
│   │   ├── performanceStore.ts       # Memory pressure metrics
│   │   ├── qualityGateStore.ts       # Quality gate validation
│   │   ├── statusHeuristicsStore.ts  # Agent status heuristics
│   │   ├── updateStore.ts            # Update state management
│   │   └── worktreeStore.ts          # Git worktree management
│   └── test/                         # Unit tests (Vitest)
│       ├── components/               # Component tests
│       ├── hooks/                    # Hook tests
│       ├── lib/                      # Utility tests
│       └── stores/                   # Store tests
│
├── src-tauri/                        # Rust backend
│   ├── src/
│   │   ├── main.rs                   # Tauri entry point
│   │   ├── commands/                 # Tauri IPC handlers (14 modules)
│   │   ├── acp/                      # JSON-RPC ACP protocol
│   │   ├── archive/                  # Session archiving
│   │   ├── execution_engine/         # Parallel agent execution
│   │   ├── loop_controller/          # Autonomous loop engine
│   │   ├── memory/                   # SQLite memory layer
│   │   ├── process/                  # SidecarManager
│   │   ├── quality_gate/             # Quality gate validation
│   │   ├── status_heuristics/        # Agent status heuristics
│   │   ├── terminal/                 # portable-pty sessions
│   │   └── lib.rs                    # Module declarations
│   ├── Cargo.toml
│   └── tauri.conf.json               # Bundler + auto-update config
│
├── sidecars/                         # Python sidecar processes
│   ├── hello-bridge/main.py          # Test sidecar (JSON-RPC)
│   ├── summary-engine/main.py        # LLM summarization
│   ├── crewai-bridge/                # CrewAI orchestration
│   ├── openhands-bridge/             # OpenHands agent execution
│   └── tests/                        # Pytest tests
│
├── tests/e2e/                        # Playwright E2E tests
├── docs/                             # User + developer guides, BossConsole harness guide
└── THANKS.md                         # Open-source attribution
```

---

## Current status

**Version:** 0.1.0

Mothership works with [BossConsole](https://github.com/risa-labs-inc/BossConsole) as
its operator console. BOSS supplies governed terminals, an agent-driven browser, and
an MCP tool layer. See [docs/BOSS_CONSOLE.md](docs/BOSS_CONSOLE.md) for the setup,
and [docs/USER_GUIDE.md](docs/USER_GUIDE.md) / [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md)
for usage and development.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Open command palette |
| `⌘T` / `Ctrl+T` | New terminal tab |
| `⌘W` / `Ctrl+W` | Close current tab |
| `⌘\` / `Ctrl+\` | Split pane |
| `⌘1-9` / `Ctrl+1-9` | Switch to tab by index |
| `Esc` | Close command palette |

---

## Testing

- Vitest runs 1346 unit tests across 53 test files.
- Pytest runs 5 sidecar tests.
- Playwright is configured, with end-to-end tests in `tests/e2e/`.
- Coverage target is 80%+ for branches, functions, and lines.

---

## Architecture

See [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) for system architecture,
data flow, and communication protocols. To develop Mothership inside BossConsole,
see [docs/BOSS_CONSOLE.md](docs/BOSS_CONSOLE.md).

---

## License

[Apache-2.0](LICENSE). BossConsole-inspired MCP governance is credited in
[THANKS.md](THANKS.md).

---

*Built with Tauri, React, Rust, and D3.js.*
