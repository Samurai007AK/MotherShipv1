import { useState, useRef, useEffect, useCallback } from 'react'
import { useAcpStore, type AcpThread } from '../../stores/acpStore'
import { useAgentStore } from '../../stores/agentStore'
import {
  Bot,
  X,
  MessageSquare,
  Send,
  Plus,
  Loader2,
  Plug,
  PlugZap,
  Trash2,
} from 'lucide-react'

// ── Thread Card ─────────────────────────────────────────────────────────

function ThreadCard({
  thread,
  isActive,
  onSelect,
  onClose,
}: {
  thread: AcpThread
  isActive: boolean
  onSelect: () => void
  onClose: () => void
}) {
  const statusColor = {
    connecting: 'text-yellow-400',
    connected: 'text-green-400',
    disconnected: 'text-gray-500',
    error: 'text-red-400',
  }[thread.status]

  const statusLabel = {
    connecting: 'Connecting...',
    connected: 'Connected',
    disconnected: 'Disconnected',
    error: 'Error',
  }[thread.status]

  const lastMsg = thread.messages[thread.messages.length - 1]

  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-start gap-2 px-3 py-2 text-left border-b border-c-border/50 transition-colors ${
        isActive
          ? 'bg-c-surface text-c-text'
          : 'hover:bg-c-surface/50 text-c-muted'
      }`}
    >
      <div className="relative mt-0.5">
        <Bot className={`w-3.5 h-3.5 ${isActive ? 'text-mothership-400' : 'text-c-muted-light'}`} />
        <span className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${statusColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] font-medium truncate ${isActive ? 'text-c-text' : 'text-c-text-dim'}`}>
            {thread.agentName}
          </span>
          <span className={`text-[8px] ${statusColor}`}>{statusLabel}</span>
        </div>
        {lastMsg && (
          <p className="text-[9px] text-c-muted-light truncate mt-0.5">
            {lastMsg.content.slice(0, 60)}
            {lastMsg.content.length > 60 ? '...' : ''}
          </p>
        )}
        <span className="text-[8px] text-c-muted-light mt-0.5 block">
          {thread.messages.length} messages
        </span>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-c-surface-hover text-c-muted hover:text-red-400 transition-all"
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </button>
  )
}

// ── Message Bubble ─────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: AcpThread['messages'][0] }) {
  const isUser = msg.role === 'user'
  const isSystem = msg.role === 'system'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-1.5 text-[11px] leading-relaxed ${
          isUser
            ? 'bg-mothership-600/30 text-c-text border border-mothership-500/30'
            : isSystem
            ? 'bg-c-surface/50 text-c-muted-light border border-c-border/30 italic'
            : 'bg-c-surface text-c-text-dim border border-c-border/50'
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{msg.content}</div>
        <div className="text-[8px] text-c-muted-light mt-1">
          {new Date(msg.timestamp).toLocaleTimeString()}
          {msg.metadata?.tokens && (
            <span className="ml-1.5">{msg.metadata.tokens} tokens</span>
          )}
          {msg.metadata?.model && (
            <span className="ml-1.5">{msg.metadata.model}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Chat Input ─────────────────────────────────────────────────────────

function ChatInput({
  threadId,
  disabled,
}: {
  threadId: string
  disabled: boolean
}) {
  const [input, setInput] = useState('')
  const sendMessage = useAcpStore((s) => s.sendMessage)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    if (!input.trim() || disabled) return
    sendMessage(threadId, input.trim())
    setInput('')
    inputRef.current?.focus()
  }, [input, disabled, threadId, sendMessage])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
        e.preventDefault()
        handleSend()
      }
    }
    const textarea = inputRef.current
    textarea?.addEventListener('keydown', handleKeyDown)
    return () => textarea?.removeEventListener('keydown', handleKeyDown)
  }, [input, handleSend])

  return (
    <div className="flex items-end gap-1.5 p-2 border-t border-c-border bg-c-card">
      <textarea
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Send a message to this agent..."
        rows={1}
        className="flex-1 bg-c-surface border border-c-border-strong/30 rounded text-[11px] text-c-text placeholder:text-c-muted-light px-2 py-1.5 resize-none focus:outline-none focus:border-mothership-500/50 transition-colors min-h-[28px] max-h-[80px]"
      />
      <button
        onClick={handleSend}
        disabled={disabled || !input.trim()}
        className="p-1.5 rounded bg-mothership-600 text-white hover:bg-mothership-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <Send className="w-3 h-3" />
      </button>
    </div>
  )
}

// ── Main ACPThreadsPanel ───────────────────────────────────────────────

export function ACPThreadsPanel() {
  const {
    threads,
    activeThreadId,
    isConnecting,
    connectAgent,
    setActiveThread,
    removeThread,
    clearThreadMessages,
  } = useAcpStore()
  const agents = useAgentStore((s) => s.agents)
  const [showNewConnection, setShowNewConnection] = useState(false)

  const activeThread = threads.find((t) => t.id === activeThreadId)

  const handleConnectAgent = useCallback(
    async (agentId: string) => {
      const agent = agents.find((a) => a.id === agentId)
      if (!agent) return
      await connectAgent(agentId, agent.name)
      setShowNewConnection(false)
    },
    [agents, connectAgent]
  )

  return (
    <div className="flex h-full">
      {/* Left: Thread list */}
      <div className="w-56 flex-shrink-0 border-r border-c-border bg-c-card/50 flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-c-border">
          <div className="flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-mothership-400" />
            <span className="text-xs font-medium text-c-text">ACP Threads</span>
          </div>
          <button
            onClick={() => setShowNewConnection(!showNewConnection)}
            className="p-1 rounded hover:bg-c-surface text-c-muted-light hover:text-c-text transition-colors"
            title="New ACP connection"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>

        {/* New connection selector */}
        {showNewConnection && (
          <div className="px-2 py-2 border-b border-c-border bg-c-surface/30">
            <div className="text-[10px] font-medium text-c-muted mb-1.5">Connect to agent:</div>
            <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
              {agents.map((agent) => {
                const alreadyConnected = threads.some(
                  (t) => t.agentId === agent.id && t.status === 'connected'
                )
                return (
                  <button
                    key={agent.id}
                    onClick={() => handleConnectAgent(agent.id)}
                    disabled={alreadyConnected || isConnecting}
                    className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] text-left rounded hover:bg-c-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {alreadyConnected ? (
                      <PlugZap className="w-2.5 h-2.5 text-green-400" />
                    ) : (
                      <Plug className="w-2.5 h-2.5 text-c-muted-light" />
                    )}
                    <span className="truncate">{agent.name}</span>
                    {alreadyConnected && (
                      <span className="text-[8px] text-green-400 ml-auto">Connected</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto">
          {isConnecting && (
            <div className="flex items-center gap-2 px-3 py-2 text-[10px] text-c-muted-light">
              <Loader2 className="w-3 h-3 animate-spin" />
              Connecting...
            </div>
          )}
          {threads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <MessageSquare className="w-6 h-6 text-c-muted-light mb-2" />
              <p className="text-[10px] text-c-muted-light">
                No ACP connections yet. Click + to connect to an agent.
              </p>
            </div>
          ) : (
            threads.map((thread) => (
              <ThreadCard
                key={thread.id}
                thread={thread}
                isActive={thread.id === activeThreadId}
                onSelect={() => setActiveThread(thread.id)}
                onClose={() => removeThread(thread.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right: Chat area */}
      <div className="flex-1 flex flex-col">
        {activeThread ? (
          <>
            {/* Chat header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-c-border bg-c-card">
              <div className="flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-mothership-400" />
                <span className="text-[11px] font-medium text-c-text">{activeThread.agentName}</span>
                <span className="text-[9px] text-c-muted-light">
                  v{activeThread.capabilities?.version || '?'}
                </span>
                {activeThread.capabilities?.streaming && (
                  <span className="text-[8px] px-1 py-0.5 rounded bg-green-600/10 text-green-400">stream</span>
                )}
                {activeThread.capabilities?.codeDiff && (
                  <span className="text-[8px] px-1 py-0.5 rounded bg-blue-600/10 text-blue-400">diffs</span>
                )}
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => clearThreadMessages(activeThread.id)}
                  className="p-1 rounded hover:bg-c-surface text-c-muted-light hover:text-c-text transition-colors"
                  title="Clear messages"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {activeThread.messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-[10px] text-c-muted-light">
                  No messages yet. Start a conversation with {activeThread.agentName}.
                </div>
              ) : (
                activeThread.messages.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))
              )}
            </div>

            {/* Input */}
            <ChatInput
              threadId={activeThread.id}
              disabled={activeThread.status !== 'connected'}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[10px] text-c-muted-light">
            Select an ACP thread or create a new connection
          </div>
        )}
      </div>
    </div>
  )
}
