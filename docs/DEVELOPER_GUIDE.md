# Mothership Developer Guide

## Architecture Overview

Mothership is a **Tauri 2.x** desktop app with a **React + TypeScript** frontend and **Rust** backend. Memory persistence uses **SQLite** with FTS5 full-text search.

```
┌─────────────────────────────────────────────────────────┐
│                    Tauri Shell (Rust)                    │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Commands (IPC Layer)                │   │
│  │  file_commands | sidecar | summary | model | ... │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │ SQLite   │  │ PTY      │  │ SidecarManager       │  │
│  │ (FTS5)   │  │ Sessions │  │ (Python JSON-RPC)    │  │
│  └──────────┘  └──────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │ IPC
┌─────────────────────────────────────────────────────────┐
│              Frontend (React + TypeScript)               │
│  ┌──────────────────────────────────────────────────┐   │
│  │           Zustand Stores (11 stores)             │   │
│  │  agent | memory | modelRouter | warRoom | task   │   │
│  │  mcp | onboarding | workspace | file | theme    │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │           Components                              │   │
│  │  agents | memory | model | warRoom | taskGraph   │   │
│  │  browser | mcp | onboarding | workspace | term  │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Key Files

| File | Purpose |
|---|---|
| `src/stores/*Store.ts` | Zustand state stores |
| `src/lib/*` | Utility libraries |
| `src-tauri/src/commands/*.rs` | Rust IPC handlers |
| `src-tauri/src/memory/store.rs` | SQLite + FTS5 layer |
| `src-tauri/src/process.rs` | Sidecar lifecycle |
| `src-tauri/src/terminal/` | PTY session management |

## State Management

All state lives in Zustand stores. Stores are pure TypeScript — no backend coupling at the store level.

```typescript
// Example store pattern
interface MemoryState {
  notes: Note[]
  addNote: (note: CreateNoteInput) => Promise<string>
  deleteNote: (id: string) => void
}

export const useMemoryStore = create<MemoryState>((set, get) => ({
  notes: [],
  addNote: async (input) => {
    const id = await invoke<string>('create_note', { input })
    set((state) => ({ notes: [...state.notes, { id, ...input }] }))
    return id
  },
  deleteNote: (id) => {
    invoke('delete_note', { id })
    set((state) => ({ notes: state.notes.filter(n => n.id !== id) }))
  },
}))
```

## Adding a New Feature

### 1. Create the Store

```typescript
// src/stores/myFeatureStore.ts
import { create } from 'zustand'

interface MyFeatureState {
  items: Item[]
  addItem: (item: Item) => void
}

export const useMyFeatureStore = create<MyFeatureState>((set) => ({
  items: [],
  addItem: (item) => set((s) => ({ items: [...s.items, item] })),
}))
```

### 2. Create the Component

```typescript
// src/components/my-feature/MyFeature.tsx
import { useMyFeatureStore } from '../../stores/myFeatureStore'

export function MyFeature() {
  const items = useMyFeatureStore((s) => s.items)
  return <div>{items.map(item => <div key={item.id}>{item.name}</div>)}</div>
}
```

### 3. Wire into MemoryPanel

```typescript
// src/components/memory/MemoryPanel.tsx
import { MyFeature } from '../my-feature/MyFeature'

// Add tab:
const TABS = [...existingTabs, { id: 'my-feature', label: 'My Feature', icon: 'icon' }]
// Add panel:
{activeTab === 'my-feature' && <MyFeature />}
```

### 4. Add Tests

```typescript
// src/test/stores/myFeatureStore.test.ts
import { renderHook, act } from '@testing-library/react'
import { useMyFeatureStore } from '../../stores/myFeatureStore'

describe('myFeatureStore', () => {
  beforeEach(() => {
    useMyFeatureStore.setState({ items: [] })
  })

  it('adds an item', () => {
    const { result } = renderHook(() => useMyFeatureStore())
    act(() => result.current.addItem({ id: '1', name: 'Test' }))
    expect(result.current.items).toHaveLength(1)
  })
})
```

## Adding a Rust Command

```rust
// src-tauri/src/commands/my_commands.rs
use tauri::command;

#[command]
pub fn my_command(arg: String) -> Result<String, String> {
    Ok(format!("Processed: {}", arg))
}
```

Register in `main.rs`:
```rust
.invoke_handler(tauri::generate_handler![
    // ...existing commands
    my_commands::my_command,
])
```

## Running Tests

```bash
# Unit tests
npm test

# With coverage
npm run test:coverage

# Specific test file
npx vitest run src/test/stores/agentStore.test.ts

# Watch mode
npx vitest
```

## Code Conventions

- **Immutability:** Never mutate state directly — always spread
- **Naming:** PascalCase components, camelCase functions, kebab-case files
- **File size:** Target 200-400 lines, max 800
- **No comments:** Code should be self-documenting
- **Error handling:** Always catch and handle errors

## Performance

- Lazy-load heavy panels with `LazyPanels.tsx`
- Batch memory writes (2s flush interval)
- Use `useCallback`/`useMemo` for expensive computations
- Avoid re-renders by selecting specific store slices

## Debugging

### Frontend

1. Open DevTools: Right-click → Inspect
2. React DevTools: Install browser extension
3. Zustand DevTools: Install `zustand/devtools`

### Backend

1. Check Tauri logs: `src-tauri/target/debug/`
2. Sidecar logs: `sidecars/logs/`
3. SQLite database: `src-tauri/memories.db`
