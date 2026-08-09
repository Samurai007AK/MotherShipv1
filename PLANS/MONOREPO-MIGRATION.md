# Mothership → Turborepo Monorepo Migration Plan

## 1. Motivation & Goals

Mothership is currently a flat Vite + Tauri project. As features grow (worktree isolation, PTY daemon, MCP, war room, task graph), extracting shared packages gives:

- **Independent versioning** — `@mothership/shared` types can evolve on their own cadence
- **Faster CI** — Turborepo caches per-package build outputs; unchanged packages skip rebuild
- **Clearer boundaries** — Stores that depend on Tauri IPC stay in the desktop app; pure utilities move to shared packages
- **Future flexibility** — A web app, CLI, or Electron variant can reuse `@mothership/ui` and `@mothership/db` without touching the Tauri shell

## 2. Target Directory Structure

```
Mother/
├── package.json                  # Root: workspaces, turbo, shared scripts
├── turbo.json                    # Turborepo pipeline config
├── .gitignore
├── .npmrc                        # If using npm workspaces
├── scripts/
│   └── postinstall.sh            # (Optional) post-install hooks
│
├── packages/
│   ├── shared/                   # @mothership/shared
│   │   ├── package.json          # Deps: none (pure TS)
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── types/
│   │       │   ├── taskGraph.ts
│   │       │   ├── warRoom.ts     # (strip AgentProvider import — move type into shared)
│   │       │   ├── mcp.ts
│   │       │   └── index.ts
│   │       ├── utils/
│   │       │   ├── fuzzySearch.ts
│   │       │   ├── summaryEngine.ts  # (strip invoke — accept callbacks)
│   │       │   ├── performance.ts
│   │       │   └── index.ts
│   │       └── index.ts
│   │
│   ├── db/                       # @mothership/db
│   │   ├── package.json          # Deps: @mothership/shared, zustand, @tauri-apps/api
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── stores/           # Zustand stores (move from src/stores/)
│   │       │   ├── agentStore.ts
│   │       │   ├── memoryStore.ts
│   │       │   ├── workspaceStore.ts
│   │       │   ├── warRoomStore.ts
│   │       │   ├── taskGraphStore.ts
│   │       │   ├── mcpStore.ts
│   │       │   ├── modelRouterStore.ts
│   │       │   ├── themeStore.ts
│   │       │   ├── onboardingStore.ts
│   │       │   ├── loopStore.ts
│   │       │   ├── archiveStore.ts
│   │       │   ├── qualityGateStore.ts
│   │       │   ├── coordinatorStore.ts
│   │       │   ├── fileStore.ts
│   │       │   └── worktreeStore.ts
│   │       ├── modelRouter.ts    # Ollama client (moved from src/lib/)
│   │       ├── mcp/
│   │       │   └── client.ts     # MCP client (moved from src/lib/mcp/)
│   │       └── index.ts
│   │
│   └── ui/                       # @mothership/ui
│       ├── package.json          # Deps: @mothership/shared, @mothership/db, react, lucide-react, tailwindcss
│       ├── tsconfig.json
│       ├── tailwind.config.ts    # Extends root config with component classes
│       ├── postcss.config.js
│       ├── src/
│       │   ├── index.ts          # Re-export all components
│       │   ├── components/
│       │   │   ├── agents/
│       │   │   │   ├── AgentSidebar.tsx
│       │   │   │   └── AddAgentDialog.tsx
│       │   │   ├── layout/
│       │   │   │   ├── ErrorBoundary.tsx
│       │   │   │   ├── ThemeToggle.tsx
│       │   │   │   └── ResizableLayout.tsx
│       │   │   ├── workspace/
│       │   │   │   ├── WorkspaceView.tsx
│       │   │   │   ├── WorktreeManager.tsx
│       │   │   │   └── index.ts
│       │   │   ├── terminal/
│       │   │   │   ├── TerminalPane.tsx
│       │   │   │   ├── SplitPane.tsx
│       │   │   │   ├── ConversationHistory.tsx
│       │   │   │   └── index.ts
│       │   │   ├── memory/
│       │   │   │   ├── MemoryPanel.tsx
│       │   │   │   ├── NoteEditor.tsx
│       │   │   │   ├── Timeline.tsx
│       │   │   │   ├── HandoffDialog.tsx
│       │   │   │   └── index.ts
│       │   │   ├── command-palette/
│       │   │   │   └── CommandPalette.tsx
│       │   │   ├── model-router/
│       │   │   │   └── ModelRouterPanel.tsx
│       │   │   ├── war-room/
│       │   │   │   └── WarRoom.tsx
│       │   │   ├── task-graph/
│       │   │   │   └── TaskGraph.tsx
│       │   │   ├── browser/
│       │   │   │   └── BrowserConnector.tsx
│       │   │   ├── mcp/
│       │   │   │   └── MCPPanel.tsx
│       │   │   ├── onboarding/
│       │   │   │   └── OnboardingWizard.tsx
│       │   │   └── LazyPanels.tsx
│       │   ├── hooks/
│       │   │   ├── useTerminal.ts
│       │   │   └── useContextCapture.ts
│       │   └── index.css         # Tailwind directives + custom CSS
│       └── test/                 # Component tests
│
├── apps/
│   └── desktop/                  # Mothership Desktop App (Tauri)
│       ├── package.json          # Deps: @mothership/shared, @mothership/db, @mothership/ui, tauri
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       ├── tailwind.config.js    # Extends @mothership/ui's config
│       ├── postcss.config.js
│       ├── src/
│       │   ├── main.tsx          # React entry point
│       │   ├── App.tsx
│       │   ├── main.css          # Imports @mothership/ui/index.css
│       │   └── vite-env.d.ts
│       └── src-tauri/            # Rust backend (unchanged)
│           ├── Cargo.toml
│           ├── tauri.conf.json
│           ├── build.rs
│           └── src/
│               ├── main.rs
│               ├── lib.rs
│               ├── commands/
│               ├── terminal/
│               ├── memory/
│               ├── loop_controller/
│               ├── quality_gate/
│               ├── archive/
│               └── process.rs
│
├── sidecars/                     # Python sidecars (unchanged)
│   ├── hello-bridge/
│   ├── summary-engine/
│   ├── crewai-bridge/
│   └── openhands-bridge/
│
├── tests/                        # E2E tests (unchanged)
│   └── e2e/
│       ├── app.spec.ts
│       └── drag-drop.spec.ts
│
├── PLANS/                        # Planning docs (unchanged)
└── docs/                         # User guides (unchanged)
```

## 3. Package Boundaries & Dependency Graph

### Dependency Flow

```
@mothership/shared     (zero dependencies — pure TS types + utils)
        ↑
@mothership/db         (depends on shared + zustand + @tauri-apps/api)
        ↑
@mothership/ui         (depends on shared + db + react + lucide-react + tailwind)
        ↑
apps/desktop            (depends on all three packages + tauri)
```

### What Goes Where

| Current Location | Target Package | Rationale |
|---|---|---|
| `src/types/*` | `packages/shared/src/types/` | Pure interfaces, no runtime deps |
| `src/lib/fuzzySearch.ts` | `packages/shared/src/utils/` | Pure function, no deps |
| `src/lib/performance.ts` | `packages/shared/src/utils/` | Pure utilities except React import — extract React dependency |
| `src/lib/summaryEngine.ts` | `packages/shared/src/utils/` | Strip `invoke` — accept callbacks instead |
| `src/lib/modelRouter.ts` | `packages/db/src/` | Uses `invoke` + `fetch` — Tauri-aware |
| `src/lib/mcp/client.ts` | `packages/db/src/mcp/` | Uses WebSocket + Tauri types |
| `src/stores/*` | `packages/db/src/stores/` | All use `invoke` + `zustand` |
| `src/components/*` | `packages/ui/src/components/` | Pure React components |
| `src/hooks/*` | `packages/ui/src/hooks/` | React hooks |
| `src/App.tsx` | `apps/desktop/src/` | App entry point — stays colocated |
| `src/main.tsx` | `apps/desktop/src/` | Entry point |
| `src/index.css` | `packages/ui/src/` | Tailwind base styles + theme vars |
| `src/test/*` | Split: unit tests move with their packages, E2E stays at root |

### Cross-Package Import Transformations

**Before (current import):**
```ts
import { TaskGraph } from '../types/taskGraph'
import { useAgentStore } from '../stores/agentStore'
import { fuzzyFilter } from '../lib/fuzzySearch'
```

**After (monorepo import):**
```ts
import { TaskGraph } from '@mothership/shared/types'
import { useAgentStore } from '@mothership/db'
import { fuzzyFilter } from '@mothership/shared/utils'
```

### Special Cases

1. **`src/index.css`** — Contains Tailwind directives and CSS variable definitions. Moves to `@mothership/ui/src/index.css`. The desktop app imports it via: `@import '@mothership/ui/index.css'`.

2. **`src/hooks/useTerminal.ts`** — Depends on `@tauri-apps/api`, `@xterm/xterm`, and stores. Moves to `@mothership/ui/src/hooks/` since it's a React hook.

3. **`src/components/LazyPanels.tsx`** — Uses `React.lazy` for code-splitting. Moves to `@mothership/ui`.

4. **`src/types/warRoom.ts`** — Currently imports `AgentProvider` from `stores/agentStore`. This creates a circular dependency. Fix: define `AgentProvider` type in `@mothership/shared/types` and re-export from the store.

5. **`src/lib/summaryEngine.ts`** — Uses `invoke('summarize_context')`. To put it in `@mothership/shared` (pure), we need to make the Tauri call an injected dependency.

6. **`src/lib/performance.ts`** — Has `import React from 'react'` at the bottom for `React.lazy`. Extract the React-specific `lazyLoad` into `@mothership/ui`, keep the pure utilities in `@mothership/shared`.

## 4. Migration Steps

### Phase 1: Create Monorepo Skeleton (Estimated: 1 session)

1. **Initialize Turborepo**
   - Add `turbo` to root `devDependencies`
   - Create `turbo.json` with pipeline definitions
   - Add `"workspaces": ["packages/*", "apps/*"]` to root `package.json`
   - Rename root package from `"mothership"` to `"@mothership/repo"`

2. **Create scaffolding scripts**
   - `packages/shared/package.json` — minimal build config
   - `packages/db/package.json` — depends on shared + zustand + tauri-api
   - `packages/ui/package.json` — depends on shared + db + react + tailwind
   - `apps/desktop/package.json` — depends on all three packages

3. **Configure TypeScript for monorepo**
   - Root `tsconfig.json` with `"references"` to all packages
   - Each package gets its own `tsconfig.json` with `"composite": true`
   - Add path aliases for development

4. **Configure Vite for workspace resolution**
   - Desktop app's `vite.config.ts` needs `resolve.alias` or rely on `npm link`

### Phase 2: Extract `@mothership/shared` (Estimated: 1 session)

1. Copy `src/types/` → `packages/shared/src/types/`
2. Fix `warRoom.ts` — move `AgentProvider` type into shared:
   ```ts
   // packages/shared/src/types/agent.ts
   export type AgentProvider = 'claude' | 'codex' | 'gemini' | 'opencode' | 'file'
   ```
3. Copy `src/lib/fuzzySearch.ts` → `packages/shared/src/utils/`
4. Copy `src/lib/performance.ts` → split into:
   - `packages/shared/src/utils/performance.ts` (pure utilities: `debounce`, `throttle`, `BatchQueue`, `measureTime`)
   - `packages/ui/src/utils/lazyLoad.ts` (React-specific: `lazyLoad`)
5. Copy `src/lib/summaryEngine.ts` → `packages/shared/src/utils/summaryEngine.ts`
   - Refactor to accept `invoke` as a parameter instead of importing it directly
6. Create `packages/shared/src/index.ts` with re-exports

### Phase 3: Extract `@mothership/db` (Estimated: 2 sessions)

1. Copy all `src/stores/*.ts` → `packages/db/src/stores/`
   - Update imports from `'../types/...'` → `'@mothership/shared'`
   - Update imports from `'../lib/...'` → `'@mothership/shared'`
2. Copy `src/lib/modelRouter.ts` → `packages/db/src/modelRouter.ts`
3. Copy `src/lib/mcp/client.ts` → `packages/db/src/mcp/client.ts`
4. Create `packages/db/src/index.ts` with re-exports from stores, modelRouter, mcp
5. Update all store imports to use `@mothership/db` paths

### Phase 4: Extract `@mothership/ui` (Estimated: 2 sessions)

1. Copy `src/index.css` → `packages/ui/src/index.css`
2. Copy `src/components/` → `packages/ui/src/components/`
   - Update ALL imports from `../../stores/` → `@mothership/db`
   - Update ALL imports from `../../types/` → `@mothership/shared`
   - Update ALL imports from `../../lib/` → `@mothership/shared` or `@mothership/db`
3. Copy `src/hooks/` → `packages/ui/src/hooks/`
   - Update imports similarly
4. Create `packages/ui/tailwind.config.ts` — extends the root config
5. Create `packages/ui/src/index.ts` with component re-exports

### Phase 5: Rewire Desktop App (Estimated: 1 session)

1. Move `src/App.tsx` and `src/main.tsx` → `apps/desktop/src/`
2. Create `apps/desktop/vite.config.ts` pointing to new entry
3. Update `apps/desktop/src-tauri/` to reference correct frontend directory
4. Update `index.html` to point to new entry path
5. Configure `tauri.conf.json` for new `build.devUrl` and `build.frontendDist`

### Phase 6: Build Pipeline & Testing (Estimated: 1 session)

1. Configure `turbo.json`:
   ```json
   {
     "$schema": "https://turbo.build/schema.json",
     "tasks": {
       "build": {
         "dependsOn": ["^build"],
         "outputs": ["dist/**", ".next/**"]
       },
       "dev": {
         "cache": false,
         "persistent": true
       },
       "typecheck": {
         "dependsOn": ["^build"]
       },
       "test": {
         "dependsOn": ["^build"]
       }
     }
   }
   ```
2. Add `"typecheck"` and `"lint"` scripts to each package
3. Move unit tests to their respective packages
4. Verify E2E tests still work against the new structure

## 5. Turborepo Configuration

### Root `package.json`

```json
{
  "name": "@mothership/repo",
  "private": true,
  "packageManager": "npm@10.8.0",
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "dev": "turbo run dev --filter=@mothership/desktop",
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test --concurrency=2",
    "clean": "turbo run clean",
    "fmt": "prettier --write ."
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0",
    "prettier": "^3.0.0"
  }
}
```

### Pipeline Dependencies

```
            typecheck
               |
    ┌──────────┼──────────┐
    v          v          v
 @mothership  @mothership  @mothership
 /shared      /db          /ui
    |          |            |
    +----→ ←---→ ←---→ ←---+
              |
              v
         @mothership
         /desktop
              |
              v
           build
```

## 6. Key Challenges & Mitigations

| Challenge | Mitigation |
|---|---|
| **Circular dependency**: `warRoom.ts` imports `AgentProvider` from `agentStore.ts` | Extract `AgentProvider` type into `@mothership/shared/types/agent.ts` |
| **`summaryEngine.ts` calls `invoke`**: Can't go into pure shared package | Refactor to accept a `summarizeFn` callback parameter; the desktop app injects the real Tauri call |
| **`performance.ts` imports React**: Can't go into pure shared package | Split: pure utilities → `shared`, `lazyLoad` → `ui` |
| **CSS + Tailwind config fragmentation**: Each package needs its own Tailwind build | Use Tailwind's `@config` directive or a shared preset package |
| **Zustand stores use Tauri `invoke`**: Creates hard Tauri dependency in `@mothership/db` | Acceptable — stores are inherently tied to the backend. The package just bundles them |
| **Hook `useTerminal.ts` is 500+ lines**: Largest single file, deeply coupled to xterm.js | Keep in `@mothership/ui`. Break into smaller hooks as a follow-up |
| **Import path changes**: Every file needs import updates | Use a codemod or global search-replace. Do package-by-package to make it manageable |
| **TS project references**: Vite needs `"references"` to resolve workspace deps | Each package gets `"composite": true`. Root tsconfig references all packages |

## 7. Incremental Migration Strategy

Rather than a single massive PR, migrate incrementally:

```
Step 1: Root skeleton (turbo.json, workspaces, package renames)
Step 2: @mothership/shared  (no behavior change — just move + fix imports)
Step 3: Desktop app imports from @mothership/shared
Step 4: @mothership/db      (move stores, update to shared imports)
Step 5: Desktop app imports from @mothership/db
Step 6: @mothership/ui      (move components, update to shared + db imports)
Step 7: Desktop app becomes thin shell (App.tsx + main.tsx)
Step 8: Cleanup old src/ directory
```

Each step is independently verifiable (typecheck + tests still pass).

## 8. Files Not to Move

| File | Reason |
|---|---|
| `sidecars/` | Standalone Python processes — no JS dependency |
| `PLANS/` | Documentation — no runtime impact |
| `docs/` | User-facing guides |
| `tests/e2e/` | Playwright E2E tests — operate on the built app |
| `scripts/sync.sh` | Dev utility — stays at root |
| `src-tauri/` | Rust backend — stays with the desktop app |

## 9. Package.json Templates

### `packages/shared/package.json`

```json
{
  "name": "@mothership/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "clean": "git clean -xdf dist node_modules"
  },
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types/index.ts",
    "./utils": "./src/utils/index.ts"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

### `packages/db/package.json`

```json
{
  "name": "@mothership/db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "clean": "git clean -xdf dist node_modules"
  },
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./stores": "./src/stores/index.ts"
  },
  "dependencies": {
    "@mothership/shared": "workspace:*",
    "@tauri-apps/api": "^2.0.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  }
}
```

### `packages/ui/package.json`

```json
{
  "name": "@mothership/ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "clean": "git clean -xdf dist node_modules"
  },
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./components": "./src/components/index.ts",
    "./hooks": "./src/hooks/index.ts"
  },
  "dependencies": {
    "@mothership/shared": "workspace:*",
    "@mothership/db": "workspace:*",
    "@xterm/xterm": "^6.0.0",
    "@xterm/addon-fit": "^0.11.0",
    "@xterm/addon-search": "^0.16.0",
    "d3": "^7.9.0",
    "lucide-react": "^0.400.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-resizable-panels": "^4.11.2"
  },
  "devDependencies": {
    "@types/d3": "^7.4.3",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.4.0"
  }
}
```

### `apps/desktop/package.json`

```json
{
  "name": "@mothership/desktop",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "tauri": "tauri",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@mothership/shared": "workspace:*",
    "@mothership/db": "workspace:*",
    "@mothership/ui": "workspace:*",
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-shell": "^2.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.4.0",
    "vite": "^5.3.0"
  }
}
```

## 10. Rollout Sequence

The recommended execution order, with verification gates:

```
Session 1:  Create monorepo skeleton (turbo.json, root workspace config, package stubs)
            → Verify: `npm install` succeeds, root `turbo --version` works

Session 2:  Extract @mothership/shared (types + pure utils)
            → Verify: `turbo typecheck --filter=@mothership/shared` passes

Session 3:  Rewire desktop app to import from @mothership/shared
            → Verify: `turbo typecheck` passes (all packages)
            → Verify: `npm run dev` starts successfully

Session 4:  Extract @mothership/db (stores + Tauri-dependent libs)
            → Verify: `turbo typecheck` passes

Session 5:  Extract @mothership/ui (components + hooks + CSS)
            → Verify: `turbo typecheck` passes
            → Verify: `npm run dev` starts

Session 6:  Build pipeline + testing
            → Verify: `turbo build` produces working artifacts
            → Verify: `npm test` passes (unit + E2E)
            → Verify: `npm run tauri` builds the Tauri app
```
