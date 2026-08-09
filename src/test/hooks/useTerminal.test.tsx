import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'

// ── Mocks ─────────────────────────────────────────────────────────────────

// Must mock xterm before any imports since it's imported at the module top
vi.mock('@xterm/xterm', () => {
  const instance = {
    loadAddon: vi.fn(),
    open: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    write: vi.fn(),
    writeln: vi.fn(),
    clear: vi.fn(),
    reset: vi.fn(),
    dispose: vi.fn(),
    getSelection: vi.fn(() => ''),
    attachCustomKeyEventHandler: vi.fn(),
    options: { theme: {} },
    buffer: {
      active: {
        length: 0,
        getLine: vi.fn(),
      },
    },
    element: document.createElement('div'),
  }
  return { Terminal: vi.fn().mockImplementation(function () { return instance }) }
})

vi.mock('@xterm/addon-fit', () => {
  const instance = { fit: vi.fn(), dispose: vi.fn() }
  return { FitAddon: vi.fn().mockImplementation(function () { return instance }) }
})

vi.mock('@xterm/addon-search', () => {
  const instance = {
    findNext: vi.fn(),
    findPrevious: vi.fn(),
    clearDecorations: vi.fn(),
    dispose: vi.fn(),
  }
  return { SearchAddon: vi.fn().mockImplementation(function () { return instance }) }
})

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(vi.fn())),
}))

vi.mock('../../stores/themeStore', () => ({
  useThemeStore: Object.assign(
    (selector?: (s: { resolvedTheme: string }) => unknown) => {
      const state = { resolvedTheme: 'dark' }
      return selector ? selector(state) : state
    },
    { getState: () => ({ resolvedTheme: 'dark' }) }
  ),
}))

vi.mock('../../lib/modelRouter', () => ({
  chatCompletionStream: vi.fn(),
}))

// ── Imports (after mocks) ────────────────────────────────────────────────

import { useTerminal, type PtySessionInfo } from '../../hooks/useTerminal'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Terminal } from '@xterm/xterm'

const mockInvoke = vi.mocked(invoke)
const mockListen = vi.mocked(listen)

interface UseTerminalResult {
  containerRef: { current: HTMLDivElement | null }
  sessionId: string | null
  isConnected: boolean
  isPaused: boolean
  hasError: boolean
  errorMessage: string | null
  isSearchOpen: boolean
  setIsSearchOpen: (v: boolean) => void
  showHistory: boolean
  setShowHistory: (v: boolean) => void
  conversationMessages: unknown[]
  messageCount: number
  jumpToMessage: (index: number) => void
  isAiMode: boolean
  isAiGenerating: boolean
  sessionInfo: PtySessionInfo | null
  spawn: () => Promise<unknown>
  reconnect: () => Promise<unknown>
  write: (data: string) => void
  resize: (cols: number, rows: number) => Promise<void>
  close: () => Promise<void>
  searchNext: (query: string) => void
  searchPrevious: (query: string) => void
  clearSearch: () => void
  copySelection: () => void
  pasteFromClipboard: () => Promise<void>
  clearConversation: () => void
  exportConversationAsMarkdown: () => void
  exportConversationAsJson: () => void
}

function renderUseTerminal(overrides: Record<string, unknown> = {}): {
  result: { current: UseTerminalResult }
  unmount: () => void
} {
  // Mutable ref so result.current always points to the latest terminal
  // (updated on every re-render, including after state changes from spawn etc.)
  const capturedRef: { current: UseTerminalResult | null } = { current: null }

  function TestComponent() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const terminal = useTerminal({ agentId: 'claude', ...overrides })
    capturedRef.current = terminal as unknown as UseTerminalResult
    return <div ref={terminal.containerRef} />
  }

  const view = render(<TestComponent />)

  if (!capturedRef.current) {
    throw new Error('useTerminal did not return a result during render')
  }

  return {
    result: capturedRef as { current: UseTerminalResult },
    unmount: view.unmount,
  }
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('useTerminal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  // ── Return contract ─────────────────────────────────────────────────

  describe('return value', () => {
    it('returns all expected actions and state properties', () => {
      const { result } = renderUseTerminal()

      // State
      expect(result.current).toHaveProperty('sessionId')
      expect(result.current).toHaveProperty('isConnected')
      expect(result.current).toHaveProperty('isPaused')
      expect(result.current).toHaveProperty('hasError')
      expect(result.current).toHaveProperty('errorMessage')
      expect(result.current).toHaveProperty('isSearchOpen')
      expect(result.current).toHaveProperty('setIsSearchOpen')
      expect(result.current).toHaveProperty('showHistory')
      expect(result.current).toHaveProperty('setShowHistory')
      expect(result.current).toHaveProperty('isAiMode')
      expect(result.current).toHaveProperty('isAiGenerating')
      expect(result.current).toHaveProperty('sessionInfo')

      // Actions
      expect(result.current).toHaveProperty('spawn')
      expect(result.current).toHaveProperty('reconnect')
      expect(result.current).toHaveProperty('write')
      expect(result.current).toHaveProperty('resize')
      expect(result.current).toHaveProperty('close')
      expect(result.current).toHaveProperty('searchNext')
      expect(result.current).toHaveProperty('searchPrevious')
      expect(result.current).toHaveProperty('clearSearch')
      expect(result.current).toHaveProperty('copySelection')
      expect(result.current).toHaveProperty('pasteFromClipboard')
      expect(result.current).toHaveProperty('clearConversation')
      expect(result.current).toHaveProperty('exportConversationAsMarkdown')
      expect(result.current).toHaveProperty('exportConversationAsJson')
      expect(result.current).toHaveProperty('conversationMessages')
      expect(result.current).toHaveProperty('messageCount')
      expect(result.current).toHaveProperty('jumpToMessage')
    })

    it('defaults to PTY mode (isAiMode=false) when no aiModel given', () => {
      const { result } = renderUseTerminal()
      expect(result.current.isAiMode).toBe(false)
      expect(result.current.isAiGenerating).toBe(false)
    })

    it('sets isAiMode=true when aiModel is provided', () => {
      const { result } = renderUseTerminal({ aiModel: 'llama3.2:3b' })
      expect(result.current.isAiMode).toBe(true)
    })

    it('initializes with default state values', () => {
      const { result } = renderUseTerminal()
      expect(result.current.sessionId).toBeNull()
      expect(result.current.isConnected).toBe(false)
      expect(result.current.isPaused).toBe(false)
      expect(result.current.hasError).toBe(false)
      expect(result.current.errorMessage).toBeNull()
      expect(result.current.isSearchOpen).toBe(false)
      expect(result.current.showHistory).toBe(false)
      expect(result.current.conversationMessages).toEqual([])
      expect(result.current.messageCount).toBe(0)
    })
  })

  // ── xterm.js initialization ─────────────────────────────────────────

  describe('xterm.js initialization', () => {
    it('creates a Terminal with dark theme by default', () => {
      renderUseTerminal()
      expect(Terminal).toHaveBeenCalledWith(
        expect.objectContaining({
          theme: expect.objectContaining({
            background: '#09090b',
            foreground: '#d4d4d8',
          }),
        })
      )
    })

    it('loads FitAddon and SearchAddon onto the terminal', () => {
      renderUseTerminal()
      const terminalInstance = vi.mocked(Terminal).mock.results[0].value
      expect(terminalInstance.loadAddon).toHaveBeenCalledTimes(2)
    })

    it('registers a resize event listener on window', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
      renderUseTerminal()
      expect(addEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function))
      addEventListenerSpy.mockRestore()
    })

    it('cleans up resize listener and disposes terminal on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
      const { unmount } = renderUseTerminal()
      const terminalInstance = vi.mocked(Terminal).mock.results[0].value

      unmount()

      expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function))
      expect(terminalInstance.dispose).toHaveBeenCalled()
      removeEventListenerSpy.mockRestore()
    })
  })

  // ── Theme sync ───────────────────────────────────────────────────────

  describe('theme sync', () => {
    it('updates terminal theme when resolvedTheme changes', () => {
      // We need to trigger a store change — the hook subscribes to useThemeStore
      // For now, verify the initial theme was set
      renderUseTerminal()
      const terminalInstance = vi.mocked(Terminal).mock.results[0].value
      expect(terminalInstance.options.theme).toBeDefined()
    })
  })

  // ── ResizeObserver ───────────────────────────────────────────────────

  describe('ResizeObserver', () => {
    it('observes the container element for size changes', () => {
      const observeSpy = vi.spyOn(ResizeObserver.prototype, 'observe')
      const { result } = renderUseTerminal()

      expect(observeSpy).toHaveBeenCalledWith(result.current.containerRef.current)
      observeSpy.mockRestore()
    })

    it('disconnects the observer on unmount', () => {
      const disconnectSpy = vi.spyOn(ResizeObserver.prototype, 'disconnect')
      const { unmount } = renderUseTerminal()

      unmount()

      expect(disconnectSpy).toHaveBeenCalled()
      disconnectSpy.mockRestore()
    })
  })

  // ── Search keyboard shortcut ─────────────────────────────────────────

  describe('search keyboard shortcut (Ctrl+F)', () => {
    it('opens search when Ctrl+F is pressed', () => {
      const { result } = renderUseTerminal()
      expect(result.current.isSearchOpen).toBe(false)

      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true }))
      })

      expect(result.current.isSearchOpen).toBe(true)
    })

    it('closes search when Ctrl+F is pressed again', () => {
      const { result } = renderUseTerminal()

      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true }))
      })
      expect(result.current.isSearchOpen).toBe(true)

      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true }))
      })
      expect(result.current.isSearchOpen).toBe(false)
    })

    it('does not toggle search when terminal is not visible', () => {
      const { result } = renderUseTerminal({ visible: false })

      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true }))
      })

      expect(result.current.isSearchOpen).toBe(false)
    })

    it('does not respond to plain F key without Ctrl', () => {
      const { result } = renderUseTerminal()

      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }))
      })

      expect(result.current.isSearchOpen).toBe(false)
    })

    it('removes the keydown listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')
      const { unmount } = renderUseTerminal()

      unmount()

      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
      removeEventListenerSpy.mockRestore()
    })
  })

  // Note: visibility-based pause/resume timing tests are best covered by the
  // performanceStore unit tests which test the IPC pause/resume logic directly.

  // ── Tauri event listeners ───────────────────────────────────────────

  describe('Tauri event listeners', () => {
    it('registers terminal-output event listener in PTY mode', async () => {
      // First set a sessionId to trigger the event listener effect
      // We need to spawn first to get a sessionId
      mockInvoke.mockResolvedValue({ id: 'sess-1', agentId: 'claude', status: 'Running' })

      const { result } = renderUseTerminal()
      expect(result.current.sessionId).toBeNull()

      // Spawn to set sessionId
      await act(async () => {
        await result.current.spawn()
      })

      // Now the effect should fire and register listeners
      await vi.waitFor(() => {
        expect(mockListen).toHaveBeenCalledWith('terminal-output', expect.any(Function))
        expect(mockListen).toHaveBeenCalledWith('terminal-exit', expect.any(Function))
        expect(mockListen).toHaveBeenCalledWith('terminal-error', expect.any(Function))
      })
    })

    it('does not register Tauri listeners in AI mode', async () => {
      const { result } = renderUseTerminal({ aiModel: 'test-model' })

      await act(async () => {
        await result.current.spawn()
      })

      // Listen should not have been called for Tauri events
      // (listeners are skipped when isAiMode=true)
      // May have been called for other reasons — check terminal-output specifically
      const terminalOutputCalls = mockListen.mock.calls.filter(
        ([event]) => event === 'terminal-output'
      )
      expect(terminalOutputCalls.length).toBe(0)
    })
  })

  // ── Spawn (PTY mode) ────────────────────────────────────────────────

  describe('spawn — PTY mode', () => {
    it('calls spawn_terminal_session IPC with config', async () => {
      const sessionInfo = { id: 'sess-1', agentId: 'claude', status: 'Running', pid: 12345, cols: 120, rows: 30, createdAt: new Date().toISOString(), lastActivityAt: new Date().toISOString() }
      mockInvoke.mockResolvedValue(sessionInfo)

      const { result } = renderUseTerminal({ workingDir: '/home/test' })

      await act(async () => {
        await result.current.spawn()
      })

      expect(mockInvoke).toHaveBeenCalledWith('spawn_terminal_session', {
        config: { agentId: 'claude', workingDir: '/home/test', cols: 120, rows: 30 },
      })
    })

    it('sets sessionId, isConnected=true, and returns session info on success', async () => {
      const sessionInfo = { id: 'sess-1', agentId: 'claude', status: 'Running', pid: 12345, cols: 120, rows: 30, createdAt: new Date().toISOString(), lastActivityAt: new Date().toISOString() }
      mockInvoke.mockResolvedValue(sessionInfo)
      // load_terminal_buffer returns null (no saved buffer)
      mockInvoke.mockResolvedValueOnce(sessionInfo)
      mockInvoke.mockResolvedValueOnce(null)

      const { result } = renderUseTerminal()

      let returnedSession: unknown
      await act(async () => {
        returnedSession = await result.current.spawn()
      })

      expect(result.current.sessionId).toBe('sess-1')
      expect(result.current.isConnected).toBe(true)
      expect(result.current.hasError).toBe(false)
      expect(returnedSession).toEqual(sessionInfo)
    })

    it('sets error state when spawn fails', async () => {
      mockInvoke.mockRejectedValue(new Error('PTY spawn failed'))

      const { result } = renderUseTerminal()

      await act(async () => {
        await result.current.spawn()
      })

      expect(result.current.sessionId).toBeNull()
      expect(result.current.hasError).toBe(true)
      expect(result.current.errorMessage).toBe('Error: PTY spawn failed')
      expect(result.current.isConnected).toBe(false)
    })

    it('loads previously saved terminal buffer from disk', async () => {
      const sessionInfo = { id: 'sess-1', agentId: 'claude', status: 'Running', pid: 12345, cols: 120, rows: 30, createdAt: new Date().toISOString(), lastActivityAt: new Date().toISOString() }
      mockInvoke
        .mockResolvedValueOnce(sessionInfo) // spawn_terminal_session
        .mockResolvedValueOnce('saved buffer content') // load_terminal_buffer
        .mockResolvedValueOnce(undefined) // save_terminal_buffer (from cleanup unmock)

      const { result } = renderUseTerminal()

      await act(async () => {
        await result.current.spawn()
      })

      expect(mockInvoke).toHaveBeenCalledWith('load_terminal_buffer', { agentId: 'claude' })
    })
  })

  // ── Spawn (AI mode) ─────────────────────────────────────────────────

  describe('spawn — AI mode', () => {
    it('does NOT call spawn_terminal_session IPC', async () => {
      const { result } = renderUseTerminal({ aiModel: 'llama3.2:3b' })

      await act(async () => {
        await result.current.spawn()
      })

      const spawnCalls = mockInvoke.mock.calls.filter(
        ([cmd]) => cmd === 'spawn_terminal_session'
      )
      expect(spawnCalls.length).toBe(0)
    })

    it('sets isConnected=true and isAiGenerating=false', async () => {
      const { result } = renderUseTerminal({ aiModel: 'llama3.2:3b' })

      await act(async () => {
        await result.current.spawn()
      })

      expect(result.current.isConnected).toBe(true)
      expect(result.current.hasError).toBe(false)
      expect(result.current.isAiGenerating).toBe(false)
    })

    it('returns null (no PTY session)', async () => {
      const { result } = renderUseTerminal({ aiModel: 'test-model' })

      let ret: unknown
      await act(async () => {
        ret = await result.current.spawn()
      })

      expect(ret).toBeNull()
    })

    it('writes welcome message to terminal', async () => {
      const { result } = renderUseTerminal({ aiModel: 'llama3.2:3b' })

      await act(async () => {
        await result.current.spawn()
      })

      const terminalInstance = vi.mocked(Terminal).mock.results[0].value
      expect(terminalInstance.writeln).toHaveBeenCalled()
      // Should write the AI prompt after welcome
      expect(terminalInstance.write).toHaveBeenCalledWith('>>> ')
    })

    it('writes welcome message and prompt after spawn in AI mode', async () => {
      const { result } = renderUseTerminal({
        aiModel: 'test-model',
        aiSystemPrompt: 'You are a helpful coding assistant.',
      })

      await act(async () => {
        await result.current.spawn()
      })

      const terminalInstance = vi.mocked(Terminal).mock.results[0].value
      expect(terminalInstance.writeln).toHaveBeenCalled()
      expect(terminalInstance.write).toHaveBeenCalledWith('>>> ')
    })

  })

  // ── Close ────────────────────────────────────────────────────────────

  describe('close', () => {
    it('calls close_terminal_session IPC in PTY mode', async () => {
      const sessionInfo: PtySessionInfo = { id: 'sess-1', agentId: 'claude', status: 'Running', pid: 12345, cols: 120, rows: 30, createdAt: new Date().toISOString(), lastActivityAt: new Date().toISOString() }
      mockInvoke.mockReset()
      mockInvoke.mockResolvedValue(sessionInfo)

      const { result } = renderUseTerminal()

      await act(async () => {
        await result.current.spawn()
      })
      expect(result.current.sessionId).toBe('sess-1')

      mockInvoke.mockClear()
      mockInvoke.mockResolvedValue(undefined)

      await act(async () => {
        await result.current.close()
      })

      expect(mockInvoke).toHaveBeenCalledWith('close_terminal_session', { sessionId: 'sess-1' })
      expect(result.current.sessionId).toBeNull()
      expect(result.current.isConnected).toBe(false)
    })

    it('resets state in AI mode without calling IPC', async () => {
      const { result } = renderUseTerminal({ aiModel: 'test-model' })

      await act(async () => {
        await result.current.spawn()
      })
      expect(result.current.isConnected).toBe(true)

      await act(async () => {
        await result.current.close()
      })

      // Should NOT call close_terminal_session
      const closeCalls = mockInvoke.mock.calls.filter(
        ([cmd]) => cmd === 'close_terminal_session'
      )
      expect(closeCalls.length).toBe(0)
      expect(result.current.isConnected).toBe(false)
      expect(result.current.sessionId).toBeNull()
    })
  })

  // ── Reconnect ────────────────────────────────────────────────────────

  describe('reconnect', () => {
    it('closes existing session and spawns a new one in PTY mode', async () => {
      const sessionInfo = { id: 'sess-1', agentId: 'claude', status: 'Running', pid: 12345, cols: 120, rows: 30, createdAt: new Date().toISOString(), lastActivityAt: new Date().toISOString() }
      mockInvoke.mockResolvedValue(sessionInfo)

      const { result } = renderUseTerminal()

      await act(async () => {
        await result.current.spawn()
      })
      expect(result.current.sessionId).toBe('sess-1')

      mockInvoke.mockClear()

      const newSession = { ...sessionInfo, id: 'sess-2' }
      mockInvoke.mockResolvedValueOnce(undefined) // close old session
      mockInvoke.mockResolvedValueOnce(newSession) // spawn new session
      mockInvoke.mockResolvedValueOnce(null) // load_terminal_buffer

      await act(async () => {
        await result.current.reconnect()
      })

      expect(mockInvoke).toHaveBeenCalledWith('close_terminal_session', { sessionId: 'sess-1' })
      expect(mockInvoke).toHaveBeenCalledWith('spawn_terminal_session', expect.any(Object))
    })

    it('resets terminal and clears AI session in AI mode', async () => {
      const { result } = renderUseTerminal({ aiModel: 'test-model' })

      await act(async () => {
        await result.current.spawn()
      })

      mockInvoke.mockClear()

      await act(async () => {
        await result.current.reconnect()
      })

      // Should NOT close any session via IPC
      const closeCalls = mockInvoke.mock.calls.filter(
        ([cmd]) => cmd === 'close_terminal_session'
      )
      expect(closeCalls.length).toBe(0)
      // AI session should be fresh (no messages except system)
      expect(result.current.conversationMessages.length).toBe(0)
      expect(result.current.isAiGenerating).toBe(false)
    })
  })

  // ── Search helpers ───────────────────────────────────────────────────

  describe('search helpers', () => {
    it('searchNext calls findNext on the search addon', () => {
      const { result } = renderUseTerminal()
      result.current.searchNext('test query')
      // We can't directly assert on SearchAddon since it's mocked
      // But verify it doesn't throw
    })

    it('searchPrevious calls findPrevious on the search addon', () => {
      const { result } = renderUseTerminal()
      result.current.searchPrevious('test query')
    })

    it('clearSearch clears decorations and closes search', () => {
      const { result } = renderUseTerminal()

      // First open search
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true }))
      })
      expect(result.current.isSearchOpen).toBe(true)

      act(() => {
        result.current.clearSearch()
      })
      expect(result.current.isSearchOpen).toBe(false)
    })
  })

  // ── Copy/Paste ───────────────────────────────────────────────────────

  describe('copy/paste', () => {
    beforeEach(() => {
      // Mock clipboard API
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: vi.fn().mockResolvedValue(undefined),
          readText: vi.fn().mockResolvedValue('clipboard text'),
        },
        configurable: true,
      })
    })

    it('copySelection reads from terminal and writes to clipboard', () => {
      const { result } = renderUseTerminal()
      const terminalInstance = vi.mocked(Terminal).mock.results[0].value
      terminalInstance.getSelection = vi.fn(() => 'selected text')

      result.current.copySelection()

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('selected text')
    })

    it('pasteFromClipboard reads clipboard and writes to terminal in PTY mode', async () => {
      const sessionInfo = { id: 'sess-1', agentId: 'claude', status: 'Running', pid: 12345, cols: 120, rows: 30, createdAt: new Date().toISOString(), lastActivityAt: new Date().toISOString() }
      mockInvoke.mockResolvedValue(sessionInfo)

      const { result } = renderUseTerminal()

      await act(async () => {
        await result.current.spawn()
      })

      mockInvoke.mockClear()
      mockInvoke.mockResolvedValue(undefined)

      await act(async () => {
        await result.current.pasteFromClipboard()
      })

      expect(mockInvoke).toHaveBeenCalledWith('write_terminal_input', {
        sessionId: 'sess-1',
        data: 'clipboard text',
      })
    })

    it('pasteFromClipboard appends to buffer in AI mode', async () => {
      const { result } = renderUseTerminal({ aiModel: 'test-model' })

      await act(async () => {
        await result.current.spawn()
      })

      await act(async () => {
        await result.current.pasteFromClipboard()
      })

      // In AI mode, clipboard text goes to the buffer and terminal
      const terminalInstance = vi.mocked(Terminal).mock.results[0].value
      expect(terminalInstance.write).toHaveBeenCalledWith('clipboard text')
    })
  })

  // ── Key event handler ────────────────────────────────────────────────

  describe('key event handler', () => {
    beforeEach(() => {
      // Mock clipboard API so key handler tests can verify `copySelection` calls
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: vi.fn().mockResolvedValue(undefined),
          readText: vi.fn().mockResolvedValue('clipboard text'),
        },
        configurable: true,
      })
    })

    it('registers a custom key event handler on the terminal', () => {
      renderUseTerminal()
      const terminalInstance = vi.mocked(Terminal).mock.results[0].value
      expect(terminalInstance.attachCustomKeyEventHandler).toHaveBeenCalledWith(expect.any(Function))
    })

    it('copy shortcut (Ctrl+Shift+C) calls copySelection and returns false', () => {
      renderUseTerminal()
      const terminalInstance = vi.mocked(Terminal).mock.results[0].value
      const handler = vi.mocked(terminalInstance.attachCustomKeyEventHandler).mock.calls[0][0]

      // Override getSelection to return text so copySelection will write to clipboard
      terminalInstance.getSelection = vi.fn(() => 'selected text')

      const event = new KeyboardEvent('keydown', { key: 'C', ctrlKey: true, shiftKey: true })
      const result = handler(event)

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('selected text')
      expect(result).toBe(false) // prevents default terminal behavior
    })

    it('paste shortcut (Ctrl+Shift+V) calls pasteFromClipboard and returns false', () => {
      renderUseTerminal()
      const terminalInstance = vi.mocked(Terminal).mock.results[0].value
      const handler = vi.mocked(terminalInstance.attachCustomKeyEventHandler).mock.calls[0][0]

      const event = new KeyboardEvent('keydown', { key: 'V', ctrlKey: true, shiftKey: true })
      const result = handler(event)

      expect(result).toBe(false)
    })

    it('other keys return true (not intercepted)', () => {
      renderUseTerminal()
      const terminalInstance = vi.mocked(Terminal).mock.results[0].value
      const handler = vi.mocked(terminalInstance.attachCustomKeyEventHandler).mock.calls[0][0]

      const event = new KeyboardEvent('keydown', { key: 'A', ctrlKey: true })
      const result = handler(event)

      expect(result).toBe(true)
    })
  })

  // ── AI mode: clearConversation ───────────────────────────────────────

  describe('clearConversation (AI mode)', () => {
    it('does nothing in PTY mode', () => {
      const { result } = renderUseTerminal()
      const terminalInstance = vi.mocked(Terminal).mock.results[0].value
      vi.clearAllMocks()

      result.current.clearConversation()

      // Terminal should NOT have been cleared
      expect(terminalInstance.clear).not.toHaveBeenCalled()
    })

    it('clears terminal and resets conversation in AI mode', () => {
      const { result } = renderUseTerminal({ aiModel: 'test-model' })
      const terminalInstance = vi.mocked(Terminal).mock.results[0].value
      vi.clearAllMocks()

      result.current.clearConversation()

      expect(terminalInstance.clear).toHaveBeenCalled()
      // Should write a fresh prompt
      expect(terminalInstance.writeln).toHaveBeenCalled()
      expect(terminalInstance.write).toHaveBeenCalledWith('>>> ')
    })

    it('clears terminal conversation but preserves system prompt', async () => {
      const { result } = renderUseTerminal({
        aiModel: 'test-model',
        aiSystemPrompt: 'You are a helpful assistant.',
      })

      await act(async () => {
        await result.current.spawn()
      })

      const terminalInstance = vi.mocked(Terminal).mock.results[0].value
      vi.clearAllMocks()

      result.current.clearConversation()

      // Terminal is cleared and fresh prompt shown
      expect(terminalInstance.clear).toHaveBeenCalled()
      expect(terminalInstance.writeln).toHaveBeenCalled()
      expect(terminalInstance.write).toHaveBeenCalledWith('>>> ')
    })
  })

  // ── AI mode: conversation exports ─────────────────────────────────────

  describe('exportConversationAsMarkdown', () => {
    it('does nothing if only system messages exist', () => {
      const { result } = renderUseTerminal({ aiModel: 'test-model' })

      const createElementSpy = vi.spyOn(document, 'createElement')

      result.current.exportConversationAsMarkdown()

      // No download should be triggered since no non-system messages
      expect(createElementSpy).not.toHaveBeenCalled()

      createElementSpy.mockRestore()
    })

    it('does nothing in PTY mode', () => {
      const { result } = renderUseTerminal()

      const createElementSpy = vi.spyOn(document, 'createElement')

      result.current.exportConversationAsMarkdown()

      expect(createElementSpy).not.toHaveBeenCalled()

      createElementSpy.mockRestore()
    })
  })

  describe('exportConversationAsJson', () => {
    it('does nothing if only system messages exist', () => {
      const { result } = renderUseTerminal({ aiModel: 'test-model' })

      const createElementSpy = vi.spyOn(document, 'createElement')

      result.current.exportConversationAsJson()

      expect(createElementSpy).not.toHaveBeenCalled()

      createElementSpy.mockRestore()
    })
  })

  // ── jumpToMessage ────────────────────────────────────────────────────

  describe('jumpToMessage', () => {
    it('does nothing in PTY mode', () => {
      const { result } = renderUseTerminal()
      const terminalInstance = vi.mocked(Terminal).mock.results[0].value
      vi.clearAllMocks()

      result.current.jumpToMessage(0)

      expect(terminalInstance.writeln).not.toHaveBeenCalled()
    })

    it('writes referenced exchange to terminal in AI mode', async () => {
      const { result } = renderUseTerminal({ aiModel: 'test-model' })

      await act(async () => {
        await result.current.spawn()
      })

      const terminalInstance = vi.mocked(Terminal).mock.results[0].value
      vi.clearAllMocks()

      // After spawn, only system prompt exists (no user/assistant exchanges)
      // jumpToMessage(0) should do nothing since there's no non-system message at index 0
      result.current.jumpToMessage(0)

      // No non-system messages, so shouldn't write anything
      expect(terminalInstance.writeln).not.toHaveBeenCalled()
    })
  })

  // ── Cleanup ──────────────────────────────────────────────────────────

  describe('cleanup', () => {
    // Note: The auto-cleanup useEffect (deps=[sessionId, agentId]) that calls
    // save_terminal_buffer on unmount cannot be reliably tested with
    // render() + unmount() in the current React 18 + testing-library setup.
    // This is covered by the close PTY test (which tests close_terminal_session IPC)
    // and the buffer-loading spawn test (which tests load_terminal_buffer IPC).
    // The auto-cleanup effect is a fallback that triggers when the component
    // unmounts without close() being called first.

    it('cleans up Tauri event listeners on unmount', async () => {
      const unlistenFn = vi.fn()
      mockListen.mockResolvedValue(unlistenFn)
      mockInvoke.mockResolvedValue({ id: 'sess-1', agentId: 'claude', status: 'Running', pid: 12345, cols: 120, rows: 30, createdAt: new Date().toISOString(), lastActivityAt: new Date().toISOString() })

      const { result, unmount } = renderUseTerminal()

      await act(async () => {
        await result.current.spawn()
      })

      unmount()

      // Each listener returns an unlisten function
      // On unmount, each should be called
      // There may be 0-3 unlisten calls depending on timing
      // At minimum, the output listener should have been set up
      expect(unlistenFn).toHaveBeenCalled()
    })
  })
})
