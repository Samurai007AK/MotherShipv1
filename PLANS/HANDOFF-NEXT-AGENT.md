# Handoff — Mothership Unit Test Completion

> **Handoff from:** Agent (Buffy)  
> **Date:** 2026-06-21  
> **Next task:** Complete remaining unit test coverage for Mothership frontend components

---

## 1. First: Understand the Repository

Before writing any code, read these documents in order:

1. **`PLAN.md`** — Master implementation plan. Understand phases, what's built, project scope.
2. **`PLANS/INDEX.md`** — Document map showing all planning docs available.
3. **`PLANS/TESTING-STRATEGY.md`** — Testing philosophy, expected patterns, mock factories, coverage goals.
4. **`HANDBOOK.md`** — Project conventions and workflow guidelines.
5. **`docs/DEVELOPER_GUIDE.md`** — Dev setup, build, test commands.

Then read these code files to understand existing test patterns:

1. **`src/test/setup.ts`** — Test environment setup (vi.mock, jsdom config, polyfills).
2. **`src/test/components/CommandPalette.test.tsx`** — Clean, modern test file (no `beforeEach` renders, each test manages its own state). Use this as the canonical pattern.
3. **`src/test/components/BrowserConnector.test.tsx`** — Another well-structured test file (50 tests, all fresh renders per test).

---

## 2. Test Patterns to Follow

All tests should follow these conventions established in the codebase:

### Setup Pattern

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// jsdom polyfills (if needed)
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

afterEach(() => {
  document.body.innerHTML = ''
})

beforeEach(() => {
  vi.restoreAllMocks()
  // Reset all relevant stores to empty state
  useXStore.setState({ /* default empty state */ })
})
```

### Key Rules

1. **Each test manages its own state** — No `beforeEach` renders at the describe-block level. Each `it()` block calls `setState()` then `render()` independently. This avoids duplicate DOM elements.
2. **`afterEach` cleanup** — Always set `document.body.innerHTML = ''` to prevent cross-test pollution.
3. **Store fixture helpers** — Create a `clearStores()` function that resets all stores to empty state. Individual tests populate stores they need.
4. **ScrollIntoView polyfill** — Add `beforeAll(() => { Element.prototype.scrollIntoView = vi.fn() })` if the component uses ref-based scrolling.
5. **Tauri invoke mock** — Always `vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))` at the top level.
6. **CSS selectors** — In `document.querySelector`, escape `/` in class names as `\\/` (e.g., `.bg-c-bg\\/80`).
7. **Duplicate text** — Use `getAllByText` with `.find(el => el.tagName === 'BUTTON')` when text appears in both headings and buttons.

---

## 3. Current Test Coverage

### ✅ Completed (403+ tests across 25 test files)

| Component | Tests | File |
|-----------|-------|------|
| AddAgentDialog | 33 | `src/test/components/AddAgentDialog.test.tsx` |
| AgentSidebar | 28 | `src/test/components/AgentSidebar.test.tsx` |
| BrowserConnector | 50 | `src/test/components/BrowserConnector.test.tsx` |
| CommandPalette | 46 | `src/test/components/CommandPalette.test.tsx` |
| DiffViewer | 17 | `src/test/components/DiffViewer.test.tsx` |
| HandoffDialog | 32 | `src/test/components/HandoffDialog.test.tsx` |
| MemoryPanel | 41 | `src/test/components/MemoryPanel.test.tsx` |
| ModelRouterPanel | 34 | `src/test/components/ModelRouterPanel.test.tsx` |
| NoteEditor | 42 | `src/test/components/NoteEditor.test.tsx` |
| OnboardingWizard | 45 | `src/test/components/OnboardingWizard.test.tsx` |
| PresetPanel | 11 | `src/test/components/PresetPanel.test.tsx` |
| SplitPane | 24 | `src/test/components/SplitPane.test.tsx` |
| TerminalPane | 34 | `src/test/components/TerminalPane.test.tsx` |
| Timeline | 47 | `src/test/components/Timeline.test.tsx` |
| WarRoom | 33 | `src/test/components/WarRoom.test.tsx` |
| WorkspaceView | 20 | `src/test/components/WorkspaceView.test.tsx` |
| WorktreeCard | 18 | `src/test/components/WorktreeCard.test.tsx` |
| Hooks (2 files) | 12 | `src/test/hooks/` |
| Stores (6 files) | 83 | `src/test/stores/` |

---

## 4. Remaining Tasks (Priority Order)

### HIGH PRIORITY — Untested Components

These components have zero test coverage and are significant:

| # | Component | File | Complexity | Notes |
|---|-----------|------|------------|-------|
| 1 | **TaskGraph** | `src/components/task-graph/TaskGraph.tsx` | **HIGH** | D3.js simulation, drag nodes, zoom, SVG rendering, edge creation, store integration. Mock D3 heavily — don't test D3 itself, test that UI interactions call the right store actions. |
| 2 | **MCPPanel** | `src/components/mcp/MCPPanel.tsx` | **HIGH** | Server CRUD, connect/disconnect, expand/collapse, tools/resources display, form validation. Depends on `mcpStore` and `types/mcp.ts`. |
| 3 | **ConversationHistory** | `src/components/terminal/ConversationHistory.tsx` | **MEDIUM** | Exchange building logic, message display, copy-to-clipboard, scroll behavior, empty state. Has pure `buildExchanges()` function that should be unit-tested separately. |
| 4 | **ErrorBoundary** | `src/components/layout/ErrorBoundary.tsx` | **MEDIUM** | Class component (React error boundary). Test: renders children normally, catches errors, shows fallback, Retry button resets state. |

### MEDIUM PRIORITY — Untested Components

| # | Component | File | Complexity | Notes |
|---|-----------|------|------------|-------|
| 5 | **ResizableLayout** | `src/components/layout/ResizableLayout.tsx` | **MEDIUM** | Uses `react-resizable-panels`. Test: renders all 3 panels, loads/saves layout from localStorage, double-click resets. Mock `Group`, `Panel`, `Separator` from the library. |
| 6 | **ThemeToggle** | `src/components/layout/ThemeToggle.tsx` | **LOW** | Simple: 3 buttons (light/dark/system), active state highlight, calls `setTheme`. |
| 7 | **LazyPanels** | `src/components/LazyPanels.tsx` | **MEDIUM** | Lazy loading wrapper + idle timeout unmount. Test: renders children, idle timeout behavior, reactivates on activity. Uses timers — use `vi.useFakeTimers()`. |
| 8 | **WorktreeManager** | `src/components/workspace/WorktreeManager.tsx` | **MEDIUM** | Check if this is a significant component or just a small wrapper. |

### HIGH PRIORITY — Untested Hooks

| # | Hook | File | Complexity | Notes |
|---|------|------|------------|-------|
| 9 | **useTerminal** | `src/hooks/useTerminal.ts` | **VERY HIGH** | ~500 lines. PTY lifecycle, AI chat mode, search addon, clipboard, resize, event listeners. Best approached by testing through TerminalPane component tests (which already exist) rather than directly. |
| 10 | **useContextCapture** | `src/hooks/useContextCapture.ts` | **MEDIUM** | Global side-effect hook. Test that it attaches/detaches event listeners correctly. |

### MEDIUM PRIORITY — Pre-existing Test Failures

| # | File | Failure | Root Cause |
|---|------|---------|------------|
| 11 | `src/test/components/SplitPane.test.tsx` | `stops propagation on close button click` — `setActiveSplitPane` called 2 times instead of 0 | Mock TerminalPane interaction issue. The stopPropagation test dispatches a native click event but the mock's TerminalPane renders nested buttons that propagate differently. |
| 12 | `src/test/components/TerminalPane.test.tsx` | `shows message count in the history button` — can't find text '4' | The mock `conversationMessages` has 5 messages with 1 system message (so 4 non-system). But the component might render a different count. Check if `messageCount` is correctly mocked. |

### LOW PRIORITY — App-Level Tests

| # | Component | File | Notes |
|---|-----------|------|-------|
| 13 | **App.tsx** | `src/App.tsx` | Root component wiring. Test that it renders the layout, command palette, onboarding wizard, and theme sync. |

---

## 5. Next Task: TaskGraph Tests

The **highest priority** untested component is **TaskGraph** (`src/components/task-graph/TaskGraph.tsx`).

### Context

- D3.js force-directed graph with nodes, edges, zoom, drag
- Depends on `taskGraphStore` (already tested at `src/test/stores/taskGraphStore.test.ts`)
- Depends on `agentStore` for agent color mapping
- Uses SVG rendering with D3 force simulation

### Approach

1. Mock D3 heavily — mock `d3.select`, `d3.forceSimulation`, `d3.zoom`, `d3.drag` as `vi.fn()` returning chainable mock objects
2. Test **UI interactions** not D3 rendering:
   - "Add Node" button shows form
   - Form submission calls `addNode` on store
   - "Edge" toggle mode highlights button
   - Clicking two nodes in edge mode calls `addEdge`
   - Selecting a node highlights it
   - "Delete" button calls `removeNode`
   - Empty state shows "No tasks yet" text
   - Graph selector dropdown shows available graphs
3. For SVG content, check that the `<svg>` element renders and the empty-state text appears

### Key Files to Read

- `src/components/task-graph/TaskGraph.tsx` — The component
- `src/stores/taskGraphStore.ts` — Store it depends on
- `src/types/taskGraph.ts` — Type definitions
- `src/test/stores/taskGraphStore.test.ts` — Existing store tests (for mock data)
- `src/test/components/BrowserConnector.test.tsx` — Good example of SVG presence testing

---

## 6. Running Tests

```bash
# Run a single test file
npx vitest run src/test/components/TaskGraph.test.tsx --no-coverage

# Run all tests
npx vitest run --no-coverage

# Typecheck
npx tsc --noEmit

# Run in watch mode (dev)
npx vitest --no-coverage
```

---

## 7. Quick Reference — Store Reset Patterns

```typescript
// agentStore
useAgentStore.setState({
  agents: [],
  activeAgentId: null,
  recentAgentIds: [],
})

// memoryStore
useMemoryStore.setState({
  notes: [],
  contextHistory: [],
  activeTab: 'notes',
})

// workspaceStore
useWorkspaceStore.setState({
  tabs: [],
  activeTabId: null,
  splitPanes: new Map(),
  activeSplitPaneId: null,
})

// fileStore
useFileStore.setState({
  files: [],
  isLoading: false,
  lastFetch: Date.now(),
})
```

---

## 8. Summary of Test Totals

| Priority | Tasks | Estimated New Tests |
|----------|-------|---------------------|
| HIGH (components) | 4 components | ~150-200 tests |
| MEDIUM (components) | 4 components | ~100-150 tests |
| HIGH (hooks) | 2 hooks | ~50-80 tests |
| MEDIUM (fixes) | 2 failures | Fix existing, no new tests |
| LOW | App.tsx | ~20-30 tests |
| **Total remaining** | **12 tasks** | **~320-460 new tests** |

---

*Good luck, next agent! Focus on TaskGraph first, then work down the priority list.*
