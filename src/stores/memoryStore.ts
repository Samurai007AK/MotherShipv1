import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

// --- Types ---

export interface MemoryNote {
  id: string
  content: string
  agentId?: string
  entryType: string
  tags: string[]
  summary?: string
  filesReferenced: string[]
  createdAt: string
  updatedAt: string
}

export interface ContextEntry {
  id: string
  agentId: string
  entryType: 'prompt' | 'output' | 'summary' | 'handoff' | 'decision'
  content: string
  summary?: string
  filesReferenced: string[]
  createdAt: string
}

export interface HandoffPack {
  id: string
  sourceAgentId: string
  targetAgentId: string
  entries: MemoryNote[]
  summary: string
  createdAt: string
}

export interface SessionInfo {
  id: string
  agentId: string
  title?: string
  startedAt: string
  endedAt?: string
  entryCount: number
}

export type MemoryTab = 'notes' | 'context' | 'timeline' | 'search' | 'models' | 'warroom' | 'graph' | 'browser' | 'mcp'

// --- Batched save helper (flushes every 2s) ---

import { BatchQueue } from '../lib/performance'

const saveQueue = new BatchQueue<MemoryNote>((entries) => {
  entries.forEach((entry) => {
    invoke('save_memory', { entry }).catch((e) =>
      console.error('Failed to persist memory entry:', e)
    )
  })
}, 2000)

function queueSave(entry: MemoryNote) {
  saveQueue.add(entry)
}

// Flush on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => saveQueue.flush())
}

// --- Store ---

interface MemoryState {
  // Tab
  activeTab: MemoryTab

  // Notes
  notes: MemoryNote[]
  searchQuery: string

  // Context history
  contextHistory: ContextEntry[]
  contextFilter: string

  // Handoffs
  handoffHistory: HandoffPack[]

  // Sessions
  sessions: SessionInfo[]

  // Search
  globalSearchQuery: string
  searchResults: Array<{ type: 'note' | 'context'; item: MemoryNote | ContextEntry }>

  // Loading state
  isLoaded: boolean

  // Actions
  setActiveTab: (tab: MemoryTab) => void

  // Notes
  addNote: (content: string, agentId?: string, tags?: string[]) => void
  updateNote: (id: string, updates: Partial<Pick<MemoryNote, 'content' | 'tags'>>) => void
  deleteNote: (id: string) => void
  setSearchQuery: (query: string) => void
  getFilteredNotes: () => MemoryNote[]

  // Context
  addContextEntry: (entry: Omit<ContextEntry, 'id' | 'createdAt'>) => void
  setContextFilter: (filter: string) => void
  clearContextHistory: () => void

  // Handoffs
  compileHandoff: (sourceAgentId: string, targetAgentId: string) => Promise<HandoffPack | null>
  loadHandoffs: () => Promise<void>

  // Sessions
  loadSessions: () => Promise<void>

  // Persistence
  loadFromBackend: () => Promise<void>

  // Search
  setGlobalSearchQuery: (query: string) => void
  executeSearch: () => void
}

export const useMemoryStore = create<MemoryState>()((set, get) => ({
  activeTab: 'notes',

  notes: [],
  searchQuery: '',

  contextHistory: [],
  contextFilter: '',

  handoffHistory: [],
  sessions: [],

  globalSearchQuery: '',
  searchResults: [],

  isLoaded: false,

  setActiveTab: (tab) => set({ activeTab: tab }),

  addNote: (content, agentId, tags = []) => {
    const now = new Date().toISOString()
    const note: MemoryNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content,
      agentId,
      entryType: 'note',
      tags,
      filesReferenced: [],
      createdAt: now,
      updatedAt: now,
    }
    set((state) => ({ notes: [note, ...state.notes] }))
    // Persist via debounced IPC
    queueSave(note)
  },

  updateNote: (id, updates) => {
    set((state) => {
      const updatedNotes = state.notes.map((n) => {
        if (n.id !== id) return n
        const updated = {
          ...n,
          ...updates,
          updatedAt: new Date().toISOString(),
        }
        queueSave(updated)
        return updated
      })
      return { notes: updatedNotes }
    })
  },

  deleteNote: (id) => {
    set((state) => ({
      notes: state.notes.filter((n) => n.id !== id),
    }))
    invoke('delete_memory', { id }).catch((e) =>
      console.error('Failed to delete memory entry:', e)
    )
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  getFilteredNotes: () => {
    const { notes, searchQuery } = get()
    if (!searchQuery) return notes
    const lower = searchQuery.toLowerCase()
    return notes.filter(
      (n) =>
        n.content.toLowerCase().includes(lower) ||
        n.tags.some((t) => t.toLowerCase().includes(lower))
    )
  },

  addContextEntry: (entry) => {
    const now = new Date().toISOString()
    const ctx: ContextEntry = {
      ...entry,
      id: `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: now,
    }
    set((state) => ({
      contextHistory: [ctx, ...state.contextHistory].slice(0, 200),
    }))
    // Persist as a memory entry
    const memEntry: MemoryNote = {
      id: ctx.id,
      content: ctx.content,
      agentId: ctx.agentId,
      entryType: ctx.entryType,
      tags: [],
      summary: ctx.summary,
      filesReferenced: ctx.filesReferenced,
      createdAt: now,
      updatedAt: now,
    }
    queueSave(memEntry)
  },

  setContextFilter: (filter) => set({ contextFilter: filter }),

  clearContextHistory: () => set({ contextHistory: [] }),

  compileHandoff: async (sourceAgentId, targetAgentId) => {
    try {
      const handoff = await invoke<HandoffPack>('compile_handoff', {
        sourceAgentId,
        targetAgentId,
      })
      set((state) => ({
        handoffHistory: [handoff, ...state.handoffHistory],
      }))
      return handoff
    } catch (e) {
      console.error('Failed to compile handoff:', e)
      return null
    }
  },

  loadHandoffs: async () => {
    try {
      const handoffs = await invoke<HandoffPack[]>('list_handoffs', { limit: 50 })
      set({ handoffHistory: handoffs })
    } catch (e) {
      console.error('Failed to load handoffs:', e)
    }
  },

  loadSessions: async () => {
    try {
      const sessions = await invoke<SessionInfo[]>('list_memory_sessions', { limit: 50 })
      set({ sessions })
    } catch (e) {
      console.error('Failed to load sessions:', e)
    }
  },

  loadFromBackend: async () => {
    try {
      // Load notes (entry_type = 'note')
      const noteEntries = await invoke<MemoryNote[]>('query_memory', {
        query: { entryType: 'note', limit: 200 },
      })
      // Load context entries (non-note types)
      const ctxEntries = await invoke<MemoryNote[]>('query_memory', {
        query: { limit: 200 },
      })

      const notes = noteEntries.filter((e) => e.entryType === 'note')
      const context: ContextEntry[] = ctxEntries
        .filter((e) => e.entryType !== 'note')
        .map((e) => ({
          id: e.id,
          agentId: e.agentId || 'unknown',
          entryType: e.entryType as ContextEntry['entryType'],
          content: e.content,
          summary: e.summary,
          filesReferenced: e.filesReferenced,
          createdAt: e.createdAt,
        }))

      set({
        notes,
        contextHistory: context,
        isLoaded: true,
      })
    } catch (e) {
      // Backend not available (e.g., running in browser dev mode)
      console.warn('Memory backend not available, using in-memory store:', e)
      set({ isLoaded: true })
    }
  },

  setGlobalSearchQuery: (query) => {
    set({ globalSearchQuery: query })
    if (query.trim()) {
      get().executeSearch()
    }
  },

  executeSearch: async () => {
    const { globalSearchQuery } = get()
    const q = globalSearchQuery.trim()
    if (!q) {
      set({ searchResults: [] })
      return
    }

    try {
      // Use FTS5 search via Tauri IPC
      const results = await invoke<Array<{ entry: MemoryNote; rank: number; snippet: string }>>(
        'search_memory',
        { query: q, limit: 20 }
      )

      const searchResults = results.map((r) => ({
        type: (r.entry.entryType === 'note' ? 'note' : 'context') as 'note' | 'context',
        item: r.entry,
      }))

      set({ searchResults })
    } catch (e) {
      // Fallback to in-memory search if FTS5 unavailable
      console.warn('FTS5 search unavailable, using fallback:', e)
      const { notes, contextHistory } = get()
      const lower = q.toLowerCase()

      const noteResults = notes
        .filter(
          (n) =>
            n.content.toLowerCase().includes(lower) ||
            n.tags.some((t) => t.toLowerCase().includes(lower))
        )
        .map((item) => ({ type: 'note' as const, item }))

      const contextResults = contextHistory
        .filter(
          (c) =>
            c.content.toLowerCase().includes(lower) ||
            (c.summary && c.summary.toLowerCase().includes(lower)) ||
            c.entryType.toLowerCase().includes(lower)
        )
        .map((item) => ({ type: 'context' as const, item }))

      set({ searchResults: [...noteResults, ...contextResults] })
    }
  },
}))
