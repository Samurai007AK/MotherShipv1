import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export interface FileEntry {
  path: string
  name: string
  ext: string
  isDir: boolean
  size: number
}

interface FileState {
  files: FileEntry[]
  isLoading: boolean
  lastFetch: number | null
  fetchFiles: () => Promise<void>
  searchFiles: (query: string) => FileEntry[]
}

export const useFileStore = create<FileState>()((set, get) => ({
  files: [],
  isLoading: false,
  lastFetch: null,

  fetchFiles: async () => {
    const { files, lastFetch } = get()
    if (files.length > 0 && lastFetch !== null && Date.now() - lastFetch < 30000) {
      return
    }
    set({ isLoading: true })
    try {
      const files = await invoke<FileEntry[]>('list_project_files')
      set({ files, isLoading: false, lastFetch: Date.now() })
    } catch (e) {
      console.error('Failed to fetch project files:', e)
      set({ isLoading: false })
    }
  },

  searchFiles: (query) => {
    const { files } = get()
    if (!query.trim()) return files.filter((f) => !f.isDir).slice(0, 20)
    const q = query.toLowerCase()
    return files
      .filter(
        (f) =>
          !f.isDir &&
          (f.name.toLowerCase().includes(q) ||
            f.path.toLowerCase().includes(q) ||
            f.ext.toLowerCase().includes(q))
      )
      .slice(0, 20)
  },
}))
