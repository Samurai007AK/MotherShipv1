import { create } from 'zustand'
import {
  listModels,
  checkStatus,
  chatCompletion,
  type ModelInfo,
  type OllamaStatus,
  type ChatMessage,
  type ChatResponse,
} from '../lib/modelRouter'

// --- Types ---

export interface Conversation {
  id: string
  model: string
  messages: ChatMessage[]
  createdAt: string
}

export interface ModelRouterState {
  // Ollama status
  status: OllamaStatus
  models: ModelInfo[]
  selectedModel: string | null

  // Conversations
  conversations: Conversation[]
  activeConversationId: string | null

  // Loading states
  isLoadingModels: boolean
  isGenerating: boolean
  lastError: string | null

  // Actions
  refreshStatus: () => Promise<void>
  refreshModels: () => Promise<void>
  selectModel: (model: string) => void

  // Conversation actions
  createConversation: (model?: string) => string
  sendMessage: (content: string) => Promise<ChatResponse | null>
  clearConversation: (id: string) => void
  deleteConversation: (id: string) => void
}

// --- Store ---

export const useModelRouterStore = create<ModelRouterState>()((set, get) => ({
  status: { running: false, model_count: 0, version: 'disconnected' },
  models: [],
  selectedModel: null,

  conversations: [],
  activeConversationId: null,

  isLoadingModels: false,
  isGenerating: false,
  lastError: null,

  refreshStatus: async () => {
    const status = await checkStatus()
    set({ status })
  },

  refreshModels: async () => {
    set({ isLoadingModels: true })
    try {
      const models = await listModels()
      const selectedModel = get().selectedModel || (models.length > 0 ? models[0].name : null)
      set({ models, selectedModel, isLoadingModels: false })
    } catch (e) {
      set({ lastError: String(e), isLoadingModels: false })
    }
  },

  selectModel: (model) => set({ selectedModel: model }),

  createConversation: (model) => {
    const id = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const conversation: Conversation = {
      id,
      model: model || get().selectedModel || 'unknown',
      messages: [],
      createdAt: new Date().toISOString(),
    }
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      activeConversationId: id,
    }))
    return id
  },

  sendMessage: async (content) => {
    const { activeConversationId, conversations, selectedModel } = get()
    if (!selectedModel) {
      set({ lastError: 'No model selected' })
      return null
    }

    let convId = activeConversationId
    if (!convId) {
      convId = get().createConversation()
    }

    const conversation = conversations.find((c) => c.id === convId)
    if (!conversation) return null

    // Add user message
    const userMessage: ChatMessage = { role: 'user', content }
    const updatedMessages = [...conversation.messages, userMessage]

    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === convId ? { ...c, messages: updatedMessages } : c
      ),
      isGenerating: true,
      lastError: null,
    }))

    try {
      const response = await chatCompletion({
        model: selectedModel,
        messages: updatedMessages,
        temperature: 0.7,
      })

      // Add assistant response
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.content,
      }

      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === convId
            ? { ...c, messages: [...c.messages, assistantMessage] }
            : c
        ),
        isGenerating: false,
      }))

      return response
    } catch (e) {
      set({ lastError: String(e), isGenerating: false })
      return null
    }
  },

  clearConversation: (id) => {
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, messages: [] } : c
      ),
    }))
  },

  deleteConversation: (id) => {
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
      activeConversationId:
        state.activeConversationId === id ? null : state.activeConversationId,
    }))
  },
}))
