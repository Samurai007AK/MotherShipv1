import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ── Hoisted: shared mock state available before module-level code ──
const { unlistenMock, storeState } = vi.hoisted(() => ({
  unlistenMock: vi.fn(),
  storeState: { agentId: 'claude' as string | null },
}))

// ── Hoisted mocks ──
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(unlistenMock)),
}))

vi.mock('../../stores/agentStore', () => ({
  useAgentStore: Object.assign(
    (selector?: (s: { activeAgentId: string | null }) => any) => {
      const state = { activeAgentId: storeState.agentId }
      return selector ? selector(state) : state
    },
    { getState: () => ({ activeAgentId: storeState.agentId }) }
  ),
}))

// ── Imports ──
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useContextCapture } from '../../hooks/useContextCapture'

// ── Typed mock references ──
const mockInvoke = vi.mocked(invoke)
const mockListen = vi.mocked(listen)

// ── Helpers ──

function getTerminalListener(): ((event: any) => void) | undefined {
  return mockListen.mock.calls[0]?.[1]
}

function emitTerminalEvent(data: string, sessionId = 's1') {
  const cb = getTerminalListener()
  if (!cb) throw new Error('No terminal-output listener registered — render hook first')
  cb({ payload: { sessionId, data } })
}

/** Low threshold + no dedup for predictable terminal tests. */
const DEFAULT_TERMINAL_CONFIG = {
  config: { outputThreshold: 1, dedupWindow: 0 },
}

// ── Tests ──

describe('useContextCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState.agentId = 'claude'
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ── Basic contract ──

  it('returns a capture function', () => {
    const { result } = renderHook(() => useContextCapture())
    expect(result.current).toHaveProperty('capture')
    expect(typeof result.current.capture).toBe('function')
  })

  // ── Listener setup ──

  it('registers a terminal-output event listener on mount', async () => {
    renderHook(() => useContextCapture())

    await waitFor(() => {
      expect(getTerminalListener()).toBeDefined()
    })
  })

  it('calls listen with "terminal-output"', async () => {
    renderHook(() => useContextCapture())

    await waitFor(() => {
      expect(mockListen).toHaveBeenCalledWith('terminal-output', expect.any(Function))
    })
  })

  // ── Terminal output threshold ──

  it('triggers terminal_output capture when output exceeds the threshold', async () => {
    renderHook(() => useContextCapture(DEFAULT_TERMINAL_CONFIG))

    await waitFor(() => {
      expect(getTerminalListener()).toBeDefined()
    })

    act(() => {
      emitTerminalEvent('hello world')
    })

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'save_context_snapshot',
        expect.objectContaining({
          snapshot: expect.objectContaining({
            trigger: 'terminal_output',
            agentId: 'claude',
            outputTail: 'hello world',
          }),
        })
      )
    })
  })

  it('does NOT trigger capture below the threshold', async () => {
    renderHook(() => useContextCapture({ config: { outputThreshold: 1000 } }))

    await waitFor(() => {
      expect(getTerminalListener()).toBeDefined()
    })

    act(() => {
      emitTerminalEvent('short')
    })

    // Settle microtasks
    await new Promise((r) => setTimeout(r, 50))

    expect(mockInvoke).not.toHaveBeenCalled()
  })

  // ── Git activity ──

  it('triggers git_activity capture when terminal output contains a git command', async () => {
    renderHook(() => useContextCapture(DEFAULT_TERMINAL_CONFIG))

    await waitFor(() => {
      expect(getTerminalListener()).toBeDefined()
    })

    act(() => {
      emitTerminalEvent('$ git commit -m "fix bug"')
    })

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'save_context_snapshot',
        expect.objectContaining({
          snapshot: expect.objectContaining({
            trigger: 'git_activity',
            agentId: 'claude',
          }),
        })
      )
    })
  })

  it('detects multiple git commands: push, pull, merge, branch, checkout, stash, rebase', async () => {
    const gitCommands = [
      'git push origin main',
      'git pull upstream',
      'git merge feature-branch',
      'git branch new-feature',
      'git checkout -b fix',
      'git stash',
      'git rebase main',
    ]

    for (const cmd of gitCommands) {
      vi.clearAllMocks()
      const { unmount } = renderHook(() => useContextCapture(DEFAULT_TERMINAL_CONFIG))

      await waitFor(() => {
        expect(getTerminalListener()).toBeDefined()
      })

      act(() => {
        emitTerminalEvent(`$ ${cmd}`)
      })

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalled()
      })

      expect(mockInvoke).toHaveBeenCalledWith(
        'save_context_snapshot',
        expect.objectContaining({
          snapshot: expect.objectContaining({ trigger: 'git_activity' }),
        })
      )

      unmount()
    }
  })

  // ── Heartbeat ──

  it('triggers heartbeat capture at the configured interval', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    renderHook(() =>
      useContextCapture({ config: { heartbeatInterval: 60000, outputThreshold: 100000, dedupWindow: 0 } })
    )

    await waitFor(() => {
      expect(getTerminalListener()).toBeDefined()
    })

    const intervalCallback = setIntervalSpy.mock.calls[0][0] as () => void

    act(() => {
      intervalCallback()
    })

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'save_context_snapshot',
        expect.objectContaining({
          snapshot: expect.objectContaining({ trigger: 'heartbeat', agentId: 'claude' }),
        })
      )
    })
  })

  it('does not fire heartbeat when no agent is active', async () => {
    storeState.agentId = null

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    renderHook(() =>
      useContextCapture({ config: { heartbeatInterval: 30000, outputThreshold: 100000 } })
    )

    await waitFor(() => {
      expect(getTerminalListener()).toBeDefined()
    })

    // Fire the interval callback
    const intervalCallback = setIntervalSpy.mock.calls[0][0] as () => void

    act(() => {
      intervalCallback()
    })

    // Settle microtasks
    await new Promise((r) => setTimeout(r, 50))

    expect(mockInvoke).not.toHaveBeenCalled()
  })

  // ── Agent switch ──

  it('triggers agent_switch capture when the active agent changes', async () => {
    const { rerender } = renderHook(() =>
      useContextCapture({ config: { dedupWindow: 0 } })
    )

    await waitFor(() => {
      expect(getTerminalListener()).toBeDefined()
    })

    storeState.agentId = 'gemini'
    rerender()

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'save_context_snapshot',
        expect.objectContaining({
          snapshot: expect.objectContaining({
            trigger: 'agent_switch',
            agentId: 'claude', // previous agent
          }),
        })
      )
    })
  })

  it('does not capture agent_switch on initial mount (no previous agent)', async () => {
    renderHook(() => useContextCapture())

    await waitFor(() => {
      expect(getTerminalListener()).toBeDefined()
    })

    // Settle to let effects complete
    await new Promise((r) => setTimeout(r, 50))

    const invokeCalls = mockInvoke.mock.calls.filter(
      ([cmd]) => cmd === 'save_context_snapshot'
    )
    for (const [, args] of invokeCalls) {
      expect((args as { snapshot: { trigger: string } }).snapshot.trigger).not.toBe('agent_switch')
    }
  })

  // ── Dedup ──

  it('does not deduplicate with dedupWindow: 0 (both events trigger captures)', async () => {
    renderHook(() =>
      useContextCapture({ config: { outputThreshold: 1, dedupWindow: 0 } })
    )

    await waitFor(() => {
      expect(getTerminalListener()).toBeDefined()
    })

    act(() => {
      emitTerminalEvent('first')
    })

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalled()
    })

    act(() => {
      emitTerminalEvent('second')
    })

    // Should have at least 2 captures (could be more from git detection if "git" is matched)
    await waitFor(() => {
      const terminalCalls = mockInvoke.mock.calls.filter(
        ([cmd, args]) =>
          cmd === 'save_context_snapshot' &&
          (args as { snapshot: { trigger: string } }).snapshot.trigger === 'terminal_output'
      )
      expect(terminalCalls.length).toBe(2)
    })
  })

  // ── Custom config ──

  it('uses custom outputThreshold — below threshold: no capture, above: capture fires', async () => {
    const { unmount } = renderHook(() =>
      useContextCapture({ config: { outputThreshold: 100, dedupWindow: 0 } })
    )

    await waitFor(() => {
      expect(getTerminalListener()).toBeDefined()
    })

    // 50 chars — below threshold of 100
    act(() => {
      emitTerminalEvent('a'.repeat(50))
    })

    await new Promise((r) => setTimeout(r, 50))

    const callsAfter50 = mockInvoke.mock.calls.filter(
      ([cmd]) => cmd === 'save_context_snapshot'
    )
    expect(callsAfter50.length).toBe(0)

    // Clean up and mount fresh to avoid captureState residuals
    unmount()
    vi.clearAllMocks()

    renderHook(() =>
      useContextCapture({ config: { outputThreshold: 100, dedupWindow: 0, maxOutputTail: 200 } })
    )

    await waitFor(() => {
      expect(getTerminalListener()).toBeDefined()
    })

    // 150 chars — exceeds threshold of 100
    act(() => {
      emitTerminalEvent('b'.repeat(150))
    })

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'save_context_snapshot',
        expect.objectContaining({
          snapshot: expect.objectContaining({ trigger: 'terminal_output' }),
        })
      )
    })
  })

  it('uses custom heartbeat interval', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    renderHook(() =>
      useContextCapture({
        config: { heartbeatInterval: 5000, outputThreshold: 100000, dedupWindow: 0 },
      })
    )

    await waitFor(() => {
      expect(getTerminalListener()).toBeDefined()
    })

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5000)
  })

  it('truncates outputTail to custom maxOutputTail', async () => {
    renderHook(() =>
      useContextCapture({
        config: { outputThreshold: 1, dedupWindow: 0, maxOutputTail: 2 },
      })
    )

    await waitFor(() => {
      expect(getTerminalListener()).toBeDefined()
    })

    act(() => {
      emitTerminalEvent('line1\nline2\nline3\nline4')
    })

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'save_context_snapshot',
        expect.objectContaining({
          snapshot: expect.objectContaining({
            outputTail: 'line3\nline4',
          }),
        })
      )
    })
  })

  // ── Decision extraction ──

  it('extracts decisions from terminal output and includes them in subsequent capture', async () => {
    renderHook(() =>
      useContextCapture({ config: { outputThreshold: 100, dedupWindow: 0 } })
    )

    await waitFor(() => {
      expect(getTerminalListener()).toBeDefined()
    })

    // Event 1: below threshold (decided keyword) — populates pendingDecisions, no capture
    act(() => {
      emitTerminalEvent('decided to use React Router for routing')
    })

    // Event 2: exceeds threshold — triggers capture WITH pending decisions
    act(() => {
      emitTerminalEvent('z'.repeat(100))
    })

    await waitFor(() => {
      const decisionCall = mockInvoke.mock.calls.find(
        ([cmd, args]) =>
          cmd === 'save_context_snapshot' &&
          (args as { snapshot: { decisions: string[] } }).snapshot.decisions.length > 0
      )
      expect(decisionCall).toBeDefined()
    })
  })

  it('extracts TODO/FIXME/HACK/NOTE/IMPORTANT markers as decisions', async () => {
    renderHook(() =>
      useContextCapture({ config: { outputThreshold: 100, dedupWindow: 0 } })
    )

    await waitFor(() => {
      expect(getTerminalListener()).toBeDefined()
    })

    // Event 1: below threshold (TODO marker) — populates pendingDecisions
    act(() => {
      emitTerminalEvent('TODO: refactor this function into smaller pieces')
    })

    // Event 2: exceeds threshold — triggers capture WITH pending decisions
    act(() => {
      emitTerminalEvent('z'.repeat(100))
    })

    await waitFor(() => {
      const decisionCall = mockInvoke.mock.calls.find(
        ([cmd, args]) =>
          cmd === 'save_context_snapshot' &&
          (
            args as { snapshot: { decisions: string[] } }
          ).snapshot.decisions.some((d: string) => d.includes('TODO'))
      )
      expect(decisionCall).toBeDefined()
    })
  })

  // ── Buffer management ──

  it('limits the internal output buffer to 50,000 chars', async () => {
    renderHook(() =>
      useContextCapture({ config: { outputThreshold: 100000, dedupWindow: 0 } })
    )

    await waitFor(() => {
      expect(getTerminalListener()).toBeDefined()
    })

    // Push 60k chars — triggers trimming to 30k
    act(() => {
      emitTerminalEvent('a'.repeat(60000))
    })

    // Push another 10k — buffer ~40k (under 50k)
    act(() => {
      emitTerminalEvent('b'.repeat(10000))
    })

    // Trigger a capture via git command to inspect outputTail
    act(() => {
      emitTerminalEvent('git commit -m "final"')
    })

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalled()
    })

    const gitCall = mockInvoke.mock.calls.find(
      ([cmd, args]) =>
        cmd === 'save_context_snapshot' &&
        (args as { snapshot: { trigger: string } }).snapshot.trigger === 'git_activity'
    )
    expect(gitCall).toBeDefined()
    const outputTail: string = (gitCall as any[])[1].snapshot.outputTail
    expect(outputTail.split('\n').length).toBeLessThanOrEqual(50)
  })

  // ── Cleanup ──

  it('cleans up the terminal listener on unmount', async () => {
    const { unmount } = renderHook(() => useContextCapture())

    await waitFor(() => {
      expect(getTerminalListener()).toBeDefined()
    })

    unmount()

    expect(unlistenMock).toHaveBeenCalled()
  })

  it('cleans up the heartbeat timer on unmount', async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

    const { unmount } = renderHook(() =>
      useContextCapture({ config: { heartbeatInterval: 30000 } })
    )

    await waitFor(() => {
      expect(getTerminalListener()).toBeDefined()
    })

    unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
  })

  // ── Error handling ──

  it('handles listen failure gracefully without crashing', async () => {
    mockListen.mockRejectedValueOnce(new Error('IPC error'))

    expect(() => {
      renderHook(() => useContextCapture())
    }).not.toThrow()

    // Give the rejected promise time to settle
    await new Promise((r) => setTimeout(r, 50))

    // No snapshot should have been saved since the listener never registered
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('handles invoke failure gracefully (console.warn)', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockInvoke.mockRejectedValueOnce(new Error('Backend unavailable'))

    renderHook(() => useContextCapture(DEFAULT_TERMINAL_CONFIG))

    await waitFor(() => {
      expect(getTerminalListener()).toBeDefined()
    })

    act(() => {
      emitTerminalEvent('test output')
    })

    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to save context snapshot:',
        expect.any(Error)
      )
    })

    consoleWarnSpy.mockRestore()
  })

  // ── Edge cases ──

  it('skips capture when no agent is active', async () => {
    storeState.agentId = null

    renderHook(() => useContextCapture(DEFAULT_TERMINAL_CONFIG))

    await waitFor(() => {
      expect(getTerminalListener()).toBeDefined()
    })

    act(() => {
      emitTerminalEvent('some output')
    })

    await new Promise((r) => setTimeout(r, 50))

    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('calls console.error when listen setup fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockListen.mockRejectedValueOnce(new Error('IPC error'))

    renderHook(() => useContextCapture())

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to set up context capture listener:',
        expect.any(Error)
      )
    })

    consoleErrorSpy.mockRestore()
  })
})
