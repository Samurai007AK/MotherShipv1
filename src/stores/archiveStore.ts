import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

// --- Types matching PLANS/MOTHERSHIP-RALPH-GLOSSARY.md ---

export interface ArchiveManifest {
  id: string
  projectId: string
  branchName: string
  featureName: string
  createdAt: Date
  archivedAt: Date
  status: 'InProgress' | 'Completed' | 'Failed' | 'Cancelled'
  iterationCount: number
  tasksCompleted: number
  tasksTotal: number
  durationMs: number
  filesArchived: string[]
  tags: string[]
}

export interface ArchiveEntry {
  id: string
  manifest: ArchiveManifest
  path: string
  sizeKb: number
}

export interface ArchiveDiff {
  tasksAdded: { id: string; title: string }[]
  tasksRemoved: { id: string; title: string }[]
  tasksCompleted: { id: string; title: string }[]
  iterationsAdded: { iteration: number; taskId: string; action: string }[]
  filesModified: string[]
}

// --- Store ---

interface ArchiveState {
  archives: ArchiveEntry[]
  selectedArchiveId: string | null
  isLoading: boolean
  branchChanged: boolean

  loadArchives: () => Promise<void>
  selectArchive: (id: string | null) => void
  archiveSession: () => Promise<void>
  restoreArchive: (id: string) => Promise<void>
  deleteArchive: (id: string) => Promise<void>
  checkBranchChange: () => Promise<boolean>
  getArchiveDiff: (id: string) => Promise<ArchiveDiff | null>
}

export const useArchiveStore = create<ArchiveState>()((set, get) => ({
  archives: [],
  selectedArchiveId: null,
  isLoading: false,
  branchChanged: false,

  loadArchives: async () => {
    set({ isLoading: true })
    try {
      const archives = await invoke<ArchiveEntry[]>('list_archives')
      set({ archives, isLoading: false })
    } catch (e) {
      console.error('Failed to load archives:', e)
      set({ isLoading: false })
    }
  },

  selectArchive: (id) => set({ selectedArchiveId: id }),

  archiveSession: async () => {
    set({ isLoading: true })
    try {
      await invoke('archive_current_session')
      await get().loadArchives()
    } catch (e) {
      console.error('Failed to archive session:', e)
      set({ isLoading: false })
    }
  },

  restoreArchive: async (id) => {
    set({ isLoading: true })
    try {
      await invoke('restore_archive', { archiveId: id })
      set({ isLoading: false })
    } catch (e) {
      console.error('Failed to restore archive:', e)
      set({ isLoading: false })
    }
  },

  deleteArchive: async (id) => {
    set({ isLoading: true })
    try {
      await invoke('delete_archive', { archiveId: id })
      set((state) => ({
        archives: state.archives.filter((a) => a.id !== id),
        isLoading: false,
      }))
    } catch (e) {
      console.error('Failed to delete archive:', e)
      set({ isLoading: false })
    }
  },

  checkBranchChange: async () => {
    try {
      const changed = await invoke<boolean>('check_branch_change')
      set({ branchChanged: changed })
      return changed
    } catch (e) {
      console.error('Failed to check branch change:', e)
      return false
    }
  },

  getArchiveDiff: async (id) => {
    try {
      return await invoke<ArchiveDiff>('get_archive_diff', { archiveId: id })
    } catch (e) {
      console.error('Failed to get archive diff:', e)
      return null
    }
  },
}))
