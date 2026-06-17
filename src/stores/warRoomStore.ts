import { create } from 'zustand'
import type {
  WarRoomBroadcast,
  WarRoomResponse,
  WarRoomSession,
  WarRoomView,
  TaskChain,
  TaskChainStep,
} from '../types/warRoom'
import type { AgentProvider } from './agentStore'

interface WarRoomState {
  sessions: WarRoomSession[]
  activeSessionId: string | null
  view: WarRoomView
  taskChains: TaskChain[]
  activeChainId: string | null

  // Session actions
  createSession: (name?: string) => string
  deleteSession: (id: string) => void
  setActiveSession: (id: string) => void

  // Broadcast actions
  broadcastToAgents: (prompt: string, agentIds: string[], providers: Record<string, AgentProvider>) => void

  // Response actions
  updateResponse: (responseId: string, updates: Partial<WarRoomResponse>) => void
  appendResponseContent: (responseId: string, chunk: string) => void

  // View actions
  setView: (view: WarRoomView) => void

  // Task chain actions
  createTaskChain: (name: string, steps: Omit<TaskChainStep, 'id' | 'status'>[]) => string
  executeChain: (chainId: string) => Promise<void>
  updateChainStep: (chainId: string, stepId: string, updates: Partial<TaskChainStep>) => void
  setActiveChain: (id: string | null) => void
}

let idCounter = 0
function generateId(): string {
  idCounter += 1
  return `war-${Date.now()}-${idCounter}`
}

export const useWarRoomStore = create<WarRoomState>()((set, get) => ({
  sessions: [],
  activeSessionId: null,
  view: 'broadcast',
  taskChains: [],
  activeChainId: null,

  createSession: (name) => {
    const id = generateId()
    const session: WarRoomSession = {
      id,
      name: name || `Session ${new Date().toLocaleTimeString()}`,
      broadcasts: [],
      responses: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    set((state) => ({
      sessions: [...state.sessions, session],
      activeSessionId: id,
    }))
    return id
  },

  deleteSession: (id) => {
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
    }))
  },

  setActiveSession: (id) => set({ activeSessionId: id }),

  broadcastToAgents: (prompt, agentIds, providers) => {
    const state = get()
    let sessionId = state.activeSessionId

    // Auto-create session if none active
    if (!sessionId) {
      sessionId = get().createSession()
    }

    const broadcastId = generateId()
    const broadcast: WarRoomBroadcast = {
      id: broadcastId,
      prompt,
      agentIds,
      createdAt: new Date(),
      status: 'in_progress',
    }

    // Create empty responses for each agent
    const responses: WarRoomResponse[] = agentIds.map((agentId) => ({
      id: generateId(),
      broadcastId,
      agentId,
      provider: providers[agentId] || 'claude',
      content: '',
      status: 'pending',
    }))

    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              broadcasts: [...s.broadcasts, broadcast],
              responses: [...s.responses, ...responses],
              updatedAt: new Date(),
            }
          : s
      ),
    }))

    return broadcastId
  },

  updateResponse: (responseId, updates) => {
    set((state) => ({
      sessions: state.sessions.map((s) => ({
        ...s,
        responses: s.responses.map((r) =>
          r.id === responseId ? { ...r, ...updates } : r
        ),
      })),
    }))
  },

  appendResponseContent: (responseId, chunk) => {
    set((state) => ({
      sessions: state.sessions.map((s) => ({
        ...s,
        responses: s.responses.map((r) =>
          r.id === responseId
            ? { ...r, content: r.content + chunk, status: 'streaming' as const }
            : r
        ),
      })),
    }))
  },

  setView: (view) => set({ view }),

  createTaskChain: (name, steps) => {
    const id = generateId()
    const chain: TaskChain = {
      id,
      name,
      steps: steps.map((step, index) => ({
        ...step,
        id: `step-${index}`,
        status: 'pending',
      })),
      status: 'pending',
      createdAt: new Date(),
    }
    set((state) => ({
      taskChains: [...state.taskChains, chain],
      activeChainId: id,
    }))
    return id
  },

  executeChain: async (chainId) => {
    const state = get()
    const chain = state.taskChains.find((c) => c.id === chainId)
    if (!chain) return

    set((s) => ({
      taskChains: s.taskChains.map((c) =>
        c.id === chainId ? { ...c, status: 'in_progress' as const } : c
      ),
    }))

    let previousOutput = ''

    for (const step of chain.steps) {
      // Update step status to running
      get().updateChainStep(chainId, step.id, { status: 'running' })

      try {
        // In production, this would call the actual agent
        // For now, simulate with a delay
        await new Promise((resolve) => setTimeout(resolve, 1000))

        // Build prompt: if there's previous output, include it
        const promptWithContext = previousOutput
          ? `Previous context:\n${previousOutput}\n\nTask: ${step.prompt}`
          : step.prompt

        // Mark as completed with mock output
        const mockOutput = `[${step.agentId}] Completed: ${promptWithContext.slice(0, 80)}...`
        previousOutput = mockOutput

        get().updateChainStep(chainId, step.id, {
          status: 'completed',
          output: mockOutput,
        })
      } catch (error) {
        get().updateChainStep(chainId, step.id, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        set((s) => ({
          taskChains: s.taskChains.map((c) =>
            c.id === chainId ? { ...c, status: 'error' as const } : c
          ),
        }))
        return
      }
    }

    set((s) => ({
      taskChains: s.taskChains.map((c) =>
        c.id === chainId ? { ...c, status: 'completed' as const } : c
      ),
    }))
  },

  updateChainStep: (chainId, stepId, updates) => {
    set((state) => ({
      taskChains: state.taskChains.map((c) =>
        c.id === chainId
          ? {
              ...c,
              steps: c.steps.map((s) =>
                s.id === stepId ? { ...s, ...updates } : s
              ),
            }
          : c
      ),
    }))
  },

  setActiveChain: (id) => set({ activeChainId: id }),
}))
