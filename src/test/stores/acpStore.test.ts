import { describe, it, expect, beforeEach, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { useAcpStore, type AcpCapabilities, type AcpThread, type AcpResponse } from '../../stores/acpStore'

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

const mockInvoke = vi.mocked(invoke)

// ── Fixtures ──────────────────────────────────────────────────────────────

const mockCapabilities: AcpCapabilities = {
  version: '1.0.0',
  streaming: true,
  codeDiff: true,
  tools: true,
  models: ['claude-sonnet-4-20250514'],
}

const mockResponse: AcpResponse = {
  jsonrpc: '2.0',
  id: 'test-thread',
  result: 'Test response content',
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('acpStore', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    useAcpStore.setState({
      threads: [],
      activeThreadId: null,
      isConnecting: false,
    })
  })

  // ── Initial state ───────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts with no threads', () => {
      const state = useAcpStore.getState()
      expect(state.threads).toEqual([])
      expect(state.activeThreadId).toBeNull()
      expect(state.isConnecting).toBe(false)
    })
  })

  // ── connectAgent ────────────────────────────────────────────────────────

  describe('connectAgent', () => {
    it('creates a new thread on successful initialization', async () => {
      mockInvoke.mockResolvedValue(mockCapabilities)

      const threadId = await useAcpStore.getState().connectAgent('se-1', 'Software Engineer')

      expect(mockInvoke).toHaveBeenCalledWith('acp_initialize', {
        threadId,
        agentId: 'se-1',
      })

      const state = useAcpStore.getState()
      expect(state.threads).toHaveLength(1)
      expect(state.threads[0].agentId).toBe('se-1')
      expect(state.threads[0].agentName).toBe('Software Engineer')
      expect(state.threads[0].status).toBe('connected')
      expect(state.threads[0].capabilities).toEqual(mockCapabilities)
      expect(state.activeThreadId).toBe(threadId)
      expect(state.isConnecting).toBe(false)
    })

    it('creates thread with system message on success', async () => {
      mockInvoke.mockResolvedValue(mockCapabilities)

      await useAcpStore.getState().connectAgent('se-1', 'Software Engineer')

      const thread = useAcpStore.getState().threads[0]
      expect(thread.messages).toHaveLength(1)
      expect(thread.messages[0].role).toBe('system')
      expect(thread.messages[0].content).toContain('Connected to Software Engineer')
      expect(thread.messages[0].content).toContain('ACP v1.0.0')
    })

    it('sets isConnecting during connection', async () => {
      let resolvePromise!: (value: AcpCapabilities) => void
      mockInvoke.mockReturnValue(new Promise((resolve) => { resolvePromise = resolve }))

      const connectPromise = useAcpStore.getState().connectAgent('se-1', 'Software Engineer')
      expect(useAcpStore.getState().isConnecting).toBe(true)

      resolvePromise(mockCapabilities)
      await connectPromise

      expect(useAcpStore.getState().isConnecting).toBe(false)
    })

    it('handles IPC failure and creates error thread', async () => {
      mockInvoke.mockRejectedValue(new Error('Connection refused'))

      await useAcpStore.getState().connectAgent('se-1', 'Software Engineer')

      const state = useAcpStore.getState()
      expect(state.threads).toHaveLength(1)
      expect(state.threads[0].status).toBe('error')
      expect(state.threads[0].capabilities).toBeNull()
      expect(state.threads[0].messages[0].content).toContain('Failed to connect')
      expect(state.isConnecting).toBe(false)
    })

    it('reuses existing connected thread for the same agent', async () => {
      mockInvoke.mockResolvedValue(mockCapabilities)

      const firstId = await useAcpStore.getState().connectAgent('se-1', 'Software Engineer')
      const secondId = await useAcpStore.getState().connectAgent('se-1', 'Software Engineer')

      expect(secondId).toBe(firstId)
      expect(useAcpStore.getState().threads).toHaveLength(1)
      // Should NOT have called invoke a second time
      expect(mockInvoke).toHaveBeenCalledTimes(1)
    })

    it('creates separate threads for different agents', async () => {
      mockInvoke.mockResolvedValue(mockCapabilities)

      const id1 = await useAcpStore.getState().connectAgent('se-1', 'Software Engineer')
      const id2 = await useAcpStore.getState().connectAgent('tl-1', 'Tech Lead')

      expect(id1).not.toBe(id2)
      expect(useAcpStore.getState().threads).toHaveLength(2)
      expect(mockInvoke).toHaveBeenCalledTimes(2)
    })
  })

  // ── disconnectAgent ─────────────────────────────────────────────────────

  describe('disconnectAgent', () => {
    it('disconnects an agent and updates status', async () => {
      mockInvoke.mockResolvedValue(mockCapabilities)
      const threadId = await useAcpStore.getState().connectAgent('se-1', 'Software Engineer')

      mockInvoke.mockResolvedValue(undefined)
      await useAcpStore.getState().disconnectAgent(threadId)

      const thread = useAcpStore.getState().threads[0]
      expect(thread.status).toBe('disconnected')
      expect(mockInvoke).toHaveBeenCalledWith('acp_disconnect', { threadId })
    })

    it('handles disconnect IPC failure gracefully', async () => {
      mockInvoke.mockResolvedValue(mockCapabilities)
      const threadId = await useAcpStore.getState().connectAgent('se-1', 'Software Engineer')

      mockInvoke.mockRejectedValue(new Error('IPC error'))
      await useAcpStore.getState().disconnectAgent(threadId)

      // Status should still update to disconnected even if IPC fails
      expect(useAcpStore.getState().threads[0].status).toBe('disconnected')
    })
  })

  // ── sendMessage ─────────────────────────────────────────────────────────

  describe('sendMessage', () => {
    it('sends a message and receives a response', async () => {
      mockInvoke.mockResolvedValue(mockCapabilities)
      const threadId = await useAcpStore.getState().connectAgent('se-1', 'Software Engineer')

      mockInvoke.mockResolvedValue(mockResponse)
      await useAcpStore.getState().sendMessage(threadId, 'Hello!')

      const thread = useAcpStore.getState().threads[0]
      expect(thread.messages).toHaveLength(3) // system + user + assistant
      expect(thread.messages[1].role).toBe('user')
      expect(thread.messages[1].content).toBe('Hello!')
      expect(thread.messages[2].role).toBe('assistant')
      expect(thread.messages[2].content).toBe('Test response content')
    })

    it('adds user message to conversation before response', async () => {
      mockInvoke.mockResolvedValue(mockCapabilities)
      const threadId = await useAcpStore.getState().connectAgent('se-1', 'Software Engineer')

      // Set up a delayed response
      let resolvePromise!: (value: AcpResponse) => void
      mockInvoke.mockReturnValue(new Promise((resolve) => { resolvePromise = resolve }))

      const sendPromise = useAcpStore.getState().sendMessage(threadId, 'Hello!')

      // User message should be added immediately
      const msgsAfterUser = useAcpStore.getState().threads[0].messages
      expect(msgsAfterUser).toHaveLength(2)
      expect(msgsAfterUser[1].role).toBe('user')

      resolvePromise(mockResponse)
      await sendPromise

      // Assistant response should appear after
      expect(useAcpStore.getState().threads[0].messages).toHaveLength(3)
    })

    it('does nothing for disconnected thread', async () => {
      mockInvoke.mockResolvedValue(mockCapabilities)
      const threadId = await useAcpStore.getState().connectAgent('se-1', 'Software Engineer')

      // Disconnect first
      await useAcpStore.getState().disconnectAgent(threadId)
      mockInvoke.mockClear()

      await useAcpStore.getState().sendMessage(threadId, 'Hello!')

      // Should not have called any IPC
      expect(mockInvoke).not.toHaveBeenCalled()
      // Should not have added any messages
      expect(useAcpStore.getState().threads[0].messages).toHaveLength(1)
    })

    it('does nothing for non-existent thread', async () => {
      await useAcpStore.getState().sendMessage('non-existent', 'Hello!')

      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('handles IPC error with system error message', async () => {
      mockInvoke.mockResolvedValue(mockCapabilities)
      const threadId = await useAcpStore.getState().connectAgent('se-1', 'Software Engineer')

      mockInvoke.mockRejectedValue(new Error('Request failed'))
      await useAcpStore.getState().sendMessage(threadId, 'Hello!')

      const thread = useAcpStore.getState().threads[0]
      const lastMsg = thread.messages[thread.messages.length - 1]
      expect(lastMsg.role).toBe('system')
      expect(lastMsg.content).toContain('Request failed')
    })

    it('sends IPC call with correct thread and agent IDs', async () => {
      mockInvoke.mockResolvedValue(mockCapabilities)
      const threadId = await useAcpStore.getState().connectAgent('se-1', 'Software Engineer')

      mockInvoke.mockResolvedValue(mockResponse)
      await useAcpStore.getState().sendMessage(threadId, 'Hello!')

      expect(mockInvoke).toHaveBeenCalledWith('acp_send_request', {
        threadId,
        agentId: 'se-1',
        content: 'Hello!',
      })
    })
  })

  // ── setActiveThread ─────────────────────────────────────────────────────

  describe('setActiveThread', () => {
    it('sets the active thread ID', () => {
      useAcpStore.getState().setActiveThread('thread-1')

      expect(useAcpStore.getState().activeThreadId).toBe('thread-1')
    })

    it('clears active thread when set to null', () => {
      useAcpStore.getState().setActiveThread('thread-1')
      useAcpStore.getState().setActiveThread(null)

      expect(useAcpStore.getState().activeThreadId).toBeNull()
    })
  })

  // ── removeThread ────────────────────────────────────────────────────────

  describe('removeThread', () => {
    it('removes a thread and disconnects it', async () => {
      mockInvoke.mockResolvedValue(mockCapabilities)
      mockInvoke.mockResolvedValue(undefined)

      const threadId = await useAcpStore.getState().connectAgent('se-1', 'Software Engineer')

      await useAcpStore.getState().removeThread(threadId)

      expect(useAcpStore.getState().threads).toHaveLength(0)
      expect(mockInvoke).toHaveBeenCalledWith('acp_disconnect', { threadId })
    })

    it('clears activeThreadId when removing active thread', async () => {
      mockInvoke.mockResolvedValue(mockCapabilities)
      const threadId = await useAcpStore.getState().connectAgent('se-1', 'Software Engineer')

      await useAcpStore.getState().removeThread(threadId)

      expect(useAcpStore.getState().activeThreadId).toBeNull()
    })
  })

  // ── clearThreadMessages ─────────────────────────────────────────────────

  describe('clearThreadMessages', () => {
    it('clears all messages from a thread', async () => {
      mockInvoke.mockResolvedValue(mockCapabilities)
      const threadId = await useAcpStore.getState().connectAgent('se-1', 'Software Engineer')

      useAcpStore.getState().clearThreadMessages(threadId)

      expect(useAcpStore.getState().threads[0].messages).toEqual([])
    })
  })

  // ── Internal helpers ────────────────────────────────────────────────────

  describe('internal helpers', () => {
    it('_addThread adds a thread to the list', () => {
      const thread: AcpThread = {
        id: 'test-1',
        agentId: 'se-1',
        agentName: 'Software Engineer',
        status: 'connected',
        capabilities: mockCapabilities,
        messages: [],
        startedAt: Date.now(),
        lastActivity: Date.now(),
      }

      useAcpStore.getState()._addThread(thread)

      expect(useAcpStore.getState().threads).toHaveLength(1)
      expect(useAcpStore.getState().threads[0].id).toBe('test-1')
    })

    it('_updateThreadStatus updates thread status', () => {
      useAcpStore.getState()._addThread({
        id: 'test-1',
        agentId: 'se-1',
        agentName: 'Software Engineer',
        status: 'connected',
        capabilities: mockCapabilities,
        messages: [],
        startedAt: Date.now(),
        lastActivity: Date.now(),
      })

      useAcpStore.getState()._updateThreadStatus('test-1', 'error')

      expect(useAcpStore.getState().threads[0].status).toBe('error')
    })

    it('_addMessage adds a message to a thread', () => {
      useAcpStore.getState()._addThread({
        id: 'test-1',
        agentId: 'se-1',
        agentName: 'Software Engineer',
        status: 'connected',
        capabilities: mockCapabilities,
        messages: [],
        startedAt: Date.now(),
        lastActivity: Date.now(),
      })

      const msg = { id: 'msg-1', role: 'user' as const, content: 'Hello', timestamp: Date.now() }
      useAcpStore.getState()._addMessage('test-1', msg)

      expect(useAcpStore.getState().threads[0].messages).toHaveLength(1)
      expect(useAcpStore.getState().threads[0].messages[0].content).toBe('Hello')
    })

    it('_handleAcpEvent processes event payload', () => {
      // Thread ID must be simple enough that split('-')[0] matches it
      useAcpStore.getState()._addThread({
        id: 'test',
        agentId: 'se-1',
        agentName: 'Software Engineer',
        status: 'connected',
        capabilities: mockCapabilities,
        messages: [],
        startedAt: Date.now(),
        lastActivity: Date.now(),
      })

      const event = {
        payload: {
          jsonrpc: '2.0' as const,
          id: 'test-response-1',
          result: 'Streaming response',
        },
      }

      useAcpStore.getState()._handleAcpEvent(event as any)

      const lastMsg = useAcpStore.getState().threads[0].messages[0]
      expect(lastMsg).toBeDefined()
      expect(lastMsg.role).toBe('assistant')
      expect(lastMsg.content).toBe('Streaming response')
    })
  })

  // ── Edge cases ──────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('creates separate threads for concurrent connect requests (no locking)', async () => {
      mockInvoke.mockResolvedValue(mockCapabilities)

      const [id1, id2] = await Promise.all([
        useAcpStore.getState().connectAgent('se-1', 'Software Engineer'),
        useAcpStore.getState().connectAgent('se-1', 'Software Engineer'),
      ])

      // Without concurrent-connection locking, each call creates its own thread
      expect(id1).not.toBe(id2)
      expect(useAcpStore.getState().threads).toHaveLength(2)
      // Both threads should be connected
      expect(useAcpStore.getState().threads.every((t) => t.status === 'connected')).toBe(true)
    })

    it('maintains thread list after connect + disconnect + reconnect', async () => {
      mockInvoke.mockResolvedValue(mockCapabilities)

      const id1 = await useAcpStore.getState().connectAgent('se-1', 'Software Engineer')
      await useAcpStore.getState().disconnectAgent(id1)

      // Reconnect should create a NEW thread since old one is disconnected
      mockInvoke.mockClear()
      mockInvoke.mockResolvedValue(mockCapabilities)
      const id2 = await useAcpStore.getState().connectAgent('se-1', 'Software Engineer')

      expect(id2).not.toBe(id1)
      expect(useAcpStore.getState().threads).toHaveLength(2)
    })
  })
})
