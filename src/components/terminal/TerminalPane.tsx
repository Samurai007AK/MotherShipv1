import { forwardRef, useImperativeHandle, useState, useRef, useEffect } from 'react'
import { useTerminal, type PtySessionInfo } from '../../hooks/useTerminal'
import {
  AlertTriangle,
  RefreshCw,
  Search,
  X,
  ChevronUp,
  ChevronDown,
  Copy,
  ClipboardPaste,
  Bot,
  Loader2,
  Trash2,
  Download,
  MessageSquare,
} from 'lucide-react'
import { useAgentStore } from '../../stores/agentStore'
import { ConversationHistory } from './ConversationHistory'

export interface TerminalPaneHandle {
  write: (data: string) => void
  clear: () => void
  spawn: () => Promise<PtySessionInfo | null>
  close: () => Promise<void>
}

interface TerminalPaneProps {
  agentId: string
  workingDir?: string
  visible?: boolean
  /** Optional model override — if set, terminal runs in AI chat mode */
  model?: string
  onExit?: (code: number) => void
  onError?: (message: string) => void
}

export const TerminalPane = forwardRef<TerminalPaneHandle, TerminalPaneProps>(
  function TerminalPane({ agentId, workingDir, visible = true, model, onExit, onError }, ref) {
    const agent = useAgentStore((s) => s.agents.find((a) => a.id === agentId))
    // Use explicit model prop or fall back to agent's configured model
    const aiModel = model || agent?.model

    const {
      containerRef,
      isConnected,
      isPaused,
      hasError,
      errorMessage,
      isSearchOpen,
      setIsSearchOpen,
      showHistory,
      setShowHistory,
      conversationMessages,
      messageCount,
      jumpToMessage,
      isAiMode,
      isAiGenerating,
      clearConversation,
      exportConversationAsMarkdown,
      exportConversationAsJson,
      spawn,
      reconnect,
      write,
      resize,
      close,
      searchNext,
      searchPrevious,
      clearSearch,
      copySelection,
      pasteFromClipboard,
    } = useTerminal({ agentId, workingDir, visible, aiModel, aiSystemPrompt: agent?.systemPrompt || agent?.description, onExit, onError })

    const [searchQuery, setSearchQuery] = useState('')
    const searchInputRef = useRef<HTMLInputElement>(null)

    // Focus search input when opened
    useEffect(() => {
      if (isSearchOpen) {
        requestAnimationFrame(() => searchInputRef.current?.focus())
      } else {
        setSearchQuery('')
        clearSearch()
      }
    }, [isSearchOpen, clearSearch])

    useImperativeHandle(ref, () => ({
      write,
      clear: () => {
        // Terminal clear is handled via the hook's internal terminal
      },
      spawn,
      close,
    }))

    return (
      <div className="flex-1 flex flex-col bg-c-bg relative">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-1 border-b border-c-border/50">
          <div className="flex items-center gap-2">
            {isAiMode ? (
              <>
                <Bot className="w-3 h-3 text-mothership-400" />
                <span className="text-[10px] text-c-text-dim font-mono">
                  {agentId}@{aiModel}
                </span>
                {isAiGenerating && (
                  <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-mothership-600/20 text-mothership-400 font-medium">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    Generating
                  </span>
                )}
                {/* Conversation history button (AI mode only) */}
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className={`flex items-center gap-1 text-[10px] px-1.5 py-1 rounded hover:bg-c-surface transition-colors ${
                    showHistory
                      ? 'text-mothership-400 bg-mothership-600/10'
                      : 'text-c-muted-light hover:text-mothership-400'
                  }`}
                  title={`Conversation history (${messageCount} messages)`}
                >
                  <MessageSquare className="w-3 h-3" />
                  <span className="text-[9px] font-mono">{messageCount}</span>
                </button>

                {/* Export buttons (AI mode only) */}
                <div className="flex items-center gap-0.5 ml-1 border-l border-c-border/30 pl-1.5">
                  <button
                    onClick={exportConversationAsMarkdown}
                    className="flex items-center gap-0.5 text-[10px] px-1 py-1 rounded hover:bg-c-surface text-c-muted-light hover:text-mothership-400 transition-colors"
                    title="Export as Markdown (.md)"
                  >
                    <Download className="w-3 h-3" />
                    <span className="text-[8px] font-mono">MD</span>
                  </button>
                  <button
                    onClick={exportConversationAsJson}
                    className="flex items-center gap-0.5 text-[10px] px-1 py-1 rounded hover:bg-c-surface text-c-muted-light hover:text-mothership-400 transition-colors"
                    title="Export as JSON (.json)"
                  >
                    <Download className="w-3 h-3" />
                    <span className="text-[8px] font-mono">JSON</span>
                  </button>
                </div>
                {/* Clear conversation button (AI mode only) */}
                <button
                  onClick={clearConversation}
                  className="text-[10px] p-1 rounded hover:bg-c-surface text-c-muted-light hover:text-red-400 transition-colors"
                  title="Clear conversation (Ctrl+L)"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </>
            ) : (
              <span className="text-[10px] text-c-muted-light font-mono">
                {agentId}@mothership ~
              </span>
            )}
            {isPaused && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-500 font-medium">
                PAUSED
              </span>
            )}
            {!isConnected && !hasError && !isAiMode && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-c-surface text-c-muted-light font-medium">
                DISCONNECTED
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Copy button */}
            <button
              onClick={copySelection}
              className="text-[10px] p-1 rounded hover:bg-c-surface text-c-muted-light hover:text-c-muted transition-colors"
              title="Copy selection (Ctrl+Shift+C)"
            >
              <Copy className="w-3 h-3" />
            </button>
            {/* Paste button */}
            <button
              onClick={pasteFromClipboard}
              className="text-[10px] p-1 rounded hover:bg-c-surface text-c-muted-light hover:text-c-muted transition-colors"
              title="Paste (Ctrl+Shift+V)"
            >
              <ClipboardPaste className="w-3 h-3" />
            </button>
            {/* Search button */}
            <button
              onClick={() => setIsSearchOpen(!isSearchOpen)}
              className={`text-[10px] p-1 rounded hover:bg-c-surface transition-colors ${
                isSearchOpen
                  ? 'text-mothership-400 bg-mothership-600/10'
                  : 'text-c-muted-light hover:text-c-muted'
              }`}
              title="Search (Ctrl+F)"
            >
              <Search className="w-3 h-3" />
            </button>
            {/* Fit button */}
            <button
              onClick={() => resize(120, 30)}
              className="text-[10px] px-1.5 py-0.5 rounded hover:bg-c-surface text-c-muted-light hover:text-c-muted transition-colors"
              title="Reset size"
            >
              Fit
            </button>
          </div>
        </div>

        {/* Search bar (1a.2e.4) */}
        {isSearchOpen && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-c-card border-b border-c-border/50 animate-tooltip-in">
            <Search className="w-3 h-3 text-c-muted-light flex-shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                if (e.target.value) searchNext(e.target.value)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (e.shiftKey) {
                    searchPrevious(searchQuery)
                  } else {
                    searchNext(searchQuery)
                  }
                }
                if (e.key === 'Escape') {
                  setIsSearchOpen(false)
                }
              }}
              placeholder="Search in terminal…"
              className="flex-1 bg-transparent text-xs text-c-text placeholder:text-c-muted-light outline-none"
            />
            <button
              onClick={() => searchPrevious(searchQuery)}
              className="p-0.5 rounded hover:bg-c-surface text-c-muted-light hover:text-c-muted transition-colors"
              title="Previous match (Shift+Enter)"
            >
              <ChevronUp className="w-3 h-3" />
            </button>
            <button
              onClick={() => searchNext(searchQuery)}
              className="p-0.5 rounded hover:bg-c-surface text-c-muted-light hover:text-c-muted transition-colors"
              title="Next match (Enter)"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
            <button
              onClick={() => setIsSearchOpen(false)}
              className="p-0.5 rounded hover:bg-c-surface text-c-muted-light hover:text-c-muted transition-colors"
              title="Close search (Esc)"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Terminal container with conversation history overlay */}
        <div className="flex-1 relative overflow-hidden">
          <div ref={containerRef} className="absolute inset-0" />

          {/* Conversation History panel (AI mode only) */}
          {isAiMode && (
            <ConversationHistory
              messages={conversationMessages}
              agentId={agentId}
              isOpen={showHistory}
              onClose={() => setShowHistory(false)}
              onJumpToExchange={jumpToMessage}
            />
          )}
        </div>

        {/* Error overlay (1a.2e.2) */}
        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-c-bg/90 backdrop-blur-sm z-20">
            <div className="flex flex-col items-center gap-3 p-6 rounded-xl bg-c-card border border-c-border shadow-lg max-w-sm mx-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-sm font-medium text-c-text">Connection Lost</h3>
              <p className="text-xs text-c-muted text-center leading-relaxed">
                {errorMessage || 'The terminal session has been disconnected.'}
              </p>
              <button
                onClick={reconnect}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-mothership-600 hover:bg-mothership-500 text-white text-xs font-medium transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Reconnect
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }
)
