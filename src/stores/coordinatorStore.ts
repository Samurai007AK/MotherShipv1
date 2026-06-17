import { create } from 'zustand'
import { useLoopStore } from './loopStore'
import { useArchiveStore } from './archiveStore'

// --- Cross-store coordination ---

interface CoordinatorState {
  globalStatus: 'idle' | 'working' | 'error'
  lastEvent: string | null
  eventLog: Array<{ timestamp: Date; event: string; source: string }>

  // Cross-store handlers
  handleLoopCompleted: () => Promise<void>
  handleBranchChange: () => Promise<void>
  handleGateFailure: () => Promise<void>
  logEvent: (event: string, source: string) => void
  reset: () => void
}

export const useCoordinatorStore = create<CoordinatorState>()((set, get) => ({
  globalStatus: 'idle',
  lastEvent: null,
  eventLog: [],

  handleLoopCompleted: async () => {
    const loopState = useLoopStore.getState()
    const archiveStore = useArchiveStore.getState()

    get().logEvent('Loop completed', 'loop')

    // Auto-archive if configured
    if (loopState.tasks.every((t) => t.passes)) {
      get().logEvent('All tasks passed, archiving session', 'coordinator')
      await archiveStore.archiveSession()
    }

    set({ globalStatus: 'idle' })
  },

  handleBranchChange: async () => {
    const archiveStore = useArchiveStore.getState()

    get().logEvent('Branch change detected', 'archive')

    // Archive current session before switching
    await archiveStore.archiveSession()

    // Reset loop state for new branch
    useLoopStore.getState().reset()

    get().logEvent('Session archived, loop reset for new branch', 'coordinator')
  },

  handleGateFailure: async () => {
    get().logEvent('Quality gate failed, pausing loop', 'quality-gate')
    await useLoopStore.getState().pauseLoop()
    set({ globalStatus: 'error' })
  },

  logEvent: (event, source) => {
    set((state) => ({
      lastEvent: event,
      eventLog: [
        { timestamp: new Date(), event, source },
        ...state.eventLog,
      ].slice(0, 100),
    }))
  },

  reset: () =>
    set({
      globalStatus: 'idle',
      lastEvent: null,
      eventLog: [],
    }),
}))
