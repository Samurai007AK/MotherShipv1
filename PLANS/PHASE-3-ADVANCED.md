# Mothership — Phase 3: Advanced Features

**Estimated Time:** 45-65 hours (updated from 40-60)
**Dependencies:** Phase 2 complete
**Gate G3:** Browser agent view works; task graph renders; multi-agent chat

---

## Overview

Phase 3 transforms Mothership from a useful tool into a powerful platform. Browser-based agents get embedded WebView automation, local models route through a unified inference engine, the session history becomes a visual task dependency graph, and multi-agent collaboration enables running prompts across multiple agents simultaneously.

**Subdivision note:** The original Sub-phase 3.4 (War Room) was 10-14 hours and has been split into 3.4a (Core) and 3.4b (Task Chaining).

---

## Open-Source Tools Used

| Tool | Usage | Link |
|---|---|---|
| **Playwright** | Browser automation for web-based agents | https://playwright.dev |
| **D3.js** | Graph visualization for task dependency | https://d3js.org |
| **Orkas** | Reference for self-evolving agent patterns | https://github.com/Orkas-AI/Orkas |
| **Nexus** | Reference for Graph/Router/Adaptive orchestration | https://github.com/sontianye/nexus |
| **Overseer** | Reference for quality gates + task graph | https://github.com/nikitatat/Overseer |
| **Shogun** | Reference for visual workflow builder | https://github.com/AlphaHorizon-AI/Shogun |

---

## Sub-Phase 3.1: Browser Connector for Web Agents

**Time:** 12-16 hours ❌ NOT STARTED
**Gate:** ChatGPT and Gemini web interfaces show as embedded views

### Steps

1. Tauri WebView integration (`src-tauri/src/browser.rs`)
2. Spawn browser agent command with isolated sessions
3. Screenshot capture on handoff
4. URL/content extraction for context
5. "Open in external browser" fallback for blocking sites
6. Playwright automation for programmatic interaction (optional)

---

## Sub-Phase 3.2: Local Model Router

**Time:** 8-10 hours ❌ NOT STARTED
**Gate:** Select Ollama model from dropdown; responses stream into workspace

### Steps

1. Model discovery via Ollama API
2. Injection into CrewAI Flow
3. Model comparison view (side-by-side)
4. Streaming response display in workspace

---

## Sub-Phase 3.3: Task Dependency Graph

**Time:** 8-12 hours ❌ NOT STARTED
**Gate:** Handoff history visualized as a DAG

### Steps

1. Graph data model (nodes + edges)
2. D3.js force-directed layout
3. Interactive features (click, hover, zoom, filter)
4. Rust backend query for project graph data
5. Filter by agent, time range, type

---

## Sub-Phase 3.4a: War Room — Multi-Agent Broadcast

**Time:** 6-8 hours ❌ NOT STARTED
**Gate:** Same prompt sent to 2+ agents; results shown side-by-side

### Steps

1. Multi-agent prompt broadcast function
2. Side-by-side comparison view component
3. Loading states and error handling per agent
4. Result diffing and highlighting

---

## Sub-Phase 3.4b: War Room — Task Chaining

**Time:** 4-6 hours ❌ NOT STARTED
**Gate:** Agent output chains to next agent's input automatically

### Steps

1. Task chaining logic (output → next input)
2. Chain template editor (prompt templates with `{previous}` placeholder)
3. Step-by-step execution with progress indicator
4. CrewAI integration for chaining (`@start`, `@listen`, `@router`)

---

## Sub-Phase 3.5: MCP Server Integration

**Time:** 4-6 hours ❌ NOT STARTED
**Gate:** Agents can use MCP tools through Mothership

### Steps

1. MCP tool registry
2. Tool routing per agent
3. Tool call logging in memory

---

## Phase 3 Deliverable Checklist

- [ ] Embedded WebView for browser-based agents — (3.1)
- [ ] Screenshot capture on handoff — (3.1)
- [ ] Local model router (Ollama) — (3.2)
- [ ] Model comparison view — (3.2)
- [ ] Task dependency graph (D3.js) — (3.3)
- [ ] Interactive graph — (3.3)
- [ ] Multi-agent broadcast (war room) — (3.4a)
- [ ] Side-by-side comparison panels — (3.4a)
- [ ] Task chaining — (3.4b)
- [ ] MCP tool registry — (3.5)

---

## Phase 3 Completion Criteria

> **Gate G3:** A user can open Mothership, see a visual graph of their session history, run the same prompt against 3 local models side-by-side, manage browser-based agents via embedded WebView, and chain tasks across agents automatically.
