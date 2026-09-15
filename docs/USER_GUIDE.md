# Mothership User Guide

**Version:** 0.1.0
**Last Updated:** 2026-06-22

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Main Layout](#main-layout)
3. [Agent Management](#agent-management)
4. [Terminal Sessions](#terminal-sessions)
5. [Memory Panel](#memory-panel)
6. [Memory Panel Tabs](#memory-panel-tabs)
7. [Browser Panel](#browser-panel)
8. [Model Router](#model-router)
9. [War Room](#war-room)
10. [Task Graph](#task-graph)
11. [Loop Controller](#loop-controller)
12. [MCP Integration](#mcp-integration)
13. [Performance Panel](#performance-panel)
14. [Execution Engine](#execution-engine)
15. [Worktree Manager & File Attachments](#worktree-manager--file-attachments)
16. [Command Palette](#command-palette)
17. [Auto-Update](#auto-update)
18. [Settings](#settings)
19. [Keyboard Shortcuts](#keyboard-shortcuts)
20. [Troubleshooting](#troubleshooting)

---

## Getting Started

### First Launch

When you first open Mothership, you'll see the **Onboarding Wizard** with 3 steps:

1. **Welcome** — Introduction to Mothership's features
2. **Meet Your Agents** — Overview of the 10 built-in agents
3. **Start Your First Project** — Quick start guide

You can skip onboarding at any time by clicking **Skip**. Onboarding completion is persisted — you won't see it again after completing or skipping.

### System Requirements

- **OS:** Windows 10+ (primary), macOS, Linux
- **RAM:** 200 MB idle target, 300 MB with 1 active terminal
- **Storage:** ~500 MB for the app, plus SQLite database growth
- **Optional:** [Ollama](https://ollama.com/) for local LLM inference
- **Optional:** Python 3.8+ for sidecar processes (CrewAI, OpenHands)

---

## Main Layout

Mothership uses a three-panel layout:

| Panel | Location | Purpose |
|---|---|---|
| **Agent Sidebar** | Left | List of agents, status, add new agents |
| **Workspace** | Center | Terminal tabs for active agent work |
| **Memory Panel** | Right | Notes, context, search, tools, perf |

Drag the dividers between panels to resize them. Double-click a divider to reset to default sizes. Panel sizes persist across sessions.

---

## Agent Management

### Viewing Agents

The left sidebar shows all registered agents with:
- **Status dot** — Running (green), Idle (yellow), Error (red), Offline (gray)
- **Category** — Coding, Research, Ops, Creative
- **Description** — What the agent does
- **Expandable details** — Click the agent to see more info

### Built-in Agents

| Agent | Provider | Category |
|---|---|---|
| Claude | claude | Coding |
| Codex | codex | Coding |
| Gemini | gemini | Coding |
| OpenCode | opencode | Coding |
| ChatGPT | file | Coding |
| DeepSeek | file | Coding |
| Mistral | file | Coding |
| Kimi | file | Creative |
| Qwen | file | Creative |
| Ollama | file | Ops |

### Adding Agents

1. Click the **+** button in the sidebar header
2. Fill in the agent details (name, provider, description)
3. Select a category (coding, research, ops, creative)
4. Click **Add Agent**

### Switching Agents

Click any agent in the sidebar to make it active. The workspace will switch to that agent's terminal session. Agent status automatically transitions between running/idle/error based on terminal activity.

### Drag to Reorder

Drag agents up and down in the sidebar to reorder them. The order persists across sessions.

---

## Terminal Sessions

### Creating Terminals

- **New tab:** Click the **+** button in the workspace header
- **Keyboard shortcut:** `⌘T` (Ctrl+T on Windows/Linux)

### Split Panes

- **Keyboard shortcut:** `⌘\` (Ctrl+\)
- Drag tabs to rearrange
- Click the **×** to close a tab
- Resize panes by dragging the divider between them

### Terminal Features

- **Full xterm.js rendering** with proper colors, Unicode, and ligature support
- **Copy/paste** — `⌘C`/`⌘V` with clipboard integration; `⌘⇧C`/`⌘⇧V` for terminal-specific copy/paste
- **Search** — `Ctrl+F` opens the find bar within the terminal
- **Session persistence** — Switching tabs preserves the full terminal buffer
- **Disk-backed persistence** — Terminal buffers are saved to disk and restored across app restarts
- **Auto-pause** — Hidden terminal sessions pause after 30 seconds to save RAM
- **Auto-resume** — Switching back to a paused tab automatically resumes the session and restores the buffer
- **Reconnection** — Automatic reconnection on PTY crash with error overlay

### AI-Chat Terminals (Terminal Chat Mode)

When connected to a local Ollama model, terminals can run in AI chat mode:
- Type messages at the `>>>` prompt
- Press Enter to send — the model responds inline
- `Ctrl+C` to cancel a generation
- `Ctrl+L` to clear the conversation
- Conversation history is tracked and can be exported as Markdown or JSON

---

## Memory Panel

The Memory Panel (right side) is the central hub for all cross-agent context, notes, and tools. It has multiple tabs accessed via the tab bar at the top.

### Common Actions

- **Filter by agent** — Use the filter dropdown in the Context tab to show only entries from a specific agent
- **Global search** — The Search tab provides full-text search across all memory entries

### Creating Notes

1. Go to the **Notes** tab
2. Click **+ New Note**
3. Write your note content with Markdown support
4. Add tags for organization (comma-separated)
5. Click **Save** — auto-saves every 2 seconds while editing

### Searching All Memory

1. Go to the **Search** tab
2. Type your query — results appear instantly (FTS5-powered)
3. Results are grouped by type (notes, context, sessions)

---

## Memory Panel Tabs

### Notes
Create and manage notes with Markdown content, tags, and full-text search. Notes are auto-saved and sync across sessions.

### Context
Chronological view of all agent activity — prompts, outputs, file changes, and system events. Filter by agent, entry type, or date range. Handoff context packs appear here.

### Timeline
Chronological view of all memory activity with timestamp grouping:
- **Today** — Entries from the current day
- **Yesterday** — Entries from the previous day
- **This Week** — Entries from the last 7 days
- **Older** — Everything else

### Search
Full-text search (FTS5) across all memory entries — notes, context history, sessions, and handoff summaries. Results appear instantly as you type.

### Storage (Cold Storage)
Archive old sessions to reduce memory usage:
- **Archive** — Compresses old sessions into gzip archives
- **Prune** — Removes old snapshots while keeping the most recent
- **Restore** — Unarchives and restores previously archived sessions
- Shows success/failure toast notifications

### Models (Model Router)
Connect to Ollama for local LLM inference. See the [Model Router](#model-router) section for details.

### War Room
Multi-agent broadcast and task chaining. See the [War Room](#war-room) section for details.

### Graph
Task dependency visualization. See the [Task Graph](#task-graph) section for details.

### Browser
Integrated browser panel. See the [Browser Panel](#browser-panel) section for details.

### MCP
MCP server management. See the [MCP Integration](#mcp-integration) section for details.

### Execution
Parallel agent execution groups. See the [Execution Engine](#execution-engine) section for details.

### Perf (Performance)
Real-time performance monitoring. See the [Performance Panel](#performance-panel) section for details.

---

## Browser Panel

The Browser tab provides an integrated WebView browser for agents that need web access.

### Features

- **Tabbed browsing** — Multiple browser tabs side by side
- **URL bar** — Enter or paste URLs to navigate
- **Navigation controls** — Reload, close tab
- **Dev mode** — In development mode (non-Tauri), shows a placeholder; in the desktop app, opens a real Tauri WebView window per tab

### Using the Browser

1. Go to the **Browser** tab in the Memory Panel
2. Click **+** to add a new browser tab
3. Type a URL in the address bar and press Enter
4. The page loads in a separate WebView window

### Error Handling

If a WebView fails to open, an error banner appears with the error details. You can retry by refreshing the tab.

---

## Model Router

The Model Router connects to Ollama for local LLM inference.

### Setup

1. Install [Ollama](https://ollama.com/)
2. Pull a model: `ollama pull llama3.2:3b`
3. Open Mothership → **Models** tab
4. Click **Connect** to discover available models

### Using Local Models

1. Select a model from the dropdown
2. Type your prompt in the chat area
3. Press Enter to send
4. Response streams in real-time
5. View conversation history in the sidebar

### Features

- **Model discovery** — Automatically detects all models available in your Ollama instance
- **Streaming responses** — Token-by-token streaming for real-time feedback
- **Conversation history** — Full chat history with timestamps
- **Multiple models** — Switch between models mid-conversation

---

## War Room

The War Room enables multi-agent collaboration through broadcast messaging and task chaining.

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
3. Add steps (select agent + prompt for each step)
4. Click **Create**
5. Click **Run Chain** to execute
6. Each step shows its status (pending, running, completed, error)

### View Options

- **Broadcast** — Single prompt, multiple agents
- **Side by Side** — Compare responses from different agents
- **Chain** — Sequential task execution

---

## Task Graph

Visualize task dependencies and execution flow:

1. Go to **Graph** tab
2. Click **+ Node** to add tasks with labels and status
3. Click **Edge** then click two nodes to connect them (source → target)
4. Drag nodes to rearrange the layout
5. Use scroll to zoom, drag the background to pan
6. Click a node to select it and view details

### Layout Options

- **Dagre** — Hierarchical directed graph layout (default)
- **Force** — Force-directed layout
- **Tree** — Tree layout

### Status Colors

- **Pending** — Yellow
- **Running** — Blue
- **Completed** — Green
- **Error** — Red
- **Cancelled** — Gray

---

## MCP Integration

Mothership supports the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) for connecting to external tools and data sources.

### Managing Servers

1. Go to the **MCP** tab in the Memory Panel
2. **Add Server** — Configure a new MCP server with name, URL, and capabilities
3. **Connect/Disconnect** — Toggle server connections
4. **View Tools & Resources** — Explore available tools and resources from connected servers

### Features

- **WebSocket connection** — Real-time communication with MCP servers
- **Tool discovery** — Automatically lists available tools from connected servers
- **Resource discovery** — Browse available resources
- **Server status** — Live connection status indicators

---

## Performance Panel

The Performance tab provides real-time monitoring of system and process memory.

### Features

- **Memory bars** — Visual bars for Mothership process RAM, System RAM, Available memory, and Swap
- **Pressure indicator** — Color-coded status: green (ok), yellow (warn), red (critical)
- **Metric cards** — CPU usage, memory fraction, JS heap, auto-pause events
- **Pressure sparkline** — 5-minute history of memory pressure levels
- **Auto-refresh** — Polls every 5 seconds; click the refresh button for an immediate update

### Memory Pressure Levels

| Level | Threshold | Color |
|---|---|---|
| **OK** | < 150 MB | Green |
| **Warning** | 150–299 MB | Yellow |
| **Critical** | ≥ 300 MB | Red |

### Auto-Pause

The Performance Panel includes an **Auto-Pause** feature:

- **Enabled by default** — When Mothership's process memory exceeds 200 MB, all running terminal sessions are automatically paused
- **Toggle** — Turn auto-pause on/off with the toggle switch
- **Event history** — Shows the last 3 auto-pause events with timestamps and pause counts
- **Counter** — The Auto-Pauses metric card shows total events and latest pause count

This works edge-triggered: it only fires once when crossing above 200 MB, not every polling cycle. It resets when memory drops back below the threshold.

---

## Loop Controller

The Loop Controller enables autonomous, multi-iteration task execution.

### Starting a Loop

1. Open the Loop Controller from the workspace
2. Configure the task and iteration limits
3. Click **Start** to begin autonomous execution
4. The agent iterates through the task, refining outputs each cycle

### Loop States

- **Idle** — No active loop
- **Running** — Loop is actively executing
- **Paused** — Loop is suspended (can be resumed)
- **Completed** — Loop finished successfully
- **Failed** — Loop encountered an error
- **Cancelled** — Loop was manually cancelled

### Loop Controls

- **Pause/Resume** — Suspend and continue execution
- **Cancel** — Stop the loop entirely
- **Retry** — Restart a failed loop
- **Metrics** — View iteration count, duration, and completion rate

---

## Execution Engine

The Execution Engine enables parallel agent execution with shared context.

### Creating Execution Groups

1. Go to the **Execution** tab
2. Click **New Execution**
3. Select agents and configure their prompts
4. Click **Start** to run all agents in parallel

### Group Execution

- **Parallel execution** — All agents in a group run simultaneously
- **Shared context** — Agents can share context entries with each other
- **Status tracking** — Each agent shows its current status (pending, spawning, running, completed, error)
- **Results** — View each agent's output after completion

### Context Sharing

Add shared context entries that all agents in the group can access. This is useful for providing common background information, code snippets, or requirements.

---

## Worktree Manager & File Attachments

### File Attachments

Drag and drop files into the workspace to attach them:
- Files are recorded as memory entries in the context history
- The terminal automatically changes to the file's directory
- File metadata (path, size, type) is stored for reference

### Worktree Manager

The Worktree Manager integrates with Git worktrees for isolated workspace management.

### Features

- **Create worktree** — Create a new Git worktree from any branch
- **List workspaces** — View all active worktrees with their status
- **Diff viewer** — View file-level diffs between the worktree and the source branch
- **Sync & Commit** — Sync changes and commit them
- **Push** — Push worktree branches to remote
- **Delete** — Clean up worktree workspaces when done
- **Port allocation** — Allocate and manage ports for dev servers in workspaces

### Using Worktrees

1. Open the Worktree Manager from the Workspace view
2. Select a source branch
3. Create a new worktree workspace
4. Work in the isolated workspace without affecting your main branch
5. Sync changes, commit, and push when ready
6. Delete the worktree when done

### Presets

Save and reuse workspace configurations:
- **Setup commands** — Commands to run when creating a workspace
- **Teardown commands** — Commands to run when deleting a workspace
- **Preset library** — Browse and apply saved presets

### Cold Storage (Session Archiving)

The **Storage** tab in the Memory Panel provides session lifecycle management:
- **Archive** — Compresses old sessions into gzip JSON archives to reduce footprint
- **Prune** — Removes old snapshots while keeping the most recent
- **Restore** — Browse and unarchive previously archived sessions
- **Notifications** — Success/failure toast messages for each operation

---

## Command Palette

Press `⌘K` (Ctrl+K on Windows/Linux) to open the command palette:

- **Fuzzy search** across agents, notes, files, and context
- **Filter tabs** — Tab to filter by category (agents, notes, files)
- **Navigate** with arrow keys
- **Select** with Enter — Opens the selected item
- **Close** with Esc

The command palette also shows recent agents for quick switching.

---

## Auto-Update

Mothership automatically checks for updates when launched.

### Update Banner

When an update is available:
1. An **Update Available** banner appears at the top of the window
2. Click **Download** to start downloading the update
3. A progress bar shows download progress
4. Click **Install** when the download completes to install the update
5. The app restarts automatically after installation

### Manual Check

Click the update check button (in the header) to manually check for updates at any time.

### Release Channels

- **Stable** — Production releases (default)
- The release workflow builds for Windows (MSI/NSIS), macOS (DMG), and Linux (AppImage/deb)

---

## Settings

### Theme

Click the sun/monitor/moon icon in the header to toggle:
- **Light** — Bright theme with light backgrounds
- **Dark** — Dark theme with dark backgrounds (default)
- **System** — Follow OS preference automatically

The theme persists across sessions via localStorage.

### Panel Sizes

Drag panel dividers to resize. Sizes persist across sessions via localStorage.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Open command palette |
| `⌘T` / `Ctrl+T` | New terminal tab |
| `⌘W` / `Ctrl+W` | Close current tab |
| `⌘\` / `Ctrl+\` | Split pane |
| `⌘1-9` / `Ctrl+1-9` | Switch to tab by index |
| `Ctrl+F` | Search within terminal |
| `⌘⇧C` / `Ctrl+⇧C` | Copy from terminal |
| `⌘⇧V` / `Ctrl+⇧V` | Paste to terminal |
| `Esc` | Close dialog / command palette |
| `Enter` | Submit (in command palette, dialogs) |

---

## Troubleshooting

### Agent Not Responding

1. Check the agent's status dot in the sidebar
   - **Green** = Running — the terminal should be active
   - **Yellow** = Idle — the agent is connected but not actively working
   - **Red** = Error — click the agent to view error logs
2. If red (error), try reconnecting:
   - Close the current terminal tab and create a new one
   - The agent should spawn a fresh PTY session
3. Check if the terminal has a "Connection lost" overlay — if so, click to reconnect

### Terminal Not Rendering

1. Close the tab and create a new one
2. Check if the PTY process is running (check task manager for shell processes)
3. If the terminal shows "PAUSED", click back to the tab to resume it
4. If the issue persists, restart the application

### Memory Too High

1. Go to the **Perf** tab in the Memory Panel to check current memory usage
2. If auto-pause is enabled (default), terminals are automatically paused when memory exceeds 200 MB
3. Manually close unused terminal tabs
4. Disable auto-pause if you prefer to manage terminals manually (toggle in Performance Panel)
5. Use the **Storage** tab to archive old sessions and prune snapshots

### Search Not Working

1. Ensure the memory database is initialized (the search tab should load automatically)
2. Try navigating away and back to the Search tab
3. FTS5 indexes are built automatically — no manual re-indexing needed
4. If results seem incomplete, try a broader search query

### Browser WebView Not Opening

1. Browser WebView windows only open in the desktop (Tauri) app — dev mode shows a placeholder
2. If a WebView fails to open, an error banner shows the details
3. Try refreshing the browser tab
4. Check if your system supports WebView2 (Windows) or WKWebView (macOS)

### Model Router (Ollama) Not Connecting

1. Ensure Ollama is installed and running (`ollama serve`)
2. Check that you have pulled at least one model (`ollama list`)
3. In the Models tab, click **Connect** to discover models
4. If connection fails, check the Ollama logs for errors
5. Try restarting Ollama

### Auto-Update Fails

1. Check your internet connection
2. If the download fails, click **Retry** on the update banner
3. If the install fails, try downloading the latest release from the releases page
4. Check that you have sufficient disk space for the update

### Getting Help

- Press `⌘K` and type "help" for quick commands
- Check the [README](../README.md) for project overview
- See the [Developer Guide](DEVELOPER_GUIDE.md) for architecture and troubleshooting
