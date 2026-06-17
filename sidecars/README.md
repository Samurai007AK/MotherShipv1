# Mothership Sidecars

This directory contains Python sidecar processes managed by the Mothership Tauri backend.

## Structure

```
sidecars/
├── hello-bridge/       ← Test sidecar (JSON-RPC over STDIO)
├── crewai-bridge/      ← CrewAI orchestration (Flow API @start/@listen/@router)
├── openhands-bridge/   ← OpenHands SDK agent execution (sandboxed, Docker/local)
└── summary-engine/     ← Ollama summarization (Phase 2)
```

## Protocol

Sidecars communicate via JSON-RPC 2.0 over stdin/stdout:
- **Request:** `{"jsonrpc": "2.0", "method": "ping", "params": {}, "id": 1}`
- **Response:** `{"jsonrpc": "2.0", "result": {"status": "ok"}, "id": 1}`

## Lifecycle

1. Tauri spawns the sidecar process
2. Sidecar sends a `ready` notification on startup
3. Tauri sends requests and receives responses
4. Tauri sends `shutdown` or SIGTERM to stop
