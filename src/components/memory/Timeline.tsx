import { useState, useMemo, memo } from 'react'
import {
  useMemoryStore,
} from '../../stores/memoryStore'
import {
  Clock,
  MessageSquare,
  FileText,
  Lightbulb,
  ArrowRight,
  GitBranch,
  Filter,
  X,
} from 'lucide-react'

// --- Timestamp grouping ---

type TimeGroup = 'Today' | 'Yesterday' | 'This Week' | 'Older'

function getTimeGroup(dateStr: string): TimeGroup {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays <= 7) return 'This Week'
  return 'Older'
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// --- Types ---

interface TimelineItem {
  id: string
  type: 'note' | 'prompt' | 'output' | 'summary' | 'handoff' | 'decision'
  agentId?: string
  content: string
  summary?: string
  tags?: string[]
  filesReferenced?: string[]
  createdAt: string
}

// --- Type icons ---

const TYPE_ICONS: Record<string, React.ReactNode> = {
  note: <FileText className="w-3 h-3 text-mothership-400" />,
  prompt: <MessageSquare className="w-3 h-3 text-blue-400" />,
  output: <FileText className="w-3 h-3 text-c-muted" />,
  summary: <Lightbulb className="w-3 h-3 text-yellow-400" />,
  handoff: <ArrowRight className="w-3 h-3 text-green-400" />,
  decision: <GitBranch className="w-3 h-3 text-purple-400" />,
}

const TYPE_LABELS: Record<string, string> = {
  note: 'Note',
  prompt: 'Prompt',
  output: 'Output',
  summary: 'Summary',
  handoff: 'Handoff',
  decision: 'Decision',
}

// --- Timeline Component ---

export function Timeline() {
  const notes = useMemoryStore((s) => s.notes)
  const contextHistory = useMemoryStore((s) => s.contextHistory)
  const [agentFilter, setAgentFilter] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  // Merge notes + context into a unified timeline
  const allItems = useMemo<TimelineItem[]>(() => {
    const noteItems: TimelineItem[] = notes.map((n) => ({
      id: n.id,
      type: 'note',
      agentId: n.agentId,
      content: n.content,
      tags: n.tags,
      filesReferenced: n.filesReferenced,
      createdAt: n.createdAt,
    }))

    const ctxItems: TimelineItem[] = contextHistory.map((c) => ({
      id: c.id,
      type: c.entryType,
      agentId: c.agentId,
      content: c.content,
      summary: c.summary,
      filesReferenced: c.filesReferenced,
      createdAt: c.createdAt,
    }))

    const merged = [...noteItems, ...ctxItems]
    merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return merged
  }, [notes, contextHistory])

  // Apply filters
  const filtered = useMemo(() => {
    let result = allItems
    if (agentFilter) {
      result = result.filter((item) => item.agentId === agentFilter)
    }
    if (typeFilter) {
      result = result.filter((item) => item.type === typeFilter)
    }
    return result
  }, [allItems, agentFilter, typeFilter])

  // Group by time
  const grouped = useMemo(() => {
    const groups = new Map<TimeGroup, TimelineItem[]>()
    for (const item of filtered) {
      const group = getTimeGroup(item.createdAt)
      if (!groups.has(group)) groups.set(group, [])
      groups.get(group)!.push(item)
    }
    return groups
  }, [filtered])

  // Unique agents for filter
  const agents = useMemo(() => {
    const set = new Set<string>()
    allItems.forEach((item) => {
      if (item.agentId) set.add(item.agentId)
    })
    return Array.from(set)
  }, [allItems])

  // Unique types for filter
  const types = useMemo(() => {
    const set = new Set<string>()
    allItems.forEach((item) => set.add(item.type))
    return Array.from(set)
  }, [allItems])

  return (
    <div className="flex flex-col h-full">
      {/* Header with filter toggle */}
      <div className="px-2 py-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-c-muted-light" />
          <span className="text-[10px] text-c-muted">{filtered.length} entries</span>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`p-1 rounded transition-colors ${
            showFilters || agentFilter || typeFilter
              ? 'bg-mothership-600/10 text-mothership-400'
              : 'text-c-muted-light hover:text-c-muted hover:bg-c-surface'
          }`}
          title="Filters"
        >
          <Filter className="w-3 h-3" />
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="px-2 pb-2 flex flex-col gap-1.5 animate-tooltip-in">
          {/* Agent filter */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[9px] text-c-muted-light w-10">Agent:</span>
            {agents.map((agent) => (
              <button
                key={agent}
                onClick={() => setAgentFilter(agentFilter === agent ? null : agent)}
                className={`px-1.5 py-0.5 text-[9px] rounded transition-colors ${
                  agentFilter === agent
                    ? 'bg-mothership-600/20 text-mothership-400'
                    : 'bg-c-surface text-c-muted hover:text-c-text-dim'
                }`}
              >
                {agent}
              </button>
            ))}
            {agentFilter && (
              <button onClick={() => setAgentFilter(null)} className="p-0.5 text-c-muted-light hover:text-c-muted">
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
          {/* Type filter */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[9px] text-c-muted-light w-10">Type:</span>
            {types.map((type) => (
              <button
                key={type}
                onClick={() => setTypeFilter(typeFilter === type ? null : type)}
                className={`px-1.5 py-0.5 text-[9px] rounded transition-colors ${
                  typeFilter === type
                    ? 'bg-mothership-600/20 text-mothership-400'
                    : 'bg-c-surface text-c-muted hover:text-c-text-dim'
                }`}
              >
                {TYPE_LABELS[type] || type}
              </button>
            ))}
            {typeFilter && (
              <button onClick={() => setTypeFilter(null)} className="p-0.5 text-c-muted-light hover:text-c-muted">
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Timeline entries grouped by time */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {Array.from(grouped.entries()).map(([group, items]) => (
          <div key={group} className="mb-3">
            <div className="sticky top-0 bg-c-card py-1 text-[9px] font-medium text-c-muted-light uppercase tracking-wider">
              {group}
            </div>
            <div className="space-y-1 ml-2 border-l border-c-border/50 pl-3">
              {items.map((item) => (
                <TimelineEntry key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-[11px] text-c-muted-light">
            No timeline entries
          </div>
        )}
      </div>
    </div>
  )
}

// --- Timeline Entry ---

const TimelineEntry = memo(function TimelineEntry({ item }: { item: TimelineItem }) {
  return (
    <div className="relative p-2 rounded-lg hover:bg-c-surface/50 transition-colors group">
      {/* Timeline dot */}
      <div className="absolute -left-[17px] top-3 w-2 h-2 rounded-full bg-c-border group-hover:bg-mothership-500 transition-colors" />

      <div className="flex items-center gap-1.5 mb-0.5">
        {TYPE_ICONS[item.type]}
        <span className="text-[10px] font-medium text-c-muted capitalize">
          {TYPE_LABELS[item.type] || item.type}
        </span>
        <span className="text-[9px] text-c-muted-light ml-auto">
          {item.agentId && `${item.agentId} · `}
          {formatTime(item.createdAt)}
          {getTimeGroup(item.createdAt) !== 'Today' && ` · ${formatDate(item.createdAt)}`}
        </span>
      </div>

      <p className="text-[11px] text-c-text-dim leading-relaxed">
        {item.content.length > 200
          ? `${item.content.slice(0, 200)}…`
          : item.content}
      </p>

      {item.summary && (
        <p className="text-[10px] text-c-muted mt-0.5 italic">{item.summary}</p>
      )}

      {item.tags && item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {item.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="px-1 py-0.5 text-[8px] bg-c-surface-hover/50 text-c-muted rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {item.filesReferenced && item.filesReferenced.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {item.filesReferenced.slice(0, 3).map((file) => (
            <span
              key={file}
              className="px-1 py-0.5 text-[8px] bg-c-surface-hover/30 text-c-muted rounded font-mono"
            >
              {file.split('/').pop()}
            </span>
          ))}
        </div>
      )}
    </div>
  )
})
