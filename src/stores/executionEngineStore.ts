import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentExecutionStatus = 'pending' | 'spawning' | 'running' | 'completed' | 'error'
export type ExecutionGroupStatus = 'pending' | 'spawning' | 'running' | 'completed' | 'error'

export interface SharedContextEntry {
  source: string
  content: string
  created_at: string
}

export interface ExecutionAgent {
  agent_id: string
  prompt: string
  status: AgentExecutionStatus
  output: string
  error?: string
  session_id?: string
  started_at?: string
  completed_at?: string
}

export interface ExecutionGroup {
  id: string
  name: string
  status: ExecutionGroupStatus
  agents: ExecutionAgent[]
  shared_context: SharedContextEntry[]
  created_at: string
  completed_at?: string
}

export interface ExecutionAgentConfig {
  agent_id: string
  prompt: string
}

export interface ExecutionGroupConfig {
  name: string
  agents: ExecutionAgentConfig[]
  initial_context?: string
}

export interface AgentResult {
  agent_id: string
  status: AgentExecutionStatus
  output: string
  error?: string
  duration_ms: number
}

export interface ExecutionResult {
  group_id: string
  status: ExecutionGroupStatus
  agent_results: AgentResult[]
  total_duration_ms: number
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface ExecutionEngineState {
  groups: ExecutionGroup[]
  activeGroupId: string | null
  isPolling: boolean

  // Actions
  startGroup: (config: ExecutionGroupConfig) => Promise<string | null>
  getGroup: (groupId: string) => Promise<void>
  listGroups: () => Promise<void>
  cancelGroup: (groupId: string) => Promise<void>
  addContext: (groupId: string, source: string, content: string) => Promise<void>
  setActiveGroup: (groupId: string | null) => void
  startPolling: () => void
  stopPolling: () => void
  clearCompleted: () => void
}

export const useExecutionEngineStore = create<ExecutionEngineState>()((set, get) => ({
  groups: [],
  activeGroupId: null,
  isPolling: false,

  startGroup: async (config) => {
    try {
      const groupId = await invoke<string>('start_execution_group', { config })
      // Add a local group entry immediately
      const now = new Date().toISOString()
      const group: ExecutionGroup = {
        id: groupId,
        name: config.name,
        status: 'spawning',
        agents: config.agents.map((a) => ({
          agent_id: a.agent_id,
          prompt: a.prompt,
          status: 'pending',
          output: '',
        })),
        shared_context: config.initial_context
          ? [{ source: 'system', content: config.initial_context, created_at: now }]
          : [],
        created_at: now,
      }
      set((state) => ({
        groups: [group, ...state.groups],
        activeGroupId: groupId,
      }))
      // Start polling to get updates
      get().startPolling()
      return groupId
    } catch (e) {
      console.error('Failed to start execution group:', e)
      return null
    }
  },

  getGroup: async (groupId) => {
    try {
      const group = await invoke<ExecutionGroup | null>('get_execution_group', { groupId })
      if (group) {
        set((state) => ({
          groups: state.groups.map((g) => (g.id === groupId ? group : g)),
        }))
      }
    } catch (e) {
      console.error('Failed to get execution group:', e)
    }
  },

  listGroups: async () => {
    try {
      const groups = await invoke<ExecutionGroup[]>('list_execution_groups')
      set({ groups })
    } catch (e) {
      console.error('Failed to list execution groups:', e)
    }
  },

  cancelGroup: async (groupId) => {
    try {
      await invoke('cancel_execution_group', { groupId })
    } catch (e) {
      console.error('Failed to cancel execution group:', e)
    }
  },

  addContext: async (groupId, source, content) => {
    try {
      await invoke('add_execution_context', { groupId, source, content })
    } catch (e) {
      console.error('Failed to add execution context:', e)
    }
  },

  setActiveGroup: (groupId) => set({ activeGroupId: groupId }),

  startPolling: () => {
    if (get().isPolling) return
    set({ isPolling: true })

    const poll = async () => {
      if (!get().isPolling) return

      // Poll all groups that are still running
      const { groups } = get()
      const runningGroups = groups.filter((g) =>
        ['spawning', 'running'].includes(g.status)
      )

      if (runningGroups.length === 0) {
        // No running groups, stop polling
        set({ isPolling: false })
        return
      }

      // Fetch latest state for each running group
      for (const g of runningGroups) {
        await get().getGroup(g.id)
      }

      // Check if all are done now
      const updated = get().groups
      const stillRunning = updated.filter((g) =>
        ['spawning', 'running'].includes(g.status)
      )
      if (stillRunning.length === 0) {
        set({ isPolling: false })
        return
      }

      // Poll again after delay
      setTimeout(poll, 1000)
    }

    setTimeout(poll, 500)
  },

  stopPolling: () => set({ isPolling: false }),

  clearCompleted: () => {
    set((state) => ({
      groups: state.groups.filter((g) =>
        ['spawning', 'running'].includes(g.status)
      ),
      activeGroupId: state.activeGroupId,
    }))
  },
}))
