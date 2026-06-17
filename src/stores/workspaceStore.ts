import { create } from 'zustand'
import { useAgentStore } from './agentStore'

export interface WorkspaceTab {
  agentId: string
  agentName: string
  provider: string
  isActive: boolean
  isConnected: boolean
  lastActivity?: Date
}

/**
 * A split pane within a workspace tab.
 * Each pane runs its own terminal session for the same or different agent.
 */
export interface SplitPaneState {
  id: string
  agentId: string
  agentName: string
  provider: string
  direction: 'horizontal' | 'vertical'
}

interface WorkspaceState {
  tabs: WorkspaceTab[]
  activeTabId: string | null

  // Split pane state (1a.2d)
  splitPanes: Map<string, SplitPaneState[]> // keyed by tab agentId
  activeSplitPaneId: string | null

  addTab: (agentId: string, agentName: string, provider: string) => void
  removeTab: (agentId: string) => void
  setActiveTab: (agentId: string) => void
  setConnected: (agentId: string, connected: boolean) => void

  // Split pane actions (1a.2d)
  addSplitPane: (tabId: string, direction: 'horizontal' | 'vertical') => void
  removeSplitPane: (tabId: string, paneId: string) => void
  setActiveSplitPane: (paneId: string | null) => void
  getSplitPanes: (tabId: string) => SplitPaneState[]
}

let splitPaneCounter = 0

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  tabs: [],
  activeTabId: null,
  splitPanes: new Map(),
  activeSplitPaneId: null,

  addTab: (agentId, agentName, provider) =>
    set((state) => {
      if (state.tabs.find((t) => t.agentId === agentId)) {
        useAgentStore.getState().updateAgentStatus(agentId, 'running')
        return { activeTabId: agentId }
      }
      useAgentStore.getState().updateAgentStatus(agentId, 'running')
      return {
        tabs: [
          ...state.tabs,
          {
            agentId,
            agentName,
            provider,
            isActive: true,
            isConnected: false,
            lastActivity: new Date(),
          },
        ],
        activeTabId: agentId,
      }
    }),

  removeTab: (agentId) =>
    set((state) => {
      const newTabs = state.tabs.filter((t) => t.agentId !== agentId)
      useAgentStore.getState().updateAgentStatus(agentId, 'idle')
      // Clean up split panes for this tab
      const newSplitPanes = new Map(state.splitPanes)
      newSplitPanes.delete(agentId)
      return {
        tabs: newTabs,
        splitPanes: newSplitPanes,
        activeTabId:
          state.activeTabId === agentId
            ? newTabs.length > 0
              ? newTabs[newTabs.length - 1].agentId
              : null
            : state.activeTabId,
      }
    }),

  setActiveTab: (agentId) => set({ activeTabId: agentId }),

  setConnected: (agentId, connected) =>
    set((state) => {
      useAgentStore.getState().updateAgentStatus(
        agentId,
        connected ? 'running' : 'idle'
      )
      return {
        tabs: state.tabs.map((t) =>
          t.agentId === agentId ? { ...t, isConnected: connected } : t
        ),
      }
    }),

  // --- Split pane actions (1a.2d) ---

  addSplitPane: (tabId, direction) =>
    set((state) => {
      const tab = state.tabs.find((t) => t.agentId === tabId)
      if (!tab) return state

      const newSplitPanes = new Map(state.splitPanes)
      const existing = newSplitPanes.get(tabId) || []

      // Max 4 panes per tab to keep things manageable
      if (existing.length >= 3) return state

      splitPaneCounter++
      const newPane: SplitPaneState = {
        id: `split-${tabId}-${splitPaneCounter}`,
        agentId: tab.agentId,
        agentName: tab.agentName,
        provider: tab.provider,
        direction,
      }

      newSplitPanes.set(tabId, [...existing, newPane])

      return {
        splitPanes: newSplitPanes,
        activeSplitPaneId: newPane.id,
      }
    }),

  removeSplitPane: (tabId, paneId) =>
    set((state) => {
      const newSplitPanes = new Map(state.splitPanes)
      const existing = newSplitPanes.get(tabId) || []
      const filtered = existing.filter((p) => p.id !== paneId)

      if (filtered.length === 0) {
        newSplitPanes.delete(tabId)
      } else {
        newSplitPanes.set(tabId, filtered)
      }

      return {
        splitPanes: newSplitPanes,
        activeSplitPaneId:
          state.activeSplitPaneId === paneId
            ? filtered.length > 0
              ? filtered[filtered.length - 1].id
              : null
            : state.activeSplitPaneId,
      }
    }),

  setActiveSplitPane: (paneId) => set({ activeSplitPaneId: paneId }),

  getSplitPanes: (tabId) => {
    return get().splitPanes.get(tabId) || []
  },
}))
