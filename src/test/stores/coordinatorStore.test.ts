import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useCoordinatorStore } from '../../stores/coordinatorStore'

// NOTE: vi.mock factories are hoisted to the top of the file and CANNOT
// reference variables defined with const/let/import. Everything must be
// inlined directly in the factory.

vi.mock('../../stores/loopStore', () => ({
  useLoopStore: {
    getState: vi.fn(() => ({
      tasks: [{ id: 'default', title: 'Default', passes: false }],
      pauseLoop: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn(),
    })),
  },
}))

vi.mock('../../stores/archiveStore', () => ({
  useArchiveStore: {
    getState: vi.fn(() => ({
      archiveSession: vi.fn().mockResolvedValue(undefined),
    })),
  },
}))

// Import AFTER mocks so the mocked modules are used
import { useLoopStore } from '../../stores/loopStore'
import { useArchiveStore } from '../../stores/archiveStore'

// ── Tests ─────────────────────────────────────────────────────────────────

describe('coordinatorStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Re-establish default mock return values (clearAllMocks doesn't clear these)
    vi.mocked(useLoopStore.getState).mockReturnValue({
      tasks: [{ id: 'default', title: 'Default', description: '', acceptanceCriteria: [], priority: 1, passes: false, notes: '' }],
      pauseLoop: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useLoopStore.getState>)
    vi.mocked(useArchiveStore.getState).mockReturnValue({
      archives: [],
      selectedArchiveId: null,
      isLoading: false,
      branchChanged: false,
      loadArchives: vi.fn(),
      selectArchive: vi.fn(),
      archiveSession: vi.fn().mockResolvedValue(undefined),
      restoreArchive: vi.fn(),
      deleteArchive: vi.fn(),
      checkBranchChange: vi.fn(),
      getArchiveDiff: vi.fn(),
    } as unknown as ReturnType<typeof useArchiveStore.getState>)
    useCoordinatorStore.setState({
      globalStatus: 'idle',
      lastEvent: null,
      eventLog: [],
    })
  })

  // ── Initial state ───────────────────────────────────────────────────────

  describe('initial state', () => {
    it('has correct defaults', () => {
      const state = useCoordinatorStore.getState()
      expect(state.globalStatus).toBe('idle')
      expect(state.lastEvent).toBeNull()
      expect(state.eventLog).toEqual([])
    })
  })

  // ── logEvent ────────────────────────────────────────────────────────────

  describe('logEvent', () => {
    it('adds an event to the log', () => {
      useCoordinatorStore.getState().logEvent('Test event', 'test')
      const { eventLog, lastEvent } = useCoordinatorStore.getState()
      expect(eventLog.length).toBe(1)
      expect(eventLog[0].event).toBe('Test event')
      expect(eventLog[0].source).toBe('test')
      expect(eventLog[0].timestamp).toBeInstanceOf(Date)
      expect(lastEvent).toBe('Test event')
    })

    it('prepends new events to the front of the log', () => {
      const store = useCoordinatorStore.getState()
      store.logEvent('First', 'test')
      store.logEvent('Second', 'test')

      const { eventLog } = useCoordinatorStore.getState()
      expect(eventLog[0].event).toBe('Second')
      expect(eventLog[1].event).toBe('First')
    })

    it('caps the event log at 100 entries', () => {
      const store = useCoordinatorStore.getState()
      for (let i = 0; i < 105; i++) {
        store.logEvent(`Event ${i}`, 'test')
      }
      expect(useCoordinatorStore.getState().eventLog.length).toBe(100)
    })

    it('updates lastEvent on each log', () => {
      const store = useCoordinatorStore.getState()
      store.logEvent('Event A', 'src-a')
      expect(useCoordinatorStore.getState().lastEvent).toBe('Event A')

      store.logEvent('Event B', 'src-b')
      expect(useCoordinatorStore.getState().lastEvent).toBe('Event B')
    })
  })

  // ── handleLoopCompleted ─────────────────────────────────────────────────

  describe('handleLoopCompleted', () => {
    it('logs a loop completed event', async () => {
      await useCoordinatorStore.getState().handleLoopCompleted()
      // handleLoopCompleted logs 'Loop completed' first, then conditionally logs archive
      const { eventLog } = useCoordinatorStore.getState()
      expect(eventLog.some((e) => e.event === 'Loop completed')).toBe(true)
    })

    it('sets globalStatus to idle', async () => {
      useCoordinatorStore.setState({ globalStatus: 'working' })
      await useCoordinatorStore.getState().handleLoopCompleted()
      expect(useCoordinatorStore.getState().globalStatus).toBe('idle')
    })

    it('archives session when all tasks pass', async () => {
      vi.mocked(useLoopStore.getState).mockReturnValue({
        tasks: [
          { id: '1', title: 'T1', passes: true },
          { id: '2', title: 'T2', passes: true },
        ],
        pauseLoop: vi.fn(),
        reset: vi.fn(),
      } as unknown as ReturnType<typeof useLoopStore.getState>)

      await useCoordinatorStore.getState().handleLoopCompleted()

      const archiveState = useArchiveStore.getState()
      expect(archiveState.archiveSession).toHaveBeenCalled()
      expect(useCoordinatorStore.getState().lastEvent).toBe('All tasks passed, archiving session')
    })

    it('does not archive session when some tasks fail', async () => {
      vi.mocked(useLoopStore.getState).mockReturnValue({
        tasks: [
          { id: '1', title: 'T1', passes: true },
          { id: '2', title: 'T2', passes: false },
        ],
        pauseLoop: vi.fn(),
        reset: vi.fn(),
      } as unknown as ReturnType<typeof useLoopStore.getState>)

      await useCoordinatorStore.getState().handleLoopCompleted()

      const archiveState = useArchiveStore.getState()
      expect(archiveState.archiveSession).not.toHaveBeenCalled()
    })

    it('logs correct events in order', async () => {
      await useCoordinatorStore.getState().handleLoopCompleted()

      const { eventLog } = useCoordinatorStore.getState()
      expect(eventLog.length).toBeGreaterThanOrEqual(1)
      expect(eventLog[eventLog.length - 1].event).toBe('Loop completed')
    })
  })

  // ── handleBranchChange ──────────────────────────────────────────────────

  describe('handleBranchChange', () => {
    it('logs a branch change event', async () => {
      await useCoordinatorStore.getState().handleBranchChange()
      const { eventLog } = useCoordinatorStore.getState()
      expect(eventLog.some((e) => e.event === 'Branch change detected')).toBe(true)
    })

    it('archives current session before branch switch', async () => {
      await useCoordinatorStore.getState().handleBranchChange()

      const archiveState = useArchiveStore.getState()
      expect(archiveState.archiveSession).toHaveBeenCalled()
    })

    it('resets loop state for new branch', async () => {
      const mockReset = vi.fn()
      vi.mocked(useLoopStore.getState).mockReturnValue({
        reset: mockReset,
        tasks: [],
        pauseLoop: vi.fn(),
      } as unknown as ReturnType<typeof useLoopStore.getState>)

      await useCoordinatorStore.getState().handleBranchChange()

      expect(mockReset).toHaveBeenCalled()
    })

    it('logs session archived and loop reset', async () => {
      await useCoordinatorStore.getState().handleBranchChange()

      const { eventLog } = useCoordinatorStore.getState()
      const archiveEvents = eventLog.filter(
        (e) => e.event === 'Session archived, loop reset for new branch'
      )
      expect(archiveEvents.length).toBe(1)
    })
  })

  // ── handleGateFailure ───────────────────────────────────────────────────

  describe('handleGateFailure', () => {
    it('logs a gate failure event', async () => {
      await useCoordinatorStore.getState().handleGateFailure()
      expect(useCoordinatorStore.getState().lastEvent).toBe('Quality gate failed, pausing loop')
    })

    it('sets globalStatus to error', async () => {
      await useCoordinatorStore.getState().handleGateFailure()
      expect(useCoordinatorStore.getState().globalStatus).toBe('error')
    })

    it('pauses the loop via loopStore', async () => {
      const mockPauseLoop = vi.fn().mockResolvedValue(undefined)
      vi.mocked(useLoopStore.getState).mockReturnValue({
        pauseLoop: mockPauseLoop,
        tasks: [],
        reset: vi.fn(),
      } as unknown as ReturnType<typeof useLoopStore.getState>)

      await useCoordinatorStore.getState().handleGateFailure()

      expect(mockPauseLoop).toHaveBeenCalled()
    })
  })

  // ── reset ───────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('resets all state to defaults', () => {
      // Set non-default state
      const store = useCoordinatorStore.getState()
      store.logEvent('Some event', 'test')
      useCoordinatorStore.setState({ globalStatus: 'working' })

      // Reset
      useCoordinatorStore.getState().reset()

      const state = useCoordinatorStore.getState()
      expect(state.globalStatus).toBe('idle')
      expect(state.lastEvent).toBeNull()
      expect(state.eventLog).toEqual([])
    })
  })
})
