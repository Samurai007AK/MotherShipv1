import { create } from 'zustand'

// ── Pending Change (agent-proposed diff) ────────────────────────────────

export interface PendingChange {
  id: string
  filePath: string
  fileName: string
  oldContent: string
  newContent: string
  summary: string
  agentId?: string
  createdAt: number
  status: 'pending' | 'accepted' | 'rejected'
}

let changeCounter = 0

// ── Open File ────────────────────────────────────────────────────────────

export interface OpenFile {
  path: string
  name: string
  content: string
  originalContent: string
  isDirty: boolean
  language: string
}

/** Map file extensions to CodeMirror language modes */
function detectLanguage(ext: string): string {
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'css',
    json: 'json',
    md: 'markdown',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    sql: 'sql',
    xml: 'html',
    graphql: 'graphql',
    gql: 'graphql',
    dockerfile: 'shell',
    makefile: 'makefile',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    java: 'java',
    rb: 'ruby',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
  }
  return map[ext.toLowerCase()] || 'text'
}

interface EditorState {
  openFiles: OpenFile[]
  activeFilePath: string | null
  pendingChanges: PendingChange[]
  showDiffReview: boolean

  // Actions
  openFile: (path: string, name: string, content: string) => void
  closeFile: (path: string) => void
  setActiveFile: (path: string) => void
  updateContent: (path: string, content: string) => void
  markSaved: (path: string) => void
  getActiveFile: () => OpenFile | undefined

  // Pending change actions
  proposeChange: (filePath: string, fileName: string, oldContent: string, newContent: string, summary?: string, agentId?: string) => string
  acceptChange: (changeId: string) => void
  rejectChange: (changeId: string) => void
  acceptAllPending: () => void
  rejectAllPending: () => void
  setShowDiffReview: (show: boolean) => void
}

export const useEditorStore = create<EditorState>()((set, get) => ({
  openFiles: [],
  activeFilePath: null,
  pendingChanges: [],
  showDiffReview: false,

  openFile: (path, name, content) => {
    const ext = name.split('.').pop() || ''
    const language = detectLanguage(ext)

    set((state) => {
      // If file already open, just activate it
      const existing = state.openFiles.find((f) => f.path === path)
      if (existing) {
        return { activeFilePath: path }
      }

      return {
        openFiles: [
          ...state.openFiles,
          {
            path,
            name,
            content,
            originalContent: content,
            isDirty: false,
            language,
          },
        ],
        activeFilePath: path,
      }
    })
  },

  closeFile: (path) => {
    set((state) => {
      const filtered = state.openFiles.filter((f) => f.path !== path)
      return {
        openFiles: filtered,
        activeFilePath:
          state.activeFilePath === path
            ? filtered.length > 0
              ? filtered[filtered.length - 1].path
              : null
            : state.activeFilePath,
      }
    })
  },

  setActiveFile: (path) => set({ activeFilePath: path }),

  updateContent: (path, content) => {
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === path
          ? { ...f, content, isDirty: content !== f.originalContent }
          : f
      ),
    }))
  },

  markSaved: (path) => {
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === path
          ? { ...f, originalContent: f.content, isDirty: false }
          : f
      ),
    }))
  },

  getActiveFile: () => {
    const state = get()
    return state.openFiles.find((f) => f.path === state.activeFilePath)
  },

  // ── Pending Changes ────────────────────────────────────────────────────

  proposeChange: (filePath, fileName, oldContent, newContent, summary, agentId) => {
    changeCounter++
    const id = `change-${changeCounter}`
    const change: PendingChange = {
      id,
      filePath,
      fileName,
      oldContent,
      newContent,
      summary: summary || `Edit ${fileName}`,
      agentId,
      createdAt: Date.now(),
      status: 'pending',
    }
    set((state) => ({
      pendingChanges: [...state.pendingChanges, change],
      showDiffReview: true,
    }))
    return id
  },

  acceptChange: (changeId) => {
    set((state) => {
      const change = state.pendingChanges.find((c) => c.id === changeId)
      if (!change || change.status !== 'pending') return state

      // Update the open file content if it's open
      const updatedFiles = state.openFiles.map((f) =>
        f.path === change.filePath
          ? { ...f, content: change.newContent, isDirty: true }
          : f
      )

      return {
        pendingChanges: state.pendingChanges.map((c) =>
          c.id === changeId ? { ...c, status: 'accepted' as const } : c
        ),
        openFiles: updatedFiles,
      }
    })
  },

  rejectChange: (changeId) => {
    set((state) => ({
      pendingChanges: state.pendingChanges.map((c) =>
        c.id === changeId ? { ...c, status: 'rejected' as const } : c
      ),
    }))
  },

  acceptAllPending: () => {
    set((state) => {
      let updatedFiles = state.openFiles
      const updatedChanges = state.pendingChanges.map((c) => {
        if (c.status !== 'pending') return c
        // Apply change to open file
        updatedFiles = updatedFiles.map((f) =>
          f.path === c.filePath
            ? { ...f, content: c.newContent, isDirty: true }
            : f
        )
        return { ...c, status: 'accepted' as const }
      })

      return {
        pendingChanges: updatedChanges,
        openFiles: updatedFiles,
        showDiffReview: false,
      }
    })
  },

  rejectAllPending: () => {
    set((state) => ({
      pendingChanges: state.pendingChanges.map((c) =>
        c.status === 'pending' ? { ...c, status: 'rejected' as const } : c
      ),
      showDiffReview: false,
    }))
  },

  setShowDiffReview: (show) => set({ showDiffReview: show }),
}))
