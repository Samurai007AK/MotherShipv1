import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { usePerformanceStore, type PerformanceSnapshot } from '../../stores/performanceStore'

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

const mockInvoke = vi.mocked(invoke)

// ── Snapshot factory ──────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<PerformanceSnapshot> = {}): PerformanceSnapshot {
  return {
    total_memory_mb: 16384,
    used_memory_mb: 8192,
    available_memory_mb: 8192,
    process_memory_mb: 180,
    process_memory_fraction: 0.011,
    total_swap_mb: 4096,
    used_swap_mb: 512,
    cpu_count: 8,
    cpu_usage: 35.2,
    over_threshold: false,
    ...overrides,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function setTauriMode(enabled: boolean) {
  if (enabled) {
    vi.stubGlobal('__TAURI_INTERNALS__', {})
  } else {
    delete (window as unknown as Record<string, unknown>)['__TAURI_INTERNALS__']
  }
}

function setBrowserMemory(mb: number) {
  Object.defineProperty(performance, 'memory', {
    value: { usedJSHeapSize: mb * 1024 * 1024, totalJSHeapSize: 500 * 1024 * 1024 },
    configurable: true,
  })
}

function clearBrowserMemory() {
  delete (performance as unknown as Record<string, unknown>)['memory']
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('performanceStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockInvoke.mockReset()
    setTauriMode(false)
    clearBrowserMemory()
    localStorage.clear()
    usePerformanceStore.setState({
      snapshot: null,
      isPolling: false,
      pollIntervalMs: 5000,
      jsHeapMB: null,
      pressure: 'ok',
      pressureHistory: [],
      memoryThreshold: 200,
      activityThresholdMs: 60000,
      autoPauseEnabled: true,
      autoPauseEvents: [],
      wasOverThreshold: false,
      terminalSessions: [],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    const state = usePerformanceStore.getState()
    if (state.isPolling) {
      state.stopPolling()
    }
    setTauriMode(false)
    clearBrowserMemory()
  })

  // ── Initial state ───────────────────────────────────────────────────────

  describe('initial state', () => {
    it('has correct defaults', () => {
      const state = usePerformanceStore.getState()
      expect(state.snapshot).toBeNull()
      expect(state.isPolling).toBe(false)
      expect(state.pollIntervalMs).toBe(5000)
      expect(state.jsHeapMB).toBeNull()
      expect(state.pressure).toBe('ok')
      expect(state.pressureHistory).toEqual([])
      expect(state.autoPauseEnabled).toBe(true)
      expect(state.autoPauseEvents).toEqual([])
      expect(state.wasOverThreshold).toBe(false)
      expect(state.memoryThreshold).toBe(200)
      expect(state.activityThresholdMs).toBe(60000)
      expect(state.terminalSessions).toEqual([])
    })
  })

  // ── setAutoPauseEnabled ─────────────────────────────────────────────────

  describe('setAutoPauseEnabled', () => {
    it('disables auto-pause', () => {
      usePerformanceStore.getState().setAutoPauseEnabled(false)
      expect(usePerformanceStore.getState().autoPauseEnabled).toBe(false)
    })

    it('enables auto-pause', () => {
      usePerformanceStore.getState().setAutoPauseEnabled(false)
      usePerformanceStore.getState().setAutoPauseEnabled(true)
      expect(usePerformanceStore.getState().autoPauseEnabled).toBe(true)
    })
  })

  // ── setMemoryThreshold ──────────────────────────────────────────────────

  describe('setMemoryThreshold', () => {
    it('sets the threshold to the given value', () => {
      usePerformanceStore.getState().setMemoryThreshold(512)
      expect(usePerformanceStore.getState().memoryThreshold).toBe(512)
    })

    it('clamps to minimum 50 MB', () => {
      usePerformanceStore.getState().setMemoryThreshold(10)
      expect(usePerformanceStore.getState().memoryThreshold).toBe(50)
    })

    it('clamps to maximum 2000 MB', () => {
      usePerformanceStore.getState().setMemoryThreshold(5000)
      expect(usePerformanceStore.getState().memoryThreshold).toBe(2000)
    })

    it('accepts values within the valid range', () => {
      usePerformanceStore.getState().setMemoryThreshold(100)
      expect(usePerformanceStore.getState().memoryThreshold).toBe(100)

      usePerformanceStore.getState().setMemoryThreshold(2000)
      expect(usePerformanceStore.getState().memoryThreshold).toBe(2000)

      usePerformanceStore.getState().setMemoryThreshold(50)
      expect(usePerformanceStore.getState().memoryThreshold).toBe(50)
    })
  })

  // ── setActivityThresholdMs ─────────────────────────────────────────────

  describe('setActivityThresholdMs', () => {
    it('sets the activity threshold to the given value', () => {
      usePerformanceStore.getState().setActivityThresholdMs(120000)
      expect(usePerformanceStore.getState().activityThresholdMs).toBe(120000)
    })

    it('clamps to minimum 5000 ms', () => {
      usePerformanceStore.getState().setActivityThresholdMs(1000)
      expect(usePerformanceStore.getState().activityThresholdMs).toBe(5000)
    })

    it('clamps to maximum 600000 ms', () => {
      usePerformanceStore.getState().setActivityThresholdMs(999999)
      expect(usePerformanceStore.getState().activityThresholdMs).toBe(600000)
    })

    it('accepts values within the valid range', () => {
      usePerformanceStore.getState().setActivityThresholdMs(30000)
      expect(usePerformanceStore.getState().activityThresholdMs).toBe(30000)

      usePerformanceStore.getState().setActivityThresholdMs(600000)
      expect(usePerformanceStore.getState().activityThresholdMs).toBe(600000)

      usePerformanceStore.getState().setActivityThresholdMs(5000)
      expect(usePerformanceStore.getState().activityThresholdMs).toBe(5000)
    })
  })

  // ── clearPressureHistory ────────────────────────────────────────────────

  describe('clearPressureHistory', () => {
    it('clears the pressure history array', () => {
      usePerformanceStore.setState({ pressureHistory: ['ok', 'warn', 'critical'] })
      expect(usePerformanceStore.getState().pressureHistory.length).toBe(3)

      usePerformanceStore.getState().clearPressureHistory()
      expect(usePerformanceStore.getState().pressureHistory).toEqual([])
    })
  })

  // ── refreshNow (dev mode) ───────────────────────────────────────────────

  describe('refreshNow — dev mode', () => {
    it('sets a mock snapshot with process_memory_mb from JS heap', async () => {
      setBrowserMemory(50)

      await usePerformanceStore.getState().refreshNow()

      const { snapshot, jsHeapMB } = usePerformanceStore.getState()
      expect(snapshot).not.toBeNull()
      expect(jsHeapMB).toBe(50)
      expect(snapshot!.process_memory_mb).toBe(50)
      expect(snapshot!.total_memory_mb).toBe(0)
      expect(snapshot!.over_threshold).toBe(false)
    })

    it('marks over_threshold when JS heap exceeds the configured threshold', async () => {
      setBrowserMemory(250)

      await usePerformanceStore.getState().refreshNow()

      let snapshot = usePerformanceStore.getState().snapshot
      expect(snapshot!.over_threshold).toBe(true)

      // Lower the threshold — still over
      usePerformanceStore.getState().setMemoryThreshold(100)
      await usePerformanceStore.getState().refreshNow()
      snapshot = usePerformanceStore.getState().snapshot
      expect(snapshot!.over_threshold).toBe(true)

      // Raise the threshold — now under
      usePerformanceStore.getState().setMemoryThreshold(300)
      await usePerformanceStore.getState().refreshNow()
      snapshot = usePerformanceStore.getState().snapshot
      expect(snapshot!.over_threshold).toBe(false)
    })

    it('sets jsHeapMB to null when browser memory API is unavailable', async () => {
      await usePerformanceStore.getState().refreshNow()

      const { snapshot, jsHeapMB } = usePerformanceStore.getState()
      expect(jsHeapMB).toBeNull()
      expect(snapshot!.process_memory_mb).toBe(0)
      expect(snapshot!.over_threshold).toBe(false)
    })

    it('does not invoke IPC in dev mode', async () => {
      await usePerformanceStore.getState().refreshNow()
      expect(mockInvoke).not.toHaveBeenCalled()
    })
  })

  // ── refreshNow (Tauri mode) ─────────────────────────────────────────────

  describe('refreshNow — Tauri mode', () => {
    beforeEach(() => {
      setTauriMode(true)
    })

    it('invokes get_performance_snapshot and sets snapshot', async () => {
      const snapshot = makeSnapshot({ process_memory_mb: 120 })
      mockInvoke.mockResolvedValue(snapshot)

      await usePerformanceStore.getState().refreshNow()

      expect(mockInvoke).toHaveBeenCalledWith('get_performance_snapshot')
      const state = usePerformanceStore.getState()
      expect(state.snapshot).toEqual(snapshot)
      expect(state.pressure).toBe('ok')
    })

    it('handles invoke failure gracefully', async () => {
      mockInvoke.mockRejectedValue(new Error('IPC error'))

      await expect(usePerformanceStore.getState().refreshNow()).resolves.toBeUndefined()
      expect(usePerformanceStore.getState().snapshot).toBeNull()
    })

    it('updates pressureHistory, capped at 60 entries', async () => {
      mockInvoke.mockResolvedValue(makeSnapshot({ process_memory_mb: 120 }))
      usePerformanceStore.setState({
        pressureHistory: Array(59).fill('ok') as ('ok' | 'warn' | 'critical')[],
      })

      await usePerformanceStore.getState().refreshNow()

      expect(usePerformanceStore.getState().pressureHistory.length).toBe(60)
      expect(usePerformanceStore.getState().pressureHistory[59]).toBe('ok')
    })
  })

  // ── Pressure detection ──────────────────────────────────────────────────

  describe('pressure detection', () => {
    beforeEach(() => {
      setTauriMode(true)
    })

    it('sets pressure to ok when process_memory_mb < 150', async () => {
      mockInvoke.mockResolvedValue(makeSnapshot({ process_memory_mb: 80 }))
      await usePerformanceStore.getState().refreshNow()
      expect(usePerformanceStore.getState().pressure).toBe('ok')
    })

    it('sets pressure to ok at 149 MB', async () => {
      mockInvoke.mockResolvedValue(makeSnapshot({ process_memory_mb: 149 }))
      await usePerformanceStore.getState().refreshNow()
      expect(usePerformanceStore.getState().pressure).toBe('ok')
    })

    it('sets pressure to warn at 150 MB', async () => {
      mockInvoke.mockResolvedValue(makeSnapshot({ process_memory_mb: 150 }))
      await usePerformanceStore.getState().refreshNow()
      expect(usePerformanceStore.getState().pressure).toBe('warn')
    })

    it('sets pressure to warn at 299 MB', async () => {
      mockInvoke.mockResolvedValue(makeSnapshot({ process_memory_mb: 299 }))
      await usePerformanceStore.getState().refreshNow()
      expect(usePerformanceStore.getState().pressure).toBe('warn')
    })

    it('sets pressure to critical at 300 MB', async () => {
      mockInvoke.mockResolvedValue(makeSnapshot({ process_memory_mb: 300 }))
      await usePerformanceStore.getState().refreshNow()
      expect(usePerformanceStore.getState().pressure).toBe('critical')
    })

    it('sets pressure to critical above 300 MB', async () => {
      mockInvoke.mockResolvedValue(makeSnapshot({ process_memory_mb: 450 }))
      await usePerformanceStore.getState().refreshNow()
      expect(usePerformanceStore.getState().pressure).toBe('critical')
    })
  })

  // ── Auto-pause logic ────────────────────────────────────────────────────

  describe('auto-pause logic', () => {
    beforeEach(() => {
      setTauriMode(true)
    })

    it('triggers auto-pause when crossing from below to above threshold', async () => {
      const lowSnapshot = makeSnapshot({ process_memory_mb: 100, over_threshold: false })
      const highSnapshot = makeSnapshot({ process_memory_mb: 250, over_threshold: true })

      mockInvoke.mockResolvedValueOnce(lowSnapshot)
      await usePerformanceStore.getState().refreshNow()
      expect(usePerformanceStore.getState().wasOverThreshold).toBe(false)
      expect(usePerformanceStore.getState().autoPauseEvents.length).toBe(0)

      mockInvoke.mockResolvedValueOnce(highSnapshot)
      mockInvoke.mockResolvedValueOnce([])
      await usePerformanceStore.getState().refreshNow()

      const state = usePerformanceStore.getState()
      expect(state.wasOverThreshold).toBe(true)
      expect(state.autoPauseEvents.length).toBe(1)
      expect(state.autoPauseEvents[0].count).toBe(0)
    })

    it('does not re-trigger auto-pause if already over threshold', async () => {
      const highSnapshot = makeSnapshot({ process_memory_mb: 250, over_threshold: true })
      usePerformanceStore.setState({ wasOverThreshold: true })

      mockInvoke.mockResolvedValueOnce(highSnapshot)
      await usePerformanceStore.getState().refreshNow()

      expect(usePerformanceStore.getState().autoPauseEvents.length).toBe(0)
    })

    it('resets wasOverThreshold when memory drops below threshold', async () => {
      const highSnapshot = makeSnapshot({ process_memory_mb: 250, over_threshold: true })
      const lowSnapshot = makeSnapshot({ process_memory_mb: 100, over_threshold: false })

      mockInvoke.mockResolvedValueOnce(highSnapshot)
      mockInvoke.mockResolvedValueOnce([])
      await usePerformanceStore.getState().refreshNow()
      expect(usePerformanceStore.getState().wasOverThreshold).toBe(true)

      mockInvoke.mockResolvedValueOnce(lowSnapshot)
      await usePerformanceStore.getState().refreshNow()

      expect(usePerformanceStore.getState().wasOverThreshold).toBe(false)
    })

    it('allows re-triggering after memory drops and spikes again', async () => {
      const highSnapshot = makeSnapshot({ process_memory_mb: 250, over_threshold: true })
      const lowSnapshot = makeSnapshot({ process_memory_mb: 100, over_threshold: false })

      mockInvoke.mockResolvedValueOnce(highSnapshot)
      mockInvoke.mockResolvedValueOnce([])
      await usePerformanceStore.getState().refreshNow()
      expect(usePerformanceStore.getState().autoPauseEvents.length).toBe(1)

      mockInvoke.mockResolvedValueOnce(lowSnapshot)
      await usePerformanceStore.getState().refreshNow()
      expect(usePerformanceStore.getState().wasOverThreshold).toBe(false)

      mockInvoke.mockResolvedValueOnce(highSnapshot)
      mockInvoke.mockResolvedValueOnce([])
      await usePerformanceStore.getState().refreshNow()

      expect(usePerformanceStore.getState().autoPauseEvents.length).toBe(2)
    })

    it('pauses running terminal sessions via IPC', async () => {
      const highSnapshot = makeSnapshot({ process_memory_mb: 250, over_threshold: true })
      const sessions = [
        { id: 'session-1', agentId: 'claude', status: 'Running' },
        { id: 'session-2', agentId: 'codex', status: 'Running' },
      ]

      mockInvoke.mockResolvedValueOnce(highSnapshot)
      mockInvoke.mockResolvedValueOnce(sessions)
      mockInvoke.mockResolvedValueOnce(undefined)
      mockInvoke.mockResolvedValueOnce(undefined)

      await usePerformanceStore.getState().refreshNow()

      expect(mockInvoke).toHaveBeenCalledWith('list_terminal_sessions')
      expect(mockInvoke).toHaveBeenCalledWith('pause_terminal_session', { sessionId: 'session-1' })
      expect(mockInvoke).toHaveBeenCalledWith('pause_terminal_session', { sessionId: 'session-2' })

      const state = usePerformanceStore.getState()
      expect(state.autoPauseEvents.length).toBe(1)
      expect(state.autoPauseEvents[0].count).toBe(2)
      expect(state.autoPauseEvents[0].pausedSessionIds).toEqual(['session-1', 'session-2'])
    })

    it('skips paused/exited terminals — only pauses Running ones', async () => {
      const highSnapshot = makeSnapshot({ process_memory_mb: 250, over_threshold: true })
      const sessions = [
        { id: 'running-1', agentId: 'claude', status: 'Running' },
        { id: 'already-paused', agentId: 'codex', status: 'Paused' },
        { id: 'exited', agentId: 'gemini', status: 'Exited' },
        { id: 'running-2', agentId: 'opus', status: 'Running' },
      ]

      mockInvoke.mockResolvedValueOnce(highSnapshot)
      mockInvoke.mockResolvedValueOnce(sessions)
      mockInvoke.mockResolvedValueOnce(undefined)
      mockInvoke.mockResolvedValueOnce(undefined)

      await usePerformanceStore.getState().refreshNow()

      expect(mockInvoke).toHaveBeenCalledWith('pause_terminal_session', { sessionId: 'running-1' })
      expect(mockInvoke).toHaveBeenCalledWith('pause_terminal_session', { sessionId: 'running-2' })
      expect(mockInvoke).not.toHaveBeenCalledWith('pause_terminal_session', { sessionId: 'already-paused' })
      expect(mockInvoke).not.toHaveBeenCalledWith('pause_terminal_session', { sessionId: 'exited' })

      expect(usePerformanceStore.getState().autoPauseEvents[0].count).toBe(2)
    })

    it('does not trigger auto-pause when disabled', async () => {
      usePerformanceStore.getState().setAutoPauseEnabled(false)

      mockInvoke
        .mockResolvedValueOnce(makeSnapshot({ process_memory_mb: 250, over_threshold: true }))
        .mockResolvedValueOnce([])
      await usePerformanceStore.getState().refreshNow()

      // Now calls: get_performance_snapshot + list_terminal_sessions (via fetchTerminalSessions)
      expect(mockInvoke).toHaveBeenCalledWith('get_performance_snapshot')
      expect(mockInvoke).toHaveBeenCalledWith('list_terminal_sessions')
      expect(mockInvoke).not.toHaveBeenCalledWith('pause_terminal_session')
      expect(usePerformanceStore.getState().autoPauseEvents.length).toBe(0)
    })

    it('keeps last 10 auto-pause events', async () => {
      const high = makeSnapshot({ process_memory_mb: 250, over_threshold: true })
      const low = makeSnapshot({ process_memory_mb: 100, over_threshold: false })

      for (let i = 0; i < 12; i++) {
        mockInvoke.mockResolvedValueOnce(high)
        mockInvoke.mockResolvedValueOnce([])
        await usePerformanceStore.getState().refreshNow()

        mockInvoke.mockResolvedValueOnce(low)
        await usePerformanceStore.getState().refreshNow()
      }

      expect(usePerformanceStore.getState().autoPauseEvents.length).toBe(10)
    })
  })

  // ── startPolling ────────────────────────────────────────────────────────

  describe('startPolling', () => {
    it('sets isPolling to true', () => {
      usePerformanceStore.getState().startPolling(10000)
      expect(usePerformanceStore.getState().isPolling).toBe(true)
    })

    it('calls refreshNow immediately on start', async () => {
      const spy = vi.spyOn(usePerformanceStore.getState(), 'refreshNow')

      usePerformanceStore.getState().startPolling(10000)

      expect(spy).toHaveBeenCalledTimes(1)
      spy.mockRestore()
    })

    it('calls refreshNow on each interval tick', async () => {
      const refreshSpy = vi.spyOn(usePerformanceStore.getState(), 'refreshNow')

      usePerformanceStore.getState().startPolling(5000)

      await vi.advanceTimersByTimeAsync(5000)
      expect(refreshSpy).toHaveBeenCalledTimes(2)

      await vi.advanceTimersByTimeAsync(5000)
      expect(refreshSpy).toHaveBeenCalledTimes(3)

      refreshSpy.mockRestore()
    })

    it('does not start a second polling interval if already polling', () => {
      const refreshSpy = vi.spyOn(usePerformanceStore.getState(), 'refreshNow')

      usePerformanceStore.getState().startPolling(5000)
      expect(usePerformanceStore.getState().isPolling).toBe(true)
      expect(refreshSpy).toHaveBeenCalledTimes(1)

      usePerformanceStore.getState().startPolling(5000)
      expect(refreshSpy).toHaveBeenCalledTimes(1)

      refreshSpy.mockRestore()
    })
  })

  // ── stopPolling ─────────────────────────────────────────────────────────

  describe('stopPolling', () => {
    it('sets isPolling to false', () => {
      usePerformanceStore.getState().startPolling(5000)
      expect(usePerformanceStore.getState().isPolling).toBe(true)

      usePerformanceStore.getState().stopPolling()
      expect(usePerformanceStore.getState().isPolling).toBe(false)
    })

    it('stops the polling interval — no more refresh after stop', async () => {
      // Verify the interval is cleared by checking that refreshNow is NOT
      // called again after stopPolling.
      setTauriMode(true)
      // Provide mocks for both IPC calls the initial refresh will make
      mockInvoke
        .mockResolvedValueOnce(makeSnapshot())  // get_performance_snapshot
        .mockResolvedValueOnce([])               // list_terminal_sessions

      usePerformanceStore.getState().startPolling(5000)

      // Let the initial refresh complete both IPC calls
      await vi.advanceTimersByTimeAsync(0)

      // Now stop polling and clear the call count
      usePerformanceStore.getState().stopPolling()
      mockInvoke.mockClear()

      // Advance time — no interval should fire
      await vi.advanceTimersByTimeAsync(10000)

      // invoke should NOT have been called (no interval fired)
      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('is safe to call when not polling', () => {
      expect(() => usePerformanceStore.getState().stopPolling()).not.toThrow()
    })
  })

  // ── Auto-pause: lastActivityAt filtering ────────────────────────────────

  describe('auto-pause — lastActivityAt filtering', () => {
    beforeEach(() => {
      setTauriMode(true)
    })

    it('skips sessions active within the configured idle window (60s default)', async () => {
      const now = Date.now()
      const highSnapshot = makeSnapshot({ process_memory_mb: 250, over_threshold: true })
      const sessions = [
        { id: 'recent', agentId: 'claude', status: 'Running', lastActivityAt: new Date(now - 30_000).toISOString() },
        { id: 'old', agentId: 'codex', status: 'Running', lastActivityAt: new Date(now - 120_000).toISOString() },
      ]

      mockInvoke.mockResolvedValueOnce(highSnapshot)
      mockInvoke.mockResolvedValueOnce(sessions)
      mockInvoke.mockResolvedValueOnce(undefined) // pause old session

      await usePerformanceStore.getState().refreshNow()

      // Only the old session should be paused
      expect(mockInvoke).toHaveBeenCalledWith('pause_terminal_session', { sessionId: 'old' })
      expect(mockInvoke).not.toHaveBeenCalledWith('pause_terminal_session', { sessionId: 'recent' })

      const state = usePerformanceStore.getState()
      expect(state.autoPauseEvents[0].count).toBe(1)
      expect(state.autoPauseEvents[0].pausedSessionIds).toEqual(['old'])
    })

    it('pauses sessions at the boundary edge (exactly = idle)', async () => {
      const now = Date.now()
      const highSnapshot = makeSnapshot({ process_memory_mb: 250, over_threshold: true })
      const sessions = [
        { id: 'boundary', agentId: 'claude', status: 'Running', lastActivityAt: new Date(now - 60_000).toISOString() },
      ]

      mockInvoke.mockResolvedValueOnce(highSnapshot)
      mockInvoke.mockResolvedValueOnce(sessions)
      mockInvoke.mockResolvedValueOnce(undefined)

      await usePerformanceStore.getState().refreshNow()

      expect(mockInvoke).toHaveBeenCalledWith('pause_terminal_session', { sessionId: 'boundary' })
      expect(usePerformanceStore.getState().autoPauseEvents[0].count).toBe(1)
    })

    it('pauses sessions without lastActivityAt field (conservative default)', async () => {
      const highSnapshot = makeSnapshot({ process_memory_mb: 250, over_threshold: true })
      const sessions = [
        { id: 'no-timestamp', agentId: 'claude', status: 'Running' },
      ]

      mockInvoke.mockResolvedValueOnce(highSnapshot)
      mockInvoke.mockResolvedValueOnce(sessions)
      mockInvoke.mockResolvedValueOnce(undefined)

      await usePerformanceStore.getState().refreshNow()

      expect(mockInvoke).toHaveBeenCalledWith('pause_terminal_session', { sessionId: 'no-timestamp' })
      expect(usePerformanceStore.getState().autoPauseEvents[0].count).toBe(1)
    })

    it('skips sessions within the idle window at 59s with 60s default', async () => {
      const now = Date.now()
      const highSnapshot = makeSnapshot({ process_memory_mb: 250, over_threshold: true })
      const sessions = [
        { id: 'active-edge', agentId: 'claude', status: 'Running', lastActivityAt: new Date(now - 59_001).toISOString() },
      ]

      mockInvoke.mockResolvedValueOnce(highSnapshot)
      mockInvoke.mockResolvedValueOnce(sessions)

      await usePerformanceStore.getState().refreshNow()

      expect(mockInvoke).not.toHaveBeenCalledWith('pause_terminal_session', { sessionId: 'active-edge' })
      expect(usePerformanceStore.getState().autoPauseEvents[0].count).toBe(0)
    })

    it('respects a custom activity threshold', async () => {
      // Set a very short idle window: 10 seconds
      usePerformanceStore.getState().setActivityThresholdMs(10_000)

      const now = Date.now()
      const highSnapshot = makeSnapshot({ process_memory_mb: 250, over_threshold: true })
      const sessions = [
        // 15s ago — > 10s threshold → idle → should pause
        { id: 'old-enough', agentId: 'claude', status: 'Running', lastActivityAt: new Date(now - 15_000).toISOString() },
        // 5s ago — < 10s threshold → active → skip
        { id: 'too-recent', agentId: 'codex', status: 'Running', lastActivityAt: new Date(now - 5_000).toISOString() },
      ]

      mockInvoke.mockResolvedValueOnce(highSnapshot)
      mockInvoke.mockResolvedValueOnce(sessions)
      mockInvoke.mockResolvedValueOnce(undefined)

      await usePerformanceStore.getState().refreshNow()

      expect(mockInvoke).toHaveBeenCalledWith('pause_terminal_session', { sessionId: 'old-enough' })
      expect(mockInvoke).not.toHaveBeenCalledWith('pause_terminal_session', { sessionId: 'too-recent' })

      const state = usePerformanceStore.getState()
      expect(state.autoPauseEvents[0].count).toBe(1)
      expect(state.autoPauseEvents[0].pausedSessionIds).toEqual(['old-enough'])
    })
  })

  // ── Auto-pause: error paths ─────────────────────────────────────────────

  describe('auto-pause — error paths', () => {
    beforeEach(() => {
      setTauriMode(true)
    })

    it('handles list_terminal_sessions throwing gracefully', async () => {
      const highSnapshot = makeSnapshot({ process_memory_mb: 250, over_threshold: true })

      mockInvoke.mockResolvedValueOnce(highSnapshot)
      // list_terminal_sessions throws
      mockInvoke.mockRejectedValueOnce(new Error('IPC failure'))

      await usePerformanceStore.getState().refreshNow()

      // Should still record an event with count 0 (graceful fallback)
      const state = usePerformanceStore.getState()
      expect(state.autoPauseEvents.length).toBe(1)
      expect(state.autoPauseEvents[0].count).toBe(0)
      expect(state.autoPauseEvents[0].pausedSessionIds).toEqual([])
    })

    it('records only successful pauses when some pause_terminal_session calls fail', async () => {
      const highSnapshot = makeSnapshot({ process_memory_mb: 250, over_threshold: true })
      const sessions = [
        { id: 'will-succeed', agentId: 'claude', status: 'Running' } as const,
        { id: 'will-fail', agentId: 'codex', status: 'Running' } as const,
      ]

      mockInvoke.mockResolvedValueOnce(highSnapshot)
      mockInvoke.mockResolvedValueOnce(sessions)
      mockInvoke.mockResolvedValueOnce(undefined) // will-succeed
      mockInvoke.mockRejectedValueOnce(new Error('pause failed')) // will-fail

      await usePerformanceStore.getState().refreshNow()

      expect(mockInvoke).toHaveBeenCalledWith('pause_terminal_session', { sessionId: 'will-succeed' })
      expect(mockInvoke).toHaveBeenCalledWith('pause_terminal_session', { sessionId: 'will-fail' })

      const state = usePerformanceStore.getState()
      expect(state.autoPauseEvents[0].count).toBe(1)
      expect(state.autoPauseEvents[0].pausedSessionIds).toEqual(['will-succeed'])
    })

    it('handles sessions with Error status variant', async () => {
      const highSnapshot = makeSnapshot({ process_memory_mb: 250, over_threshold: true })
      const sessions = [
        { id: 'running-1', agentId: 'claude', status: 'Running' } as const,
        { id: 'error-1', agentId: 'codex', status: { Error: 'PTY crash' } },
      ]

      mockInvoke.mockResolvedValueOnce(highSnapshot)
      mockInvoke.mockResolvedValueOnce(sessions)
      mockInvoke.mockResolvedValueOnce(undefined)

      await usePerformanceStore.getState().refreshNow()

      // Should only pause the Running session, skip the Error variant
      expect(mockInvoke).toHaveBeenCalledWith('pause_terminal_session', { sessionId: 'running-1' })
      expect(mockInvoke).not.toHaveBeenCalledWith('pause_terminal_session', { sessionId: 'error-1' })

      expect(usePerformanceStore.getState().autoPauseEvents[0].count).toBe(1)
    })
  })

  // ── Dev mode auto-pause is a no-op ──────────────────────────────────────

  describe('auto-pause in dev mode', () => {
    it('does not attempt to list or pause terminals', async () => {
      usePerformanceStore.setState({
        snapshot: makeSnapshot({ process_memory_mb: 250, over_threshold: true }),
        wasOverThreshold: false,
      })

      await usePerformanceStore.getState().refreshNow()

      expect(mockInvoke).not.toHaveBeenCalled()
    })
  })

  // ── Terminal session tracking ───────────────────────────────────────────

  describe('terminal session tracking', () => {
    beforeEach(() => {
      setTauriMode(true)
    })

    it('populates terminalSessions on every refresh in Tauri mode', async () => {
      const snapshot = makeSnapshot({ process_memory_mb: 120 })
      const sessions = [
        { id: 's1', agentId: 'claude', status: 'Running', lastActivityAt: new Date(Date.now() - 10_000).toISOString() },
        { id: 's2', agentId: 'codex', status: 'Running', lastActivityAt: new Date(Date.now() - 120_000).toISOString() },
      ]

      mockInvoke.mockResolvedValueOnce(snapshot)
      mockInvoke.mockResolvedValueOnce(sessions)

      await usePerformanceStore.getState().refreshNow()

      const state = usePerformanceStore.getState()
      expect(state.terminalSessions.length).toBe(2)

      const s1 = state.terminalSessions.find((s) => s.id === 's1')
      const s2 = state.terminalSessions.find((s) => s.id === 's2')
      expect(s1).toBeDefined()
      expect(s2).toBeDefined()
      expect(s1!.agentId).toBe('claude')
      expect(s2!.agentId).toBe('codex')
    })

    it('marks sessions as active when lastActivityAt is within the idle window', async () => {
      const now = Date.now()
      const snapshot = makeSnapshot({ process_memory_mb: 120 })
      const sessions = [
        { id: 'recent', agentId: 'claude', status: 'Running', lastActivityAt: new Date(now - 10_000).toISOString() },
        { id: 'old', agentId: 'codex', status: 'Running', lastActivityAt: new Date(now - 120_000).toISOString() },
      ]

      mockInvoke.mockResolvedValueOnce(snapshot)
      mockInvoke.mockResolvedValueOnce(sessions)

      await usePerformanceStore.getState().refreshNow()

      const state = usePerformanceStore.getState()
      const recent = state.terminalSessions.find((s) => s.id === 'recent')
      const old = state.terminalSessions.find((s) => s.id === 'old')
      expect(recent!.isActive).toBe(true)
      expect(old!.isActive).toBe(false)
    })

    it('marks non-Running sessions as inactive regardless of activity', async () => {
      const now = Date.now()
      const snapshot = makeSnapshot({ process_memory_mb: 120 })
      const sessions = [
        { id: 'running-recent', agentId: 'claude', status: 'Running', lastActivityAt: new Date(now - 5_000).toISOString() },
        { id: 'paused-recent', agentId: 'codex', status: 'Paused', lastActivityAt: new Date(now - 5_000).toISOString() },
        { id: 'exited', agentId: 'gemini', status: 'Exited', lastActivityAt: new Date(now - 5_000).toISOString() },
      ]

      mockInvoke.mockResolvedValueOnce(snapshot)
      mockInvoke.mockResolvedValueOnce(sessions)

      await usePerformanceStore.getState().refreshNow()

      const state = usePerformanceStore.getState()
      expect(state.terminalSessions.find((s) => s.id === 'running-recent')!.isActive).toBe(true)
      expect(state.terminalSessions.find((s) => s.id === 'paused-recent')!.isActive).toBe(false)
      expect(state.terminalSessions.find((s) => s.id === 'exited')!.isActive).toBe(false)
    })

    it('normalizes Error status variant to "Error" string', async () => {
      const snapshot = makeSnapshot({ process_memory_mb: 120 })
      const sessions = [
        { id: 'err-session', agentId: 'claude', status: { Error: 'PTY crash' } },
      ]

      mockInvoke.mockResolvedValueOnce(snapshot)
      mockInvoke.mockResolvedValueOnce(sessions)

      await usePerformanceStore.getState().refreshNow()

      const state = usePerformanceStore.getState()
      const errSession = state.terminalSessions.find((s) => s.id === 'err-session')
      expect(errSession).toBeDefined()
      expect(errSession!.status).toBe('Error')
      expect(errSession!.isActive).toBe(false)
    })

    it('gracefully handles list_terminal_sessions failure', async () => {
      const snapshot = makeSnapshot({ process_memory_mb: 120 })

      mockInvoke.mockResolvedValueOnce(snapshot)
      mockInvoke.mockRejectedValueOnce(new Error('IPC failure'))

      await usePerformanceStore.getState().refreshNow()

      expect(usePerformanceStore.getState().terminalSessions).toEqual([])
    })

    it('resets to empty array in dev mode', async () => {
      // Override the describe-BeforeEach that sets Tauri mode to true
      setTauriMode(false)

      // Set some stale data first
      usePerformanceStore.setState({
        terminalSessions: [{ id: 'stale', agentId: 'x', status: 'Running', isActive: true }],
      })

      await usePerformanceStore.getState().refreshNow()

      // Dev mode: no IPC, sessions should be empty
      expect(usePerformanceStore.getState().terminalSessions).toEqual([])
    })
  })
})
