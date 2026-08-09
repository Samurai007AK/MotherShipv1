import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

// ── ACP Protocol Types (JSON-RPC 2.0) ──────────────────────────────────

/** JSON-RPC 2.0 request envelope */
export interface AcpRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: Record<string, unknown>
}

/** JSON-RPC 2.0 response envelope */
export interface AcpResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

/** JSON-RPC 2.0 notification (no response expected) */
export interface AcpNotification {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown>
}

/** ACP Agent capabilities declared during handshake */
export interface AcpCapabilities {
  version: string
  streaming: boolean
  codeDiff: boolean
  tools: boolean
  models: string[]
}

/** A single agent thread (ACP connection) */
export interface AcpThread {
  id: string
  agentId: string
  agentName: string
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  capabilities: AcpCapabilities | null
  messages: AcpThreadMessage[]
  startedAt: number
  lastActivity: number
}

/** A message in an agent thread */
export interface AcpThreadMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  metadata?: {
    toolCalls?: { name: string; args: Record<string, unknown> }[]
    tokens?: number
    model?: string
  }
}

// ── Store ───────────────────────────────────────────────────────────────

interface AcpState {
  threads: AcpThread[]
  activeThreadId: string | null
  isConnecting: boolean

  // Actions
  connectAgent: (agentId: string, agentName: string) => Promise<string>
  disconnectAgent: (threadId: string) => Promise<void>
  sendMessage: (threadId: string, content: string) => Promise<void>
  setActiveThread: (threadId: string | null) => void
  removeThread: (threadId: string) => void
  clearThreadMessages: (threadId: string) => void

  // Internal
  _addThread: (thread: AcpThread) => void
  _updateThreadStatus: (threadId: string, status: AcpThread['status']) => void
  _addMessage: (threadId: string, message: AcpThreadMessage) => void
  _handleAcpEvent: (event: { payload: AcpResponse | AcpNotification }) => void
}

let threadCounter = 0
let messageCounter = 0

export const useAcpStore = create<AcpState>()((set, get) => ({
  threads: [],
  activeThreadId: null,
  isConnecting: false,

  connectAgent: async (agentId, agentName) => {
    const state = get()
    set({ isConnecting: true })

    // Check if this agent already has a thread
    const existing = state.threads.find((t) => t.agentId === agentId && t.status !== 'disconnected')
    if (existing) {
      set({ activeThreadId: existing.id, isConnecting: false })
      return existing.id
    }

    threadCounter++
    const threadId = `acp-${agentId}-${threadCounter}`

    try {
      // Send ACP initialize request via Rust IPC
      const capabilities = await invoke<AcpCapabilities>('acp_initialize', {
        threadId,
        agentId,
      })

      const thread: AcpThread = {
        id: threadId,
        agentId,
        agentName,
        status: 'connected',
        capabilities,
        messages: [
          {
            id: `msg-${++messageCounter}`,
            role: 'system',
            content: `Connected to ${agentName} (ACP v${capabilities.version}). Ready for requests.`,
            timestamp: Date.now(),
          },
        ],
        startedAt: Date.now(),
        lastActivity: Date.now(),
      }

      get()._addThread(thread)
      set({ activeThreadId: threadId, isConnecting: false })
      return threadId
    } catch (e) {
      console.error('ACP connection failed:', e)
      const thread: AcpThread = {
        id: threadId,
        agentId,
        agentName,
        status: 'error',
        capabilities: null,
        messages: [
          {
            id: `msg-${++messageCounter}`,
            role: 'system',
            content: `Failed to connect to ${agentName}: ${e}`,
            timestamp: Date.now(),
          },
        ],
        startedAt: Date.now(),
        lastActivity: Date.now(),
      }
      get()._addThread(thread)
      set({ isConnecting: false })
      return threadId
    }
  },

  disconnectAgent: async (threadId) => {
    try {
      await invoke('acp_disconnect', { threadId })
    } catch (e) {
      console.error('ACP disconnect error:', e)
    }
    get()._updateThreadStatus(threadId, 'disconnected')
  },

  sendMessage: async (threadId, content) => {
    const thread = get().threads.find((t) => t.id === threadId)
    if (!thread || thread.status !== 'connected') return

    // Add user message immediately
    const userMsg: AcpThreadMessage = {
      id: `msg-${++messageCounter}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    get()._addMessage(threadId, userMsg)

    try {
      // Send ACP request via Rust IPC
      const response = await invoke<AcpResponse>('acp_send_request', {
        threadId,
        agentId: thread.agentId,
        content,
      })

      // Handle streaming or single response
      if (response.result) {
        const assistantMsg: AcpThreadMessage = {
          id: `msg-${++messageCounter}`,
          role: 'assistant',
          content: String(response.result),
          timestamp: Date.now(),
        }
        get()._addMessage(threadId, assistantMsg)
      } else if (response.error) {
        const errorMsg: AcpThreadMessage = {
          id: `msg-${++messageCounter}`,
          role: 'system',
          content: `ACP Error: ${response.error.message}`,
          timestamp: Date.now(),
        }
        get()._addMessage(threadId, errorMsg)
      }
    } catch (e) {
      const errorMsg: AcpThreadMessage = {
        id: `msg-${++messageCounter}`,
        role: 'system',
        content: `Request failed: ${e}`,
        timestamp: Date.now(),
      }
      get()._addMessage(threadId, errorMsg)
    }
  },

  setActiveThread: (threadId) => set({ activeThreadId: threadId }),

  removeThread: (threadId) => {
    get().disconnectAgent(threadId)
    set((state) => ({
      threads: state.threads.filter((t) => t.id !== threadId),
      activeThreadId: state.activeThreadId === threadId ? null : state.activeThreadId,
    }))
  },

  clearThreadMessages: (threadId) => {
    set((state) => ({
      threads: state.threads.map((t) =>
        t.id === threadId
          ? { ...t, messages: [] }
          : t
      ),
    }))
  },

  // Internal helpers
  _addThread: (thread) => {
    set((state) => ({
      threads: [...state.threads, thread],
    }))
  },

  _updateThreadStatus: (threadId, status) => {
    set((state) => ({
      threads: state.threads.map((t) =>
        t.id === threadId ? { ...t, status, lastActivity: Date.now() } : t
      ),
    }))
  },

  _addMessage: (threadId, message) => {
    set((state) => ({
      threads: state.threads.map((t) =>
        t.id === threadId
          ? {
              ...t,
              messages: [...t.messages, message],
              lastActivity: Date.now(),
            }
          : t
      ),
    }))
  },

  _handleAcpEvent: (event) => {
    const payload = event.payload
    // Handle streaming responses from Rust backend
    if ('id' in payload && 'result' in payload) {
      // Find thread by the request ID embedded in the response
      const threadId = String(payload.id).split('-')[0]
      if (payload.result) {
        const msg: AcpThreadMessage = {
          id: `msg-${++messageCounter}`,
          role: 'assistant',
          content: String(payload.result),
          timestamp: Date.now(),
        }
        get()._addMessage(threadId, msg)
      }
    }
  },
}))

// ── Listen for ACP events from Rust backend ───────────────────────────

let acpListenerInitialized = false

export function initAcpEventListeners() {
  if (acpListenerInitialized) return
  acpListenerInitialized = true

  listen<AcpResponse>('acp-message', (event) => {
    useAcpStore.getState()._handleAcpEvent(event)
  })

  listen<{ threadId: string; status: string }>('acp-status', (event) => {
    const { threadId, status } = event.payload
    useAcpStore.getState()._updateThreadStatus(
      threadId,
      status as AcpThread['status']
    )
  })
}
