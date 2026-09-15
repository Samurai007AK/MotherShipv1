# Mothership

**Desktop AI Control Center** — Unify browser-based and local AI agents into one memory-aware workspace.

Mothership provides isolated terminal sessions per agent, shared context across tools, session handoff with automatic summarization, and lightweight resource management for low-RAM laptops.

---

## Features

- **Multi-Agent Dashboard** — 10 AI agents (Claude, Codex, Gemini, OpenCode, Researcher, Writer, Debugger, Reviewer, DevOps, Designer) in a unified sidebar
- **Resizable Three-Panel Layout** — Drag dividers to resize Agent Sidebar, Workspace, and Memory Panel
- **Light/Dark Theme** — Full theme toggle with CSS variables, system preference detection
- **Command Palette** — `⌘K` fuzzy search across agents, notes, files, and context
- **Agent Management** — Drag reorder, add custom agents, status indicators
- **Memory Panel** — Notes, context history, timeline, search, and cross-agent search
- **Model Router** — Local LLM inference via Ollama with model discovery and chat
- **War Room** — Multi-agent broadcast, side-by-side responses, task chaining
- **Task Graph** — D3.js-powered dependency visualization with drag-and-drop
- **Browser Connector** — Integrated browser panel with URL bar and navigation
- **MCP Integration** — Model Context Protocol server support with per-tool kill-switches (fail-closed, persisted)
- **Onboarding Wizard** — 3-step first-run experience
- **Sidecar Infrastructure** — Python sidecar management for CrewAI and OpenHands integration
- **Low-RAM Design** — Tauri 2.x (~10MB vs Electron's ~100MB), session pause/resume

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop Shell | [Tauri 2.x](https://tauri.app/) (Rust) |
| Frontend | React 18 + TypeScript + Vite |
| State | [Zustand](https://github.com/pmndrs/zustand) |
| Styling | Tailwind CSS + CSS Variables |
| Layout | [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels) |
| Icons | [Lucide React](https://lucide.dev/) |
| Terminal | portable-pty (Rust) |
| Graph | [D3.js](https://d3js.org/) |
| Database | SQLite via rusqlite (FTS5, WAL mode) |
| Sidecars | Python (JSON-RPC over STDIO) |
| Testing | Vitest + Playwright + Pytest |

---

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (stable toolchain)
- [Tauri CLI](https://tauri.app/) v2
- [Python](https://python.org/) 3.8+ (for sidecars)
- [Ollama](https://ollama.com/) (optional, for local LLM inference)

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

## Project Structure

```
Mothership/
├── src/                              # React frontend
│   ├── components/
│   │   ├── agents/                   # AgentSidebar, AddAgentDialog
│   │   ├── browser/                  # BrowserConnector panel
│   │   ├── command-palette/          # ⌘K quick switcher
│   │   ├── layout/                   # ResizableLayout, ThemeToggle
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
│   ├── stores/                       # Zustand stores (11 total)
│   │   ├── agentStore.ts             # Agent registry + status
│   │   ├── memoryStore.ts            # Notes + context + FTS5 search
│   │   ├── modelRouterStore.ts       # Local model management
│   │   ├── warRoomStore.ts           # War Room sessions
│   │   ├── taskGraphStore.ts         # Task dependency graphs
│   │   ├── mcpStore.ts               # MCP server management
│   │   ├── onboardingStore.ts        # Onboarding state
│   │   ├── workspaceStore.ts         # Terminal tabs
│   │   ├── fileStore.ts              # File search
│   │   ├── themeStore.ts             # Light/dark theme
│   │   └── coordinatorStore.ts       # Cross-store coordination
│   └── test/                         # Unit tests (Vitest)
│       └── stores/                   # Store tests
│
├── src-tauri/                        # Rust backend
│   ├── src/
│   │   ├── main.rs                   # Tauri entry point
│   │   ├── commands/                 # Tauri IPC handlers
│   │   │   ├── file_commands.rs      # File operations
│   │   │   ├── sidecar_commands.rs   # Sidecar lifecycle
│   │   │   ├── summary_commands.rs   # LLM summarization
│   │   │   ├── model_commands.rs     # Ollama model discovery
│   │   │   ├── loop_commands.rs      # Loop controller
│   │   │   ├── archive_commands.rs   # Session archiving
│   │   │   └── quality_gate_commands.rs
│   │   ├── memory/                   # SQLite memory layer
│   │   │   ├── store.rs              # FTS5 + WAL mode
│   │   │   └── commands.rs           # Memory IPC commands
│   │   ├── process.rs                # SidecarManager
│   │   └── terminal/                 # portable-pty sessions
│   ├── Cargo.toml
│   └── tauri.conf.json               # Bundler + auto-update config
│
├── sidecars/                         # Python sidecar processes
│   ├── hello-bridge/main.py          # Test sidecar (JSON-RPC)
│   ├── summary-engine/main.py        # LLM summarization
│   └── tests/                        # Pytest tests
│
├── tests/e2e/                        # Playwright E2E tests
├── docs/                             # User + developer guides, BossConsole harness guide
└── THANKS.md                         # Open-source attribution
```

---

## Current Status

**Version:** 0.1.0

Mothership pairs well with [BossConsole](https://github.com/risa-labs-inc/BossConsole)
as its operator harness (governed terminals, agent-driven browser, MCP tool layer).
See [docs/BOSS_CONSOLE.md](docs/BOSS_CONSOLE.md) for the setup, and
[docs/USER_GUIDE.md](docs/USER_GUIDE.md) / [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md)
for usage and development.

---

## Keyboard Shortcuts

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

- **Unit Tests:** 33 tests across 5 test files (Vitest)
- **Python Tests:** 5 sidecar tests (Pytest)
- **E2E Tests:** Playwright configured (tests in `tests/e2e/`)
- **Coverage Target:** 80%+ branches, functions, lines

---

## Architecture

See [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) for system architecture, data flow,
and communication protocols. To develop Mothership inside BossConsole, see
[docs/BOSS_CONSOLE.md](docs/BOSS_CONSOLE.md).

---

## License

[Apache-2.0](LICENSE). BossConsole-inspired MCP governance is credited in [THANKS.md](THANKS.md).

---

*Built with Tauri, React, Rust, and D3.js.*
