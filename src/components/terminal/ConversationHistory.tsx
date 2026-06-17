import { useMemo, useRef, useEffect } from 'react'
import type { ChatMessage } from '../../lib/modelRouter'
import { X, MessageSquare, User, Bot, Clipboard } from 'lucide-react'

interface ConversationHistoryProps {
  messages: ChatMessage[]
  agentId: string
  isOpen: boolean
  onClose: () => void
  onJumpToExchange: (index: number) => void
}

interface Exchange {
  user: ChatMessage | null
  assistant: ChatMessage | null
  preview: string
}

function buildExchanges(messages: ChatMessage[]): Exchange[] {
  const exchanges: Exchange[] = []
  let currentUser: ChatMessage | null = null

  for (const msg of messages) {
    if (msg.role === 'system') continue

    if (msg.role === 'user') {
      if (currentUser) {
        exchanges.push({
          user: currentUser,
          assistant: null,
          preview: currentUser.content.slice(0, 80),
        })
      }
      currentUser = msg
    } else if (msg.role === 'assistant' && currentUser) {
      exchanges.push({
        user: currentUser,
        assistant: msg,
        preview: msg.content.slice(0, 80),
      })
      currentUser = null
    }
  }

  if (currentUser) {
    exchanges.push({
      user: currentUser,
      assistant: null,
      preview: currentUser.content.slice(0, 80),
    })
  }

  return exchanges
}

export function ConversationHistory({
  messages,
  agentId,
  isOpen,
  onClose,
  onJumpToExchange,
}: ConversationHistoryProps) {
  const exchanges = useMemo(() => buildExchanges(messages), [messages])
  const listRef = useRef<HTMLDivElement>(null)
  const nonSystemCount = messages.filter((m) => m.role !== 'system').length

  useEffect(() => {
    if (isOpen && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [exchanges.length, isOpen])

  const handleCopyExchange = (e: React.MouseEvent, exchange: Exchange) => {
    e.stopPropagation()
    const text = [
      exchange.user ? `User: ${exchange.user.content}` : '',
      exchange.assistant ? `${agentId}: ${exchange.assistant.content}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')
    navigator.clipboard.writeText(text).catch(() => {})
  }

  if (!isOpen) return null

  return (
    <div
      className="absolute right-0 top-0 bottom-0 w-72 z-30 flex flex-col bg-c-card border-l border-c-border shadow-xl"
      style={{
        animation: 'slideIn 0.15s ease-out',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-c-border/50">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-mothership-400" />
          <span className="text-[11px] font-medium text-c-text">History</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-c-surface text-c-muted-light font-mono">
            {nonSystemCount}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-0.5 rounded hover:bg-c-surface text-c-muted-light hover:text-c-text transition-colors"
          title="Close history panel"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Empty state */}
      {exchanges.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
          <MessageSquare className="w-8 h-8 text-c-muted-light mb-2" />
          <p className="text-xs text-c-muted-light">No conversation history yet.</p>
          <p className="text-[10px] text-c-muted-light mt-1">
            Messages will appear here as you chat.
          </p>
        </div>
      )}

      {/* Exchange list */}
      {exchanges.length > 0 && (
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {exchanges.map((exchange, idx) => (
            <button
              key={idx}
              onClick={() => onJumpToExchange(idx)}
              className="w-full text-left group relative flex flex-col gap-1 p-2 rounded-lg border border-c-border/30 hover:border-c-border hover:bg-c-surface/50 transition-all cursor-pointer"
            >
              {/* User message */}
              <div className="flex items-start gap-1.5">
                <User className="w-2.5 h-2.5 text-c-muted-light mt-0.5 flex-shrink-0" />
                <span className="text-[10px] text-c-text-dim leading-relaxed line-clamp-2 break-words flex-1">
                  {exchange.user?.content ?? '(empty)'}
                </span>
              </div>

              {/* Assistant response */}
              {exchange.assistant && (
                <div className="flex items-start gap-1.5">
                  <Bot className="w-2.5 h-2.5 text-mothership-400 mt-0.5 flex-shrink-0" />
                  <span className="text-[10px] text-c-muted-light leading-relaxed line-clamp-2 break-words flex-1">
                    {exchange.assistant.content}
                  </span>
                </div>
              )}

              {/* Copy button (appears on hover) */}
              <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <span
                  onClick={(e) => handleCopyExchange(e, exchange)}
                  className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] bg-c-surface hover:bg-c-surface-hover text-c-muted-light hover:text-c-text cursor-pointer transition-colors"
                  title="Copy exchange to clipboard"
                >
                  <Clipboard className="w-2 h-2" />
                  Copy
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-c-border/30 text-[9px] text-c-muted-light">
        {exchanges.length} exchange{exchanges.length !== 1 ? 's' : ''} · Click to reference in input
      </div>

      {/* Keyframe for slide-in */}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
