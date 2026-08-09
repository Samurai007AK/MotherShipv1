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

export type MemoryTab = 'notes' | 'context' | 'timeline' | 'search' | 'storage' | 'models' | 'warroom' | 'graph' | 'browser' | 'mcp' | 'execution' | 'performance' | 'reconsolidation'

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

  // Cold storage
  archivedSessions: ArchivedSessionInfo[]
  loadArchivedSessions: () => Promise<void>
  archiveOldSessions: (maxAgeHours: number) => Promise<number>
  pruneOldSnapshots: (maxAgeDays: number, minKeep: number) => Promise<number>
  restoreArchivedSession: (agentId: string, sessionId: string) => Promise<number>

  // Episode Memory (Auto-Captured Tier)
  episodeEntries: EpisodeEntry[]
  episodeCount: number
  promotedCount: number
  reconsolidationFlags: ReconsolidationFlag[]
  saveEpisode: (
    agentId: string,
    trigger: string,
    content: string,
    source: string,
    metadata?: Record<string, unknown>
  ) => Promise<ReconsolidationFlag[]>
  queryEpisodes: (filter?: {
    agentId?: string
    trigger?: string
    source?: string
    limit?: number
  }) => Promise<void>
  deleteEpisode: (id: string) => Promise<void>
  promoteEpisode: (episodeId: string) => Promise<void>
  pruneExpiredEpisodes: () => Promise<void>
  loadEpisodeStats: () => Promise<void>
  loadReconsolidationFlags: (status?: string) => Promise<void>
  resolveFlag: (flagId: string, resolution: 'resolved' | 'dismissed') => Promise<void>

  // Search
  setGlobalSearchQuery: (query: string) => void
  executeSearch: () => void
}

// --- Episode Memory (Auto-Captured Tier) ---

export interface EpisodeEntry {
  id: string
  agent_id?: string
  trigger: string
  content: string
  summary?: string
  source: string
  metadata: string
  created_at: string
  expires_at?: string
  is_promoted: boolean
}

// --- Reconsolidation ---

export interface ReconsolidationFlag {
  id: string
  episode_id: string
  note_id: string
  description: string
  confidence: number
  status: 'open' | 'resolved' | 'dismissed'
  created_at: string
  resolved_at?: string
}

export interface ArchivedSessionInfo {
  session_id: string
  agent_id: string
  file_path: string
  size_bytes: number
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
  archivedSessions: [],

  // Episode memory
  episodeEntries: [],
  episodeCount: 0,
  promotedCount: 0,
  reconsolidationFlags: [],

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

  // Cold storage actions
  loadArchivedSessions: async () => {
    try {
      const sessions = await invoke<ArchivedSessionInfo[]>('list_archived_sessions')
      set({ archivedSessions: sessions })
    } catch (e) {
      console.error('Failed to load archived sessions:', e)
    }
  },

  archiveOldSessions: async (maxAgeHours) => {
    try {
      const count = await invoke<number>('archive_old_sessions', { maxAgeHours })
      await get().loadArchivedSessions()
      return count
    } catch (e) {
      console.error('Failed to archive old sessions:', e)
      return 0
    }
  },

  pruneOldSnapshots: async (maxAgeDays, minKeep) => {
    try {
      const count = await invoke<number>('prune_old_snapshots', { maxAgeDays, minKeep })
      return count
    } catch (e) {
      console.error('Failed to prune old snapshots:', e)
      return 0
    }
  },

  restoreArchivedSession: async (agentId, sessionId) => {
    try {
      const count = await invoke<number>('restore_archived_session', { agentId, sessionId })
      await get().loadArchivedSessions()
      return count
    } catch (e) {
      console.error('Failed to restore archived session:', e)
      return 0
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

  // ── Episode Memory (Auto-Captured Tier) ──────────────────────────────

  saveEpisode: async (agentId, trigger, content, source, metadata) => {
    try {
      const episode: EpisodeEntry = {
        id: `ep-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        agent_id: agentId,
        trigger,
        content,
        source,
        metadata: JSON.stringify(metadata || {}),
        created_at: new Date().toISOString(),
        is_promoted: false,
      }
      const flags = await invoke<ReconsolidationFlag[]>('save_episode_memory', {
        episode,
      })
      set((state) => ({
        episodeEntries: [episode, ...state.episodeEntries].slice(0, 200),
        episodeCount: state.episodeCount + 1,
        reconsolidationFlags: [...flags, ...state.reconsolidationFlags],
      }))
      return flags
    } catch (e) {
      console.error('Failed to save episode:', e)
      return []
    }
  },

  queryEpisodes: async (filter) => {
    try {
      const episodes = await invoke<EpisodeEntry[]>('query_episode_memory', {
        agentId: filter?.agentId || null,
        trigger: filter?.trigger || null,
        source: filter?.source || null,
        limit: filter?.limit || 50,
        offset: 0,
      })
      set({ episodeEntries: episodes })
    } catch (e) {
      console.error('Failed to query episodes:', e)
    }
  },

  deleteEpisode: async (id) => {
    try {
      await invoke('delete_episode_memory', { id })
      set((state) => ({
        episodeEntries: state.episodeEntries.filter((e) => e.id !== id),
      }))
    } catch (e) {
      console.error('Failed to delete episode:', e)
    }
  },

  promoteEpisode: async (episodeId) => {
    try {
      await invoke('promote_episode_memory', { episodeId })
      set((state) => ({
        episodeEntries: state.episodeEntries.map((e) =>
          e.id === episodeId ? { ...e, is_promoted: true } : e
        ),
      }))
    } catch (e) {
      console.error('Failed to promote episode:', e)
    }
  },

  pruneExpiredEpisodes: async () => {
    try {
      const count = await invoke<number>('prune_expired_episodes')
      if (count > 0) {
        console.log(`Pruned ${count} expired episodes`)
      }
    } catch (e) {
      console.error('Failed to prune episodes:', e)
    }
  },

  loadEpisodeStats: async () => {
    try {
      const [total, promoted] = await invoke<[number, number]>('get_episode_memory_stats')
      set({ episodeCount: total, promotedCount: promoted })
    } catch (e) {
      console.error('Failed to load episode stats:', e)
    }
  },

  loadReconsolidationFlags: async (status) => {
    try {
      const flags = await invoke<ReconsolidationFlag[]>('list_reconsolidation_flags', {
        status: status || null,
        limit: 50,
      })
      set({ reconsolidationFlags: flags })
    } catch (e) {
      console.error('Failed to load reconsolidation flags:', e)
    }
  },

  resolveFlag: async (flagId, resolution) => {
    try {
      await invoke('resolve_reconsolidation_flag', { flagId, resolution })
      set((state) => ({
        reconsolidationFlags: state.reconsolidationFlags.map((f) =>
          f.id === flagId ? { ...f, status: resolution, resolved_at: new Date().toISOString() } : f
        ),
      }))
    } catch (e) {
      console.error('Failed to resolve flag:', e)
    }
  },
}))
