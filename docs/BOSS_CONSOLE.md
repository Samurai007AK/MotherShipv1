# Developing Mothership inside BossConsole

Mothership is a lightweight Tauri desktop app. [BossConsole](https://github.com/risa-labs-inc/BossConsole)
is the recommended operator console for working on it. BOSS is Apache-2.0, runs on the JVM,
and is open source. It gives whatever AI coding agent you use a governed terminal, browser,
and MCP tool layer.

## 1. Install BOSS

Download a prebuilt installer from
[BossConsole-Releases](https://github.com/risa-labs-inc/BossConsole-Releases/releases/latest)
(Windows MSI, macOS DMG/Homebrew, Linux DEB/RPM/JAR), or build from source per its README.

## 2. Open Mothership in BOSS

Open a BossTerm terminal, then clone this repo and open it:

```bash
git clone https://github.com/Samurai007AK/MotherShipv1
cd MotherShipv1
npm ci
```

Run the app as usual. Use `npm run dev` for UI-only work or `npm run tauri dev` for the full desktop shell.

## 3. Attach your agent to the `boss` MCP server

In a BOSS terminal, attach your CLI once. BOSS re-attaches automatically on restart and
injects `BOSS_MCP_PORT` into every terminal. Check the port shown in **Toolbox → MCP**,
since another listener can move it off the default `7677`. Never hardcode it.

| Agent | Attach |
|---|---|
| Claude Code | `claude mcp add --scope user --transport sse boss <url>` |
| Codex | `codex mcp add boss --url <url>/mcp` (streamable HTTP) |
| Gemini CLI | `gemini mcp add boss <url> --transport sse --scope user` |
| OpenCode | server written into `~/.config/opencode/opencode.json` |

Your agent then gets 100+ governed `boss` tools for browser, files, git, shell,
and automation work, on top of the repo checkout.

## 4. Connect Mothership to BOSS over MCP

Mothership's MCP panel speaks SSE and streamable HTTP, so BOSS itself can be an MCP server entry:

1. In Mothership, open the MCP panel → Add server.
2. Name `boss`, type `streamable-http`, URL `<url>/mcp` (or `sse` + `<url>`), using the same
   loopback URL/port from step 3.
3. Connect. BOSS tools now appear in Mothership's tool list. Mothership's own per-tool
   kill-switches still apply, mirroring the Toolbox governance in BOSS. Exposed means all
   tools minus disabled ones, and calls to disabled tools fail closed.

## 5. What replaces what

| Mothership panel | BOSS equivalent | Notes |
|---|---|---|
| BrowserConnector | Fluck embedded browser | Agent-scriptable. Logins use Secret Manager auto-fill, so values never reach the model |
| TerminalPane | BossTerm | Shareable via QR or E2E link, with view-only or full control |
| MCPPanel toggles | Toolbox → MCP kill-switches | Per-tool and persisted in `mcp-disabled-tools.json`. This is the control that always applies, even for admins |
| Agent credentials | Secret Manager | User-scoped. Prefer it over pasting keys into chats or `.env` files |

## 6. Future work

- Build a native secret manager in Mothership following the BOSS scoping and autofill model.
- Add hot-reloadable plugin and toolbox parity with the BOSS Tool Creator and Evolver loop.
