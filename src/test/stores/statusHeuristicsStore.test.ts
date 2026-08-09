import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import {
  useStatusHeuristicsStore,
  detectStatusFromOutput,
  startStatusPolling,
  stopStatusPolling,
  __resetRateLimiter,
} from '../../stores/statusHeuristicsStore'

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

const mockInvoke = vi.mocked(invoke)

// ── Tests ─────────────────────────────────────────────────────────────────

describe('detectStatusFromOutput', () => {
  it('returns "error" for error keywords', () => {
    expect(detectStatusFromOutput('Error: something went wrong')).toBe('error')
    expect(detectStatusFromOutput('Failed: compilation failed')).toBe('error')
    expect(detectStatusFromOutput('Exception: null pointer')).toBe('error')
    expect(detectStatusFromOutput('permission denied')).toBe('error')
    expect(detectStatusFromOutput('Command not found: foo')).toBe('error')
    expect(detectStatusFromOutput('SyntaxError: unexpected token')).toBe('error')
    expect(detectStatusFromOutput('panic: index out of bounds')).toBe('error')
    expect(detectStatusFromOutput('Fatal: aborting')).toBe('error')
  })

  it('returns "idle" for done keywords', () => {
    expect(detectStatusFromOutput('Task done')).toBe('idle')
    expect(detectStatusFromOutput('Complete: all tests pass')).toBe('idle')
    expect(detectStatusFromOutput('Finished building')).toBe('idle')
    expect(detectStatusFromOutput('Success: build succeeded')).toBe('idle')
    expect(detectStatusFromOutput('✅ done')).toBe('idle')
    expect(detectStatusFromOutput('✓ complete')).toBe('idle')
    expect(detectStatusFromOutput('Summary: implemented feature X')).toBe('idle')
    expect(detectStatusFromOutput('I have completed the task')).toBe('idle')
  })

  it('returns "running" for blocked keywords', () => {
    expect(detectStatusFromOutput('thread is blocked')).toBe('running')
    expect(detectStatusFromOutput('pending operation')).toBe('running')
    expect(detectStatusFromOutput('rate limit reached')).toBe('running')
    expect(detectStatusFromOutput('request timeout')).toBe('running')
    expect(detectStatusFromOutput('hang on, im thinking')).toBe('running')
  })

  it('returns "running" for working keywords', () => {
    expect(detectStatusFromOutput('Generating response...')).toBe('running')
    expect(detectStatusFromOutput('Analyzing code')).toBe('running')
    expect(detectStatusFromOutput('Building project')).toBe('running')
    expect(detectStatusFromOutput('Running tests...')).toBe('running')
    expect(detectStatusFromOutput('Compiling TypeScript')).toBe('running')
    expect(detectStatusFromOutput('Writing file...')).toBe('running')
    expect(detectStatusFromOutput('Fetching data')).toBe('running')
  })

  it('returns null for neutral output', () => {
    expect(detectStatusFromOutput('Hello world')).toBeNull()
    expect(detectStatusFromOutput('')).toBeNull()
    expect(detectStatusFromOutput('ls -la')).toBeNull()
    expect(detectStatusFromOutput('3 + 5 = 8')).toBeNull()
  })

  it('is case-insensitive for detection', () => {
    expect(detectStatusFromOutput('ERROR: connection lost')).toBe('error')
    expect(detectStatusFromOutput('Task DONE')).toBe('idle')
    expect(detectStatusFromOutput('GENERATING...')).toBe('running')
  })

  it('matches blocked words in longer phrases', () => {
    expect(detectStatusFromOutput('The build is stuck, please check')).toBe('running')
    expect(detectStatusFromOutput('Hang on, Im thinking...')).toBe('running')
  })
})

describe('statusHeuristicsStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.now())
    mockInvoke.mockReset()
    mockInvoke.mockResolvedValue(undefined) // invoke must return Promise for .catch()
    __resetRateLimiter() // Clear any stale invoke queue entries from previous tests
    useStatusHeuristicsStore.setState({
      buffers: {},
      isEnabled: true,
      idleTimeoutSeconds: 30,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Initial state ───────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts with empty buffers', () => {
      const state = useStatusHeuristicsStore.getState()
      expect(state.buffers).toEqual({})
      expect(state.isEnabled).toBe(true)
      expect(state.idleTimeoutSeconds).toBe(30)
    })
  })

  // ── feedOutput ──────────────────────────────────────────────────────────

  describe('feedOutput', () => {
    it('creates a buffer for a new agent on first output', () => {
      useStatusHeuristicsStore.getState().feedOutput('se-1', 'Building project...')

      const buffers = useStatusHeuristicsStore.getState().buffers
      expect(buffers['se-1']).toBeDefined()
      expect(buffers['se-1'].agentId).toBe('se-1')
      expect(buffers['se-1'].recentOutput).toHaveLength(1)
      expect(buffers['se-1'].recentOutput[0]).toBe('Building project...')
    })

    it('updates lastStatus to running for working keywords', () => {
      useStatusHeuristicsStore.getState().feedOutput('se-1', 'Building project...')

      expect(useStatusHeuristicsStore.getState().buffers['se-1'].lastStatus).toBe('running')
    })

    it('updates lastStatus to error for error keywords', () => {
      useStatusHeuristicsStore.getState().feedOutput('se-1', 'Error: build failed')

      expect(useStatusHeuristicsStore.getState().buffers['se-1'].lastStatus).toBe('error')
    })

    it('updates lastStatus to idle for done keywords', () => {
      useStatusHeuristicsStore.getState().feedOutput('se-1', 'Build complete')

      expect(useStatusHeuristicsStore.getState().buffers['se-1'].lastStatus).toBe('idle')
    })

    it('treats neutral output as running when buffer has history', () => {
      useStatusHeuristicsStore.getState().feedOutput('se-1', 'Building...')
      useStatusHeuristicsStore.getState().feedOutput('se-1', 'some output line')

      expect(useStatusHeuristicsStore.getState().buffers['se-1'].lastStatus).toBe('running')
    })

    it('maintains separate buffers for different agents', () => {
      useStatusHeuristicsStore.getState().feedOutput('se-1', 'Building...')
      useStatusHeuristicsStore.getState().feedOutput('tl-1', 'Reviewing code...')

      const buffers = useStatusHeuristicsStore.getState().buffers
      expect(Object.keys(buffers)).toHaveLength(2)
      expect(buffers['se-1'].recentOutput).toHaveLength(1)
      expect(buffers['tl-1'].recentOutput).toHaveLength(1)
    })

    it('limits buffer to MAX_BUFFER_LINES lines', () => {
      for (let i = 0; i < 50; i++) {
        useStatusHeuristicsStore.getState().feedOutput('se-1', `line ${i}`)
      }

      // MAX_BUFFER_LINES is 30
      expect(useStatusHeuristicsStore.getState().buffers['se-1'].recentOutput).toHaveLength(30)
      expect(useStatusHeuristicsStore.getState().buffers['se-1'].recentOutput[0]).toBe('line 20')
    })

    it('does nothing when disabled', () => {
      useStatusHeuristicsStore.getState().setEnabled(false)
      useStatusHeuristicsStore.getState().feedOutput('se-1', 'Building...')

      expect(Object.keys(useStatusHeuristicsStore.getState().buffers)).toHaveLength(0)
    })

    it('calls rate-limited invoke to Rust backend', () => {
      useStatusHeuristicsStore.getState().feedOutput('se-1', 'Building...')

      // First call should fire immediately (rate-limited)
      expect(mockInvoke).toHaveBeenCalledWith('feed_terminal_status', {
        agentId: 'se-1',
        line: 'Building...',
      })
    })

    it('throttles rapid invoke calls', () => {
      useStatusHeuristicsStore.getState().feedOutput('se-1', 'line 1')
      useStatusHeuristicsStore.getState().feedOutput('se-1', 'line 2')
      useStatusHeuristicsStore.getState().feedOutput('se-1', 'line 3')

      // First immediately, second and third should be debounced
      expect(mockInvoke).toHaveBeenCalledTimes(1)
    })

    it('sends last pending line after rate-limit window expires', async () => {
      useStatusHeuristicsStore.getState().feedOutput('se-1', 'line 1')
      useStatusHeuristicsStore.getState().feedOutput('se-1', 'line 2')
      useStatusHeuristicsStore.getState().feedOutput('se-1', 'line 3')

      // Advance past the 500ms rate-limit window
      await vi.advanceTimersByTimeAsync(600)

      // First (immediate) + last (after debounce)
      expect(mockInvoke).toHaveBeenCalledTimes(2)
    })

    it('starts a new rate-limit window after silence', async () => {
      useStatusHeuristicsStore.getState().feedOutput('se-1', 'line 1')
      await vi.advanceTimersByTimeAsync(600)
      mockInvoke.mockClear()

      useStatusHeuristicsStore.getState().feedOutput('se-1', 'line 2')

      // Should fire immediately since previous window has expired
      expect(mockInvoke).toHaveBeenCalledWith('feed_terminal_status', {
        agentId: 'se-1',
        line: 'line 2',
      })
    })
  })

  // ── getAgentStatus ──────────────────────────────────────────────────────

  describe('getAgentStatus', () => {
    it('returns buffer status for agent', () => {
      useStatusHeuristicsStore.getState().feedOutput('se-1', 'Error: failed')

      const status = useStatusHeuristicsStore.getState().getAgentStatus('se-1')
      expect(status).toBe('error')
    })

    it('returns null for unknown agent', () => {
      const status = useStatusHeuristicsStore.getState().getAgentStatus('unknown')
      expect(status).toBeNull()
    })
  })

  // ── setEnabled / setEnabled + feedOutput interaction ────────────────────

  describe('setEnabled', () => {
    it('toggles the enabled state', () => {
      useStatusHeuristicsStore.getState().setEnabled(false)
      expect(useStatusHeuristicsStore.getState().isEnabled).toBe(false)

      useStatusHeuristicsStore.getState().setEnabled(true)
      expect(useStatusHeuristicsStore.getState().isEnabled).toBe(true)
    })
  })

  // ── setIdleTimeout ──────────────────────────────────────────────────────

  describe('setIdleTimeout', () => {
    it('updates the idle timeout', () => {
      useStatusHeuristicsStore.getState().setIdleTimeout(60)
      expect(useStatusHeuristicsStore.getState().idleTimeoutSeconds).toBe(60)
    })
  })

  // ── clearBuffer ─────────────────────────────────────────────────────────

  describe('clearBuffer', () => {
    it('removes an agent buffer', () => {
      useStatusHeuristicsStore.getState().feedOutput('se-1', 'Building...')
      useStatusHeuristicsStore.getState().feedOutput('tl-1', 'Reviewing...')

      useStatusHeuristicsStore.getState().clearBuffer('se-1')

      const buffers = useStatusHeuristicsStore.getState().buffers
      expect(buffers['se-1']).toBeUndefined()
      expect(buffers['tl-1']).toBeDefined()
    })

    it('removing last buffer leaves empty object', () => {
      useStatusHeuristicsStore.getState().feedOutput('se-1', 'Building...')
      useStatusHeuristicsStore.getState().clearBuffer('se-1')

      expect(useStatusHeuristicsStore.getState().buffers).toEqual({})
    })
  })

  // ── runPollCheck ────────────────────────────────────────────────────────

  describe('runPollCheck', () => {
    it('marks running agents as idle after timeout', () => {
      useStatusHeuristicsStore.getState().feedOutput('se-1', 'Building...')
      expect(useStatusHeuristicsStore.getState().buffers['se-1'].lastStatus).toBe('running')

      // Advance time past idle timeout (30s)
      vi.advanceTimersByTime(31000)
      useStatusHeuristicsStore.getState().runPollCheck()

      expect(useStatusHeuristicsStore.getState().buffers['se-1'].lastStatus).toBe('idle')
    })

    it('does not mark running agents as idle before timeout', () => {
      useStatusHeuristicsStore.getState().feedOutput('se-1', 'Building...')

      vi.advanceTimersByTime(5000)
      useStatusHeuristicsStore.getState().runPollCheck()

      expect(useStatusHeuristicsStore.getState().buffers['se-1'].lastStatus).toBe('running')
    })

    it('uses configurable idle timeout', () => {
      useStatusHeuristicsStore.getState().setIdleTimeout(10)
      useStatusHeuristicsStore.getState().feedOutput('se-1', 'Building...')

      vi.advanceTimersByTime(15000) // Past 10s timeout
      useStatusHeuristicsStore.getState().runPollCheck()

      expect(useStatusHeuristicsStore.getState().buffers['se-1'].lastStatus).toBe('idle')
    })

    it('does nothing for error/idle agents', () => {
      useStatusHeuristicsStore.getState().feedOutput('se-1', 'Error: failed')
      useStatusHeuristicsStore.getState().feedOutput('se-2', 'Build complete')

      vi.advanceTimersByTime(60000)
      useStatusHeuristicsStore.getState().runPollCheck()

      // Error and idle status should remain unchanged
      expect(useStatusHeuristicsStore.getState().buffers['se-1'].lastStatus).toBe('error')
    })
  })

  // ── Polling lifecycle ───────────────────────────────────────────────────

  describe('polling lifecycle', () => {
    it('startStatusPolling sets up interval', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval')
      startStatusPolling(5000)

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5000)
      setIntervalSpy.mockRestore()
    })

    it('startStatusPolling is idempotent', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval')
      startStatusPolling(5000)
      startStatusPolling(5000)

      expect(setIntervalSpy).toHaveBeenCalledTimes(1)
      setIntervalSpy.mockRestore()
    })

    it('stopStatusPolling clears the interval', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval')
      startStatusPolling(5000)
      stopStatusPolling()

      expect(clearIntervalSpy).toHaveBeenCalled()
      clearIntervalSpy.mockRestore()
    })
  })

  // ── Edge cases ──────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles rapid output from multiple agents', () => {
      useStatusHeuristicsStore.getState().feedOutput('se-1', 'Building...')
      useStatusHeuristicsStore.getState().feedOutput('tl-1', 'Reviewing...')
      useStatusHeuristicsStore.getState().feedOutput('se-1', 'Error: build failed')
      useStatusHeuristicsStore.getState().feedOutput('sec-1', 'Scanning...')

      const buffers = useStatusHeuristicsStore.getState().buffers
      expect(buffers['se-1'].recentOutput).toHaveLength(2)
      expect(buffers['se-1'].lastStatus).toBe('error')
      expect(buffers['tl-1'].lastStatus).toBe('running')
      expect(buffers['sec-1'].lastStatus).toBe('running')
    })

    it('handles empty string output', () => {
      useStatusHeuristicsStore.getState().feedOutput('se-1', '')

      expect(useStatusHeuristicsStore.getState().buffers['se-1']).toBeDefined()
      expect(useStatusHeuristicsStore.getState().buffers['se-1'].recentOutput[0]).toBe('')
    })

    it('status transitions correctly: null → running → error → idle', () => {
      const checkStatus = () => useStatusHeuristicsStore.getState().buffers['se-1']?.lastStatus

      expect(checkStatus()).toBeUndefined()

      useStatusHeuristicsStore.getState().feedOutput('se-1', 'Building...')
      expect(checkStatus()).toBe('running')

      useStatusHeuristicsStore.getState().feedOutput('se-1', 'Error: build failed')
      expect(checkStatus()).toBe('error')

      useStatusHeuristicsStore.getState().feedOutput('se-1', 'Build complete')
      expect(checkStatus()).toBe('idle')
    })
  })
})
