# Test Implementation Progress Report

> **Agent:** ZCode (executing-plans skill)  
> **Date:** 2026-06-21  
> **Source:** `PLANS/HANDOFF-NEXT-AGENT.md`  
> **Baseline:** 649/651 tests passing (2 pre-existing failures in SplitPane + TerminalPane)

---

## Summary

Writing unit tests for untested Mothership frontend components, following the handoff's priority order and established test patterns (fresh renders per test, `afterEach` cleanup, store fixture helpers, Tauri invoke mock).

---

## Completed

### 1. TaskGraph Tests — ✅ 25 tests passing

**File:** `src/test/components/TaskGraph.test.tsx`  
**Component:** `src/components/task-graph/TaskGraph.tsx`  
**Complexity:** HIGH (D3.js force simulation, SVG rendering, zoom, drag, edge creation)

**Approach:** Did NOT mock D3 — D3 runs natively in jsdom. Tested **UI interactions** that call the right store actions:

| Category | Tests | What's Covered |
|---|---|---|
| Header | 2 | Title text, GitBranch icon |
| Empty state | 4 | "No graphs" text, no action buttons without graph, SVG renders, empty-task text in SVG |
| Graph selector | 2 | Select populated with graph names, switching active graph via onChange |
| Action buttons | 2 | Node/Edge buttons visible with active graph, Delete only when node selected |
| Add Node form | 8 | Hidden by default, shows on click, Cancel, Escape, agent dropdown, Add with label, empty-label guard, Enter submit with agent |
| Edge mode | 3 | Toggle on, "click source" hint, toggle off via Cancel Edge |
| Delete | 1 | Removes selected node and clears selection |
| Legend | 1 | All 4 status labels (Pending, Running, Completed, Error) |
| SVG canvas | 1 | Arrowhead marker definition exists |

**Key lesson:** `vi.spyOn(useTaskGraphStore.getState(), 'addNode')` spies on a *snapshot* — doesn't intercept what the component calls. Use state assertions instead (check `graph.nodes.length` after interaction).

---

### 2. MCPPanel Tests — ✅ 34 tests passing

**File:** `src/test/components/MCPPanel.test.tsx`  
**Component:** `src/components/mcp/MCPPanel.tsx`  
**Complexity:** HIGH (server CRUD, connect/disconnect, expand/collapse, tools/resources display, form validation)

| Category | Tests | What's Covered |
|---|---|---|
| Header | 3 | Title, Add button, Plug icon |
| Empty state | 2 | Message shown/hidden based on servers |
| Add Server form | 7 | Hidden by default, shows on click, Cancel, transport types (SSE/HTTP/Stdio), empty-name guard, empty-url guard, full add with type selection |
| Server list rendering | 7 | Name + URL, Connect button for disconnected, Disconnect for connected, green check icon, red alert icon, Trash per server, multiple servers |
| Connect/Disconnect | 4 | connectServer called, disconnectServer called, stopPropagation on connect button, stopPropagation on remove button |
| Remove | 1 | Removes server from list |
| Expand/Collapse | 7 | Expand on click, collapse on second click, chevron icons, "No tools available", "No resources available", lists server tools, lists server resources, refresh buttons present |
| Refresh async | 2 | listTools called on refresh click, listResources called on refresh click |

**Key lesson:** Lucide icon CSS classes use the *canonical* re-export name, not the import name. `CheckCircle2` → `.lucide-circle-check`, `AlertCircle` → `.lucide-circle-alert`. Discovered by reading the icon module files (`check-circle-2.js` re-exports `circle-check`).

---

### 3. ConversationHistory Tests — ✅ WRITTEN (not yet run)

**File:** `src/test/components/ConversationHistory.test.tsx`  
**Component:** `src/components/terminal/ConversationHistory.tsx`  
**Complexity:** MEDIUM (exchange grouping, scroll, copy-to-clipboard, empty state)

**Planned coverage (~22 tests):**

| Category | Tests | What's Covered |
|---|---|---|
| Open/Closed | 2 | Returns null when closed, renders when open |
| Header | 2 | Message count badge, close button |
| Empty state | 3 | No messages, only system messages, non-empty messages |
| buildExchanges logic | 6 | User+assistant pair, multiple pairs, singular "exchange", orphan trailing user, consecutive users, orphan leading assistant |
| Preview truncation | 2 | Short content, line-clamp on long content |
| Footer | 1 | Exchange count + hint text |
| Interaction | 2 | onJumpToExchange click, clipboard copy |

**Approach:** `buildExchanges()` is a private (non-exported) function — tested indirectly through the rendered UI by passing specific message arrays that exercise each branch (system skip, orphan user, pairing, trailing user, consecutive users, leading assistant).

---

### 4. ErrorBoundary Tests — ✅ WRITTEN (not yet run)

**File:** `src/test/components/ErrorBoundary.test.tsx`  
**Component:** `src/components/layout/ErrorBoundary.tsx`  
**Complexity:** MEDIUM (class component, React error boundary, getDerivedStateFromError, retry)

**Planned coverage (~10 tests):**

| Category | Tests | What's Covered |
|---|---|---|
| Happy path | 2 | Renders children normally, no fallback shown |
| Error catching | 6 | Fallback UI shown, default "Panel" name, custom panelName, error message displayed, fallback when error has no message, componentDidCatch logging |
| Retry | 1 | Clears error state, child re-renders successfully |
| Fallback structure | 2 | Alert triangle icon, refresh icon on Retry button |

**Approach:** Uses a `ThrowOnceChild` component (module-level flag reset in `beforeEach`) that throws on first render then succeeds — lets the Retry test assert full recovery. Silences `console.error` in `beforeEach` to avoid React's error logging noise.

---

## In Progress

- **ConversationHistory** — written, needs first run
- **ErrorBoundary** — written, needs first run

---

## Remaining (Priority Order)

### HIGH — Components
| # | Component | Status |
|---|---|---|
| 1 | TaskGraph | ✅ 25 tests |
| 2 | MCPPanel | ✅ 34 tests |
| 3 | ConversationHistory | ✅ Written, pending run |
| 4 | ErrorBoundary | ✅ Written, pending run |

### MEDIUM — Components
| # | Component | Status |
|---|---|---|
| 5 | ResizableLayout | Pending |
| 6 | ThemeToggle (LOW) | Pending |
| 7 | LazyPanels | Pending |
| 8 | WorktreeManager | Pending |

### MEDIUM — Hooks
| # | Hook | Status |
|---|---|---|
| 9 | useContextCapture | Pending |

### MEDIUM — Fix existing failures
| # | File | Status |
|---|---|---|
| 10 | SplitPane.test.tsx — `setActiveSplitPane` called 2x instead of 0x | Pending |
| 11 | TerminalPane.test.tsx — can't find text '4' in message count | Pending |

### LOW
| # | Component | Status |
|---|---|---|
| 12 | App.tsx | Pending |

---

## Patterns Established

1. **Import + mock scaffold:** Every test file starts with `vi.mock('@tauri-apps/api/core')` and `beforeAll(() => { Element.prototype.scrollIntoView = vi.fn() })`.
2. **Store fixture helper:** `clearStores()` function resets all relevant stores to empty state in `beforeEach`.
3. **Fresh renders per test:** No `beforeEach` renders. Each `it()` calls `setState()` then `render()`.
4. **`afterEach` cleanup:** Always `document.body.innerHTML = ''`.
5. **CSS selectors:** Escape `/` in Tailwind classes as `\\/`.
6. **Duplicate text:** Use `getAllByText` with `.find()` when text appears in headings and buttons.
7. **Lucide icons:** Check the actual re-export chain in `node_modules/lucide-react/dist/esm/icons/` — the CSS class uses the canonical name, not the import alias.
8. **Zustand spy caveat:** `vi.spyOn(useTaskGraphStore.getState(), 'action')` spies on a snapshot — prefer state assertions.
9. **React error boundaries:** Use throw-once child pattern with module-level flag for Retry testing.

---

## Test Count Tracker

| Component | New Tests | Running Total |
|---|---|---|
| TaskGraph | 25 | 25 |
| MCPPanel | 34 | 59 |
| ConversationHistory | ~22 | ~81 |
| ErrorBoundary | ~10 | ~91 |

*Baseline: 649 tests across 25 files (from prior agents)*
