# Mothership User Guide

## Getting Started

### First Launch

When you first open Mothership, you'll see the **Onboarding Wizard** with 3 steps:

1. **Welcome** — Introduction to Mothership's features
2. **Meet Your Agents** — Overview of the 10 built-in agents
3. **Start Your First Project** — Quick start guide

You can skip onboarding at any time by clicking **Skip**.

### Main Layout

Mothership uses a three-panel layout:

| Panel | Location | Purpose |
|---|---|---|
| **Agent Sidebar** | Left | List of agents, status, add new agents |
| **Workspace** | Center | Terminal tabs for active agent work |
| **Memory Panel** | Right | Notes, context, search, tools |

Drag the dividers between panels to resize them.

---

## Agent Management

### Viewing Agents

The left sidebar shows all registered agents with:
- **Status dot** — Running (green), Idle (yellow), Error (red), Offline (gray)
- **Category** — Coding, Research, Ops, Creative
- **Description** — What the agent does

### Adding Agents

1. Click the **+** button in the sidebar header
2. Fill in the agent details (name, provider, description)
3. Click **Add Agent**

### Switching Agents

Click any agent in the sidebar to make it active. The workspace will switch to that agent's terminal session.

---

## Terminal Sessions

### Creating Terminals

- **New tab:** Click the **+** button in the workspace header
- **Keyboard shortcut:** `⌘T` (Ctrl+T on Windows/Linux)

### Split Panes

- **Keyboard shortcut:** `⌘\` (Ctrl+\)
- Drag tabs to rearrange
- Click the **×** to close a tab

### Terminal Features

- Full xterm.js rendering with proper colors
- Copy/paste integration
- Search with `Ctrl+F`
- Session persistence (switching tabs preserves state)

---

## Memory Panel

### Tabs

| Tab | Purpose |
|---|---|
| **Notes** | Create and manage notes with tags |
| **Context** | View context history across agents |
| **Timeline** | Chronological view of all activity |
| **Search** | Full-text search across all memory |
| **Models** | Local model router (Ollama) |
| **War Room** | Multi-agent broadcast and task chaining |
| **Graph** | Task dependency visualization |
| **Browser** | Integrated browser panel |
| **MCP** | MCP server management |

### Creating Notes

1. Go to the **Notes** tab
2. Click **+ New Note**
3. Write your note content
4. Add tags for organization
5. Click **Save**

### Searching

1. Go to the **Search** tab
2. Type your query
3. Results appear instantly (FTS5-powered)

---

## Model Router

The Model Router connects to Ollama for local LLM inference.

### Setup

1. Install [Ollama](https://ollama.com/)
2. Pull a model: `ollama pull llama3`
3. Open Mothership → Models tab
4. Click **Connect**

### Using Local Models

1. Select a model from the dropdown
2. Type your prompt
3. Press Enter to send
4. Response streams in real-time

---

## War Room

The War Room enables multi-agent collaboration.

### Broadcast Mode

Send the same prompt to multiple agents simultaneously:

1. Go to **War Room** → **Broadcast** tab
2. Select agents by clicking their names
3. Type your prompt
4. Click **Send**
5. View all responses side-by-side

### Task Chaining

Chain tasks where one agent's output becomes another's input:

1. Go to **War Room** → **Chain** tab
2. Click **+ New Chain**
3. Add steps (select agent + prompt for each)
4. Click **Create**
5. Click **Run Chain** to execute

---

## Task Graph

Visualize task dependencies with D3.js:

1. Go to **Graph** tab
2. Click **+ Node** to add tasks
3. Click **Edge** then click two nodes to connect them
4. Drag nodes to rearrange
5. Use scroll to zoom, drag background to pan

---

## Command Palette

Press `⌘K` (Ctrl+K) to open the command palette:

- **Fuzzy search** across agents, notes, files
- **Navigate** with arrow keys
- **Select** with Enter
- **Close** with Esc

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Command palette |
| `⌘T` / `Ctrl+T` | New terminal |
| `⌘W` / `Ctrl+W` | Close tab |
| `⌘\` / `Ctrl+\` | Split pane |
| `⌘1-9` / `Ctrl+1-9` | Switch to tab N |
| `Ctrl+F` | Search terminal |
| `Esc` | Close dialog |

---

## Settings

### Theme

Click the sun/monitor/moon icon in the header to toggle:
- **Light** — Bright theme
- **Dark** — Dark theme
- **System** — Follow OS preference

### Panel Sizes

Drag panel dividers to resize. Sizes persist across sessions.

---

## Troubleshooting

### Agent Not Responding

1. Check the agent's status dot in the sidebar
2. If red (error), click the agent to view logs
3. Try restarting the terminal session

### Terminal Not Rendering

1. Close the tab and create a new one
2. Check if the PTY process is running

### Search Not Working

1. Ensure the memory database is loaded (check bottom status)
2. Try re-indexing by toggling the search tab

---

## Getting Help

- Press `⌘K` and type "help"
- Check the [README](../README.md)
- View the [Architecture Guide](../PLANS/ARCHITECTURE.md)
