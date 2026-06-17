import { useEffect, useState, useRef, memo } from 'react'
import { useModelRouterStore } from '../../stores/modelRouterStore'
import { formatModelSize, getModelFamily, getModelColor } from '../../lib/modelRouter'
import {
  Bot,
  RefreshCw,
  Send,
  ChevronDown,
  AlertCircle,
  Loader2,
  MessageSquare,
  Plus,
} from 'lucide-react'

// --- Model Selector ---

function ModelSelector() {
  const { models, selectedModel, selectModel, isLoadingModels, refreshModels, status } =
    useModelRouterStore()
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    refreshModels()
  }, [refreshModels])

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-c-surface border border-c-border-strong rounded-lg text-[11px] text-c-text-dim hover:bg-c-surface-hover transition-colors w-full"
      >
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: status.running ? '#22c55e' : '#ef4444' }}
        />
        <span className="flex-1 text-left truncate">
          {selectedModel || 'Select model'}
        </span>
        {isLoadingModels ? (
          <Loader2 className="w-3 h-3 animate-spin text-c-muted" />
        ) : (
          <ChevronDown className={`w-3 h-3 text-c-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-c-card border border-c-border-strong rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
          {models.length === 0 ? (
            <div className="p-3 text-center text-[11px] text-c-muted">
              {status.running ? 'No models installed' : 'Ollama not running'}
            </div>
          ) : (
            models.map((model) => {
              const family = getModelFamily(model.name)
              const color = getModelColor(family)
              const isSelected = model.name === selectedModel

              return (
                <button
                  key={model.name}
                  onClick={() => {
                    selectModel(model.name)
                    setIsOpen(false)
                  }}
                  className={`flex items-center gap-2 px-3 py-2 text-[11px] w-full hover:bg-c-surface-hover transition-colors ${
                    isSelected ? 'bg-c-surface' : ''
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <div className="flex-1 text-left min-w-0">
                    <div className="font-medium text-c-text-dim truncate">{model.name}</div>
                    <div className="text-[9px] text-c-muted">
                      {model.parameter_size} · {formatModelSize(model.size)}
                    </div>
                  </div>
                  {isSelected && <span className="text-mothership-400 text-[10px]">●</span>}
                </button>
              )
            })
          )}
          <button
            onClick={() => {
              refreshModels()
            }}
            className="flex items-center gap-2 px-3 py-2 text-[11px] text-c-muted hover:text-c-text-dim hover:bg-c-surface-hover w-full border-t border-c-border"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh models
          </button>
        </div>
      )}
    </div>
  )
}

// --- Chat Message ---

const ChatMessageBubble = memo(function ChatMessageBubble({
  message,
}: {
  message: { role: string; content: string }
}) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] px-3 py-2 rounded-lg text-[11px] leading-relaxed ${
          isUser
            ? 'bg-mothership-600/20 text-c-text-dim border border-mothership-600/30'
            : 'bg-c-surface text-c-text-dim border border-c-border-strong/30'
        }`}
      >
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <Bot className="w-3 h-3 text-mothership-400" />
            <span className="text-[9px] font-medium text-mothership-400">Assistant</span>
          </div>
        )}
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  )
})

// --- Chat Panel ---

function ChatPanel() {
  const {
    conversations,
    activeConversationId,
    isGenerating,
    lastError,
    sendMessage,
  } = useModelRouterStore()

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const activeConversation = conversations.find((c) => c.id === activeConversationId)
  const messages = activeConversation?.messages || []

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isGenerating) return
    const content = input.trim()
    setInput('')
    await sendMessage(content)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-c-muted">
            <Bot className="w-8 h-8 mb-2 text-c-muted-light" />
            <p className="text-[11px]">Start a conversation with a local model</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <ChatMessageBubble key={i} message={msg} />
          ))
        )}
        {isGenerating && (
          <div className="flex justify-start mb-3">
            <div className="px-3 py-2 rounded-lg bg-c-surface border border-c-border-strong/30">
              <div className="flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin text-mothership-400" />
                <span className="text-[11px] text-c-muted">Generating...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {lastError && (
        <div className="px-3 py-2 bg-red-500/10 border-t border-red-500/20">
          <div className="flex items-center gap-2 text-[11px] text-red-400">
            <AlertCircle className="w-3 h-3" />
            {lastError}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-c-border">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={2}
            className="flex-1 px-3 py-2 bg-c-surface border border-c-border-strong rounded-lg text-[11px] text-c-text-dim placeholder:text-c-muted-light focus:border-mothership-500/50 outline-none resize-none"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isGenerating}
            className="px-3 py-2 bg-mothership-600 hover:bg-mothership-500 disabled:bg-c-surface disabled:text-c-muted text-white rounded-lg transition-colors"
          >
            <Send className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Main Component ---

export function ModelRouterPanel() {
  const { conversations, activeConversationId } =
    useModelRouterStore()
  const createConversation = useModelRouterStore((s) => s.createConversation)

  return (
    <div className="h-full flex flex-col bg-c-card border-l border-c-border">
      {/* Header */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-c-muted">Model Router</span>
          <button
            onClick={() => createConversation()}
            className="p-1 rounded hover:bg-c-surface text-c-muted hover:text-c-text-dim transition-colors"
            title="New conversation"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        <ModelSelector />
      </div>

      {/* Conversation list */}
      {conversations.length > 1 && (
        <div className="px-3 pb-2 flex gap-1 overflow-x-auto">
          {conversations.slice(0, 5).map((conv) => (
            <button
              key={conv.id}
              onClick={() => useModelRouterStore.setState({ activeConversationId: conv.id })}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] whitespace-nowrap transition-colors ${
                conv.id === activeConversationId
                  ? 'bg-mothership-600/20 text-mothership-400'
                  : 'bg-c-surface text-c-muted hover:text-c-text-dim'
              }`}
            >
              <MessageSquare className="w-2 h-2" />
              {conv.model.split(':')[0]}
            </button>
          ))}
        </div>
      )}

      {/* Chat */}
      <div className="flex-1 overflow-hidden">
        <ChatPanel />
      </div>
    </div>
  )
}
