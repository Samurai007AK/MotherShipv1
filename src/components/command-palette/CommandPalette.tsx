import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useAgentStore, type AgentProvider, getProviderColor } from '../../stores/agentStore'
import { useMemoryStore } from '../../stores/memoryStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useFileStore } from '../../stores/fileStore'
import { fuzzyFilter } from '../../lib/fuzzySearch'
import {
  Search,
  StickyNote,
  Clock,
  Terminal,
  ArrowRight,
  FileText,
  Folder,
} from 'lucide-react'

// --- Types ---

interface SearchResult {
  id: string
  type: 'agent' | 'note' | 'context' | 'file'
  title: string
  subtitle: string
  agentProvider?: AgentProvider
  icon: React.ReactNode
  onSelect: () => void
}

// --- Hook ---

export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  return { isOpen, setIsOpen }
}

// --- Component ---

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Stores
  const agents = useAgentStore((s) => s.agents)
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const setActiveAgent = useAgentStore((s) => s.setActiveAgent)
  const recentAgentIds = useAgentStore((s) => s.recentAgentIds)
  const recordRecentAgent = useAgentStore((s) => s.recordRecentAgent)
  const notes = useMemoryStore((s) => s.notes)
  const contextHistory = useMemoryStore((s) => s.contextHistory)
  const setActiveTab = useMemoryStore((s) => s.setActiveTab)
  const addTab = useWorkspaceStore((s) => s.addTab)
  const searchFiles = useFileStore((s) => s.searchFiles)
  const fetchFiles = useFileStore((s) => s.fetchFiles)

  // Fetch files when palette opens
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      fetchFiles()
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen, fetchFiles])

  // Build search results with fuzzy scoring
  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim()

    // Build raw result arrays
    const agentItems = agents.map((agent) => ({
      id: `agent-${agent.id}`,
      type: 'agent' as const,
      title: agent.name,
      subtitle: agent.model || agent.description,
      agentProvider: agent.provider,
      icon: (
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${getProviderColor(agent.provider)}`}
        />
      ),        onSelect: () => {
          setActiveAgent(agent.id)
          recordRecentAgent(agent.id)
          addTab(agent.id, agent.name, agent.provider)
          onClose()
        },
      }))

    const noteItems = notes.slice(0, 20).map((note) => ({
      id: `note-${note.id}`,
      type: 'note' as const,
      title: note.content.slice(0, 60) + (note.content.length > 60 ? '…' : ''),
      subtitle: note.tags.join(', ') || 'No tags',
      icon: <StickyNote className="w-3 h-3 text-mothership-400" />,
      onSelect: () => {
        setActiveTab('notes')
        onClose()
      },
    }))

    const contextItems = contextHistory.slice(0, 20).map((ctx) => ({
      id: `ctx-${ctx.id}`,
      type: 'context' as const,
      title: ctx.content.slice(0, 60) + (ctx.content.length > 60 ? '…' : ''),
      subtitle: `${ctx.entryType} · ${ctx.agentId}`,
      icon: <Clock className="w-3 h-3 text-c-muted" />,
      onSelect: () => {
        setActiveTab('context')
        onClose()
      },
    }))

    const fileItems = searchFiles('').slice(0, 30).map((file) => ({
      id: `file-${file.path}`,
      type: 'file' as const,
      title: file.name,
      subtitle: file.path,
      icon: file.isDir ? (
        <Folder className="w-3 h-3 text-yellow-400" />
      ) : (
        <FileText className="w-3 h-3 text-blue-400" />
      ),
      onSelect: () => {
        const tabId = `file-${file.path}`
        addTab(tabId, file.name, 'file')
        onClose()
      },
    }))

    if (!q) {
      // No query: show recent agents first, then all agents, notes, context, files
      const recentItems = agentItems.filter((a) => recentAgentIds.includes(a.id.replace('agent-', '')))
      const otherItems = agentItems.filter((a) => !recentAgentIds.includes(a.id.replace('agent-', '')))
      return [
        ...recentItems,
        ...otherItems,
        ...noteItems.slice(0, 5),
        ...contextItems.slice(0, 5),
        ...fileItems.slice(0, 5),
      ]
    }

    // Fuzzy filter each category
    const agentResults = fuzzyFilter(agentItems, q, (a) => [a.title, a.subtitle])
      .slice(0, 10)
      .map((r) => r.item)

    const noteResults = fuzzyFilter(noteItems, q, (n) => [n.title, n.subtitle])
      .slice(0, 5)
      .map((r) => r.item)

    const contextResults = fuzzyFilter(contextItems, q, (c) => [c.title, c.subtitle])
      .slice(0, 5)
      .map((r) => r.item)

    const fileResults = fuzzyFilter(fileItems, q, (f) => [f.title, f.subtitle])
      .slice(0, 8)
      .map((r) => r.item)

    // Merge: prioritize by category (agents first), then by score within category
    return [...agentResults, ...noteResults, ...contextResults, ...fileResults]
  }, [query, agents, notes, contextHistory, searchFiles, setActiveAgent, recordRecentAgent, addTab, setActiveTab, recentAgentIds, onClose])

  // Clamp selected index when results change
  useEffect(() => {
    if (selectedIndex >= results.length) {
      setSelectedIndex(Math.max(0, results.length - 1))
    }
  }, [results.length, selectedIndex])

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((i) => (i + 1) % results.length)
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((i) => (i - 1 + results.length) % results.length)
          break
        case 'Enter':
          e.preventDefault()
          if (results[selectedIndex]) {
            results[selectedIndex].onSelect()
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    },
    [results, selectedIndex, onClose]
  )

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const item = list.children[selectedIndex] as HTMLElement
    if (item) {
      item.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  if (!isOpen) return null

  // Group results by type for rendering
  // Only show Recent section when no query is typed
  const recentOnly = query.trim()
    ? []
    : results.filter(
        (r) => r.type === 'agent' && recentAgentIds.includes(r.id.replace('agent-', ''))
      )
  const agentsOnly = query.trim()
    ? results.filter((r) => r.type === 'agent')
    : results.filter(
        (r) => r.type === 'agent' && !recentAgentIds.includes(r.id.replace('agent-', ''))
      )
  const notesOnly = results.filter((r) => r.type === 'note')
  const contextOnly = results.filter((r) => r.type === 'context')
  const filesOnly = results.filter((r) => r.type === 'file')

  const renderSection = (
    label: string,
    items: SearchResult[],
    startIndex: number
  ) => {
    if (items.length === 0) return null
    return (
      <div key={label}>
        <div className="px-3 py-1.5 text-[10px] font-medium text-c-muted uppercase tracking-wider">
          {label}
        </div>
        {items.map((result, i) => {
          const globalIndex = startIndex + i
          const isSelected = globalIndex === selectedIndex
          const isCurrentAgent =
            result.type === 'agent' &&
            result.id.replace('agent-', '') === activeAgentId

          return (
            <button
              key={result.id}
              onClick={result.onSelect}
              onMouseEnter={() => setSelectedIndex(globalIndex)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                isSelected
                  ? 'bg-mothership-600/20 text-c-text'
                  : 'text-c-muted hover:bg-c-surface/50'
              }`}
            >
              <span className="flex-shrink-0 w-5 flex justify-center">
                {result.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-medium truncate ${
                      isSelected ? 'text-c-text' : 'text-c-text-dim'
                    }`}
                  >
                    {result.title}
                  </span>
                  {isCurrentAgent && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-mothership-600/30 text-mothership-400">
                      active
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-c-muted truncate block">
                  {result.subtitle}
                </span>
              </div>
              {result.type === 'agent' && isSelected && (
                <Terminal className="w-3 h-3 text-c-muted-light flex-shrink-0" />
              )}
              {result.type !== 'agent' && isSelected && (
                <ArrowRight className="w-3 h-3 text-c-muted-light flex-shrink-0" />
              )}
            </button>
          )
        })}
      </div>
    )
  }

  const recentStartIndex = 0
  const agentStartIndex = recentStartIndex + recentOnly.length
  const noteStartIndex = agentStartIndex + agentsOnly.length
  const contextStartIndex = noteStartIndex + notesOnly.length
  const fileStartIndex = contextStartIndex + contextOnly.length

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-c-bg/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="relative w-full max-w-lg bg-c-card border border-c-border-strong/50 rounded-xl shadow-2xl shadow-c-bg/50 overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-c-border">
          <Search className="w-4 h-4 text-c-muted flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search agents, notes, files…"
            className="flex-1 bg-transparent text-sm text-c-text placeholder:text-c-muted-light outline-none"
          />
          <div className="flex items-center gap-1 text-[10px] text-c-muted-light">
            <kbd className="px-1 py-0.5 bg-c-surface rounded text-[9px] font-mono">⌘</kbd>
            <kbd className="px-1 py-0.5 bg-c-surface rounded text-[9px] font-mono">K</kbd>
          </div>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-c-muted">No results found</p>
              <p className="text-[10px] text-c-muted-light mt-1">
                Try a different search term
              </p>
            </div>
          ) : (
            <>
              {renderSection('Recent', recentOnly, recentStartIndex)}
              {renderSection('Agents', agentsOnly, agentStartIndex)}
              {renderSection('Notes', notesOnly, noteStartIndex)}
              {renderSection('Context', contextOnly, contextStartIndex)}
              {renderSection('Files', filesOnly, fileStartIndex)}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-c-border flex items-center justify-between">
          <div className="flex items-center gap-3 text-[10px] text-c-muted-light">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-c-surface rounded text-[9px] font-mono">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-c-surface rounded text-[9px] font-mono">↵</kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-c-surface rounded text-[9px] font-mono">esc</kbd>
              close
            </span>
          </div>
          <span className="text-[10px] text-c-muted-light">
            {results.length} result{results.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  )
}
