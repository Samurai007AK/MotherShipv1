import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { useMemoryStore } from './memoryStore'
import { useWorkspaceStore } from './workspaceStore'

// ── Types ────────────────────────────────────────────────────────────────

export interface WorktreeInfo {
  id: string
  branchName: string
  worktreePath: string
  projectRoot: string
  status: string
  agentId: string | null
  createdAt: string
  aheadBehind: string | null
  hasUncommitted: boolean
  commitsAhead: number
  commitsBehind: number
}

export interface ChangedFile {
  path: string
  status: string
  insertions: number
  deletions: number
}

export interface WorktreeDiff {
  branchName: string
  diffText: string
  filesChanged: number
  insertions: number
  deletions: number
  changedFiles: ChangedFile[]
}

export interface ProjectGitInfo {
  rootPath: string
  currentBranch: string
  hasRemotes: boolean
  remoteName: string | null
  hasUncommitted: boolean
}

export interface CreateWorktreeResult {
  success: boolean
  workspace: WorktreeInfo | null
  error: string | null
}

/** Old/new file content for the diff viewer */
export interface FileContentPair {
  path: string
  status: string
  old_content: string
  new_content: string
  insertions: number
  deletions: number
  language: string
}

/** A single workspace preset definition */
export interface PresetDefinition {
  name: string
  description?: string
  base_branch?: string
  setup: string[]
  teardown: string[]
  run: string[]
  env?: Record<string, string>
  agent_id?: string
}

/** The full workspace preset configuration from .mothership/config.json */
export interface WorkspacePresetConfig {
  setup: string[]
  teardown: string[]
  presets: PresetDefinition[]
}

/** Result of running a lifecycle command */
export interface LifecycleResult {
  success: boolean
  stdout: string
  stderr: string
  exit_code: number
}

/** A port allocation for a worktree service */
export interface PortAllocation {
  port: number
  service: string
  worktree_id: string
  allocated_at: string
}

// ── Store ────────────────────────────────────────────────────────────────

interface WorktreeState {
  worktrees: WorktreeInfo[]
  activeWorktreeId: string | null
  isInitialized: boolean
  projectInfo: ProjectGitInfo | null
  isGitAvailable: boolean
  workspaceView: 'terminal' | 'worktrees' | 'editor' | 'editor'
  worktreeDiffCache: Map<string, WorktreeDiff>

  // Project detection
  detectProject: (path?: string) => Promise<ProjectGitInfo | null>

  // CRUD
  createWorktree: (projectPath: string, taskName: string, baseBranch?: string, agentId?: string) => Promise<CreateWorktreeResult>
  listWorktrees: (projectPath: string) => Promise<void>
  deleteWorktree: (worktreePath: string, deleteBranch?: boolean) => Promise<void>
  syncWorktree: (worktreePath: string, baseBranch?: string) => Promise<string>
  commitWorktreeChanges: (worktreePath: string, message: string) => Promise<string>
  pushWorktreeBranch: (worktreePath: string) => Promise<string>

  // Preset config
  presetConfig: WorkspacePresetConfig
  readPresetConfig: (projectPath: string) => Promise<WorkspacePresetConfig>
  savePresetConfig: (projectPath: string, config: WorkspacePresetConfig) => Promise<void>
  runPresetSetup: (worktreePath: string, setupCommands: string[], env?: Record<string, string>) => Promise<LifecycleResult>
  runPresetTeardown: (worktreePath: string, teardownCommands: string[], env?: Record<string, string>) => Promise<LifecycleResult>

  // Status & diff
  getWorktreeStatus: (worktreePath: string) => Promise<WorktreeInfo>
  getWorktreeDiff: (worktreePath: string, forceRefresh?: boolean) => Promise<WorktreeDiff>
  getWorktreeFileDiffs: (worktreePath: string) => Promise<FileContentPair[]>

  // Selection
  setActiveWorktree: (id: string | null) => void

  // View toggle
  setWorkspaceView: (view: 'terminal' | 'worktrees' | 'editor') => void

  // Terminal integration — spawn a terminal in a worktree directory
  openWorktreeTerminal: (worktree: WorktreeInfo) => Promise<void>

  // Port isolation
  worktreePorts: Map<string, PortAllocation[]>
  allocatePort: (projectPath: string, worktreeId: string, service: string) => Promise<PortAllocation>
  listWorktreePorts: (projectPath: string, worktreeId: string) => Promise<PortAllocation[]>
  releaseWorktreePort: (projectPath: string, worktreeId: string, service: string) => Promise<void>
  releaseAllWorktreePorts: (projectPath: string, worktreeId: string) => Promise<void>

  // Memory integration
  addWorktreeNote: (worktreeId: string, content: string) => void
  /** Get persistent worktree notes from the global memory store */
  getWorktreeNotes: (worktreeId: string) => Array<{ id: string; content: string; createdAt: string }>
}

export const useWorktreeStore = create<WorktreeState>()((set, get) => ({
  worktrees: [],
  activeWorktreeId: null,
  isInitialized: false,
  projectInfo: null,
  isGitAvailable: false,
  workspaceView: 'terminal',
  worktreeDiffCache: new Map(),
  presetConfig: { setup: [], teardown: [], presets: [] },

  detectProject: async (path) => {
    try {
      const info = await invoke<ProjectGitInfo>('detect_git_project', { path: path || '.' })
      set({ projectInfo: info, isGitAvailable: true, isInitialized: true })
      return info
    } catch (e) {
      set({ projectInfo: null, isGitAvailable: false, isInitialized: true })
      console.warn('Git project detection failed:', e)
      return null
    }
  },

  createWorktree: async (projectPath, taskName, baseBranch, agentId) => {
    try {
      const result = await invoke<CreateWorktreeResult>('create_worktree_workspace', {
        projectPath,
        taskName,
        baseBranch: baseBranch || null,
        agentId: agentId || null,
      })

      if (result.success && result.workspace) {
        set((state) => ({
          worktrees: [result.workspace!, ...state.worktrees],
          activeWorktreeId: result.workspace!.id,
        }))

        // Record the creation in shared memory
        const memoryStore = useMemoryStore.getState()
        memoryStore.addNote(
          `Created worktree workspace "${taskName}" on branch ${result.workspace.branchName}`,
          agentId || undefined,
          ['worktree', 'workspace-created']
        )

        // Create a context entry for this worktree
        memoryStore.addContextEntry({
          agentId: agentId || 'system',
          entryType: 'summary',
          content: `Worktree workspace created: ${taskName} (branch: ${result.workspace.branchName}, path: ${result.workspace.worktreePath})`,
          filesReferenced: [],
        })
      }

      return result
    } catch (e) {
      return { success: false, workspace: null, error: String(e) }
    }
  },

  listWorktrees: async (projectPath) => {
    try {
      const worktrees = await invoke<WorktreeInfo[]>('list_worktree_workspaces', { projectPath })
      set({ worktrees })
    } catch (e) {
      console.error('Failed to list worktrees:', e)
    }
  },

  deleteWorktree: async (worktreePath, deleteBranch) => {
    try {
      // Release all ports before deleting
      const wt = get().worktrees.find((w) => w.worktreePath === worktreePath)
      if (wt) {
        await get().releaseAllWorktreePorts(wt.projectRoot, wt.id)
      }

      await invoke('delete_worktree_workspace', { worktreePath, deleteBranch: deleteBranch || false })
      set((state) => ({
        worktrees: state.worktrees.filter((w) => w.worktreePath !== worktreePath),
        activeWorktreeId:
          state.activeWorktreeId === state.worktrees.find((w) => w.worktreePath === worktreePath)?.id
            ? null
            : state.activeWorktreeId,
      }))
    } catch (e) {
      console.error('Failed to delete worktree:', e)
    }
  },

  syncWorktree: async (worktreePath, baseBranch) => {
    try {
      const result = await invoke<string>('sync_worktree_workspace', {
        worktreePath,
        baseBranch: baseBranch || null,
      })
      // Refresh the worktree list after sync
      const projectPath = worktreePath
      get().listWorktrees(projectPath)
      return result
    } catch (e) {
      throw new Error(String(e))
    }
  },

  commitWorktreeChanges: async (worktreePath, message) => {
    try {
      const result = await invoke<string>('commit_worktree_changes', {
        worktreePath,
        message,
      })

      // Record the commit in shared memory
      const memoryStore = useMemoryStore.getState()
      memoryStore.addNote(`Committed changes in worktree: ${message}`, undefined, [
        'worktree',
        'commit',
      ])

      // Refresh
      const projectPath = worktreePath
      get().listWorktrees(projectPath)

      return result
    } catch (e) {
      throw new Error(String(e))
    }
  },

  pushWorktreeBranch: async (worktreePath) => {
    try {
      const result = await invoke<string>('push_worktree_branch', { worktreePath })
      const memoryStore = useMemoryStore.getState()
      memoryStore.addNote(result, undefined, ['worktree', 'push'])
      return result
    } catch (e) {
      throw new Error(String(e))
    }
  },

  getWorktreeStatus: async (worktreePath) => {
    try {
      const info = await invoke<WorktreeInfo>('get_worktree_status', { worktreePath })
      // Update in the list
      set((state) => ({
        worktrees: state.worktrees.map((w) =>
          w.worktreePath === worktreePath ? info : w
        ),
      }))
      return info
    } catch (e) {
      throw new Error(String(e))
    }
  },

  getWorktreeDiff: async (worktreePath, forceRefresh) => {
    try {
      const cached = get().worktreeDiffCache.get(worktreePath)
      if (cached && !forceRefresh) return cached

      const diff = await invoke<WorktreeDiff>('get_worktree_diff', { worktreePath })
      set((state) => {
        const newCache = new Map(state.worktreeDiffCache)
        newCache.set(worktreePath, diff)
        return { worktreeDiffCache: newCache }
      })
      return diff
    } catch (e) {
      throw new Error(String(e))
    }
  },

  readPresetConfig: async (projectPath) => {
    try {
      const config = await invoke<WorkspacePresetConfig>('read_preset_config', { projectPath })
      set({ presetConfig: config })
      return config
    } catch (e) {
      console.error('Failed to read preset config:', e)
      set({ presetConfig: { setup: [], teardown: [], presets: [] } })
      return { setup: [], teardown: [], presets: [] }
    }
  },

  savePresetConfig: async (projectPath, config) => {
    try {
      await invoke('save_preset_config', { projectPath, config })
      set({ presetConfig: config })
    } catch (e) {
      console.error('Failed to save preset config:', e)
      throw new Error(String(e))
    }
  },

  runPresetSetup: async (worktreePath, setupCommands, env) => {
    try {
      const result = await invoke<LifecycleResult>('run_preset_setup', {
        worktreePath,
        setupCommands,
        env: env || null,
      })
      // Record the setup run in shared memory
      const memoryStore = useMemoryStore.getState()
      if (result.success) {
        memoryStore.addNote(
          `Preset setup completed in worktree: ${result.stdout.slice(0, 200)}`,
          undefined,
          ['worktree', 'preset', 'setup']
        )
      }
      return result
    } catch (e) {
      throw new Error(String(e))
    }
  },

  runPresetTeardown: async (worktreePath, teardownCommands, env) => {
    try {
      const result = await invoke<LifecycleResult>('run_preset_teardown', {
        worktreePath,
        teardownCommands,
        env: env || null,
      })
      // Record the teardown
      const memoryStore = useMemoryStore.getState()
      memoryStore.addNote(
        `Preset teardown: ${result.success ? 'completed' : 'failed'} — ${result.stderr.slice(0, 200)}`,
        undefined,
        ['worktree', 'preset', 'teardown']
      )
      return result
    } catch (e) {
      throw new Error(String(e))
    }
  },

  getWorktreeFileDiffs: async (worktreePath) => {
    try {
      const diffs = await invoke<FileContentPair[]>('get_worktree_file_diffs', { worktreePath })
      return diffs
    } catch (e) {
      console.error('Failed to get file diffs:', e)
      throw new Error(String(e))
    }
  },

  setActiveWorktree: (id) => set({ activeWorktreeId: id }),

  setWorkspaceView: (view) => set({ workspaceView: view }),

  // ── Port isolation ─────────────────────────────────────────────────

  worktreePorts: new Map(),

  allocatePort: async (projectPath, worktreeId, service) => {
    try {
      const allocation = await invoke<PortAllocation>('allocate_worktree_port', {
        projectPath,
        worktreeId,
        service,
      })
      set((state) => {
        const newPorts = new Map(state.worktreePorts)
        const existing = newPorts.get(worktreeId) || []
        newPorts.set(worktreeId, [...existing, allocation])
        return { worktreePorts: newPorts }
      })
      return allocation
    } catch (e) {
      console.error('Failed to allocate port:', e)
      throw new Error(String(e))
    }
  },

  listWorktreePorts: async (projectPath, worktreeId) => {
    try {
      const ports = await invoke<PortAllocation[]>('list_worktree_ports', {
        projectPath,
        worktreeId,
      })
      set((state) => {
        const newPorts = new Map(state.worktreePorts)
        newPorts.set(worktreeId, ports)
        return { worktreePorts: newPorts }
      })
      return ports
    } catch (e) {
      console.error('Failed to list worktree ports:', e)
      throw new Error(String(e))
    }
  },

  releaseWorktreePort: async (projectPath, worktreeId, service) => {
    try {
      await invoke('release_worktree_port', {
        projectPath,
        worktreeId,
        service,
      })
      set((state) => {
        const newPorts = new Map(state.worktreePorts)
        const existing = newPorts.get(worktreeId) || []
        newPorts.set(worktreeId, existing.filter((p) => p.service !== service))
        if (newPorts.get(worktreeId)?.length === 0) newPorts.delete(worktreeId)
        return { worktreePorts: newPorts }
      })
    } catch (e) {
      console.error('Failed to release port:', e)
    }
  },

  releaseAllWorktreePorts: async (projectPath, worktreeId) => {
    try {
      await invoke('release_all_worktree_ports', {
        projectPath,
        worktreeId,
      })
      set((state) => {
        const newPorts = new Map(state.worktreePorts)
        newPorts.delete(worktreeId)
        return { worktreePorts: newPorts }
      })
    } catch (e) {
      console.error('Failed to release all worktree ports:', e)
    }
  },

  openWorktreeTerminal: async (worktree) => {
    // Switch to terminal view
    set({ workspaceView: 'terminal' })

    // Use the agent assigned to this worktree, or default to first agent
    const agentId = worktree.agentId || 'claude'

    // Set the working directory to the worktree path and spawn a terminal
    const workspaceStore = useWorkspaceStore.getState()
    workspaceStore.addTab(agentId, agentId, 'claude', worktree.worktreePath)

    // Record the terminal open in memory
    const memoryStore = useMemoryStore.getState()
    memoryStore.addContextEntry({
      agentId,
      entryType: 'summary',
      content: `Opened terminal in worktree workspace ${worktree.branchName} (${worktree.worktreePath})`,
      filesReferenced: [],
    })
  },

  addWorktreeNote: (worktreeId, content) => {
    // Save only to the persistent global memory store (not an ephemeral local Map)
    const memoryStore = useMemoryStore.getState()
    const wt = get().worktrees.find((w) => w.id === worktreeId)
    memoryStore.addNote(
      `[${wt?.branchName || worktreeId}] ${content}`,
      wt?.agentId || undefined,
      ['worktree', `wt-${worktreeId}`]
    )
  },

  getWorktreeNotes: (worktreeId) => {
    // Read notes from the persistent memory store, filtered by worktree tag
    const memoryStore = useMemoryStore.getState()
    return memoryStore.notes
      .filter((n) => n.tags.includes(`wt-${worktreeId}`))
      .map((n) => ({
        id: n.id,
        content: n.content,
        createdAt: n.createdAt,
      }))
      .slice(0, 50)
  },
}))

// Helper to get the worktree for a given path
export function getWorktreeForPath(worktreePath: string): WorktreeInfo | undefined {
  return useWorktreeStore.getState().worktrees.find((w) => w.worktreePath === worktreePath)
}
