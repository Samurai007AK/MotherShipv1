import { useEffect, useState, useCallback } from 'react'
import { useMemoryStore, type ReconsolidationFlag } from '../../stores/memoryStore'
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FileText,
  Scale,
  Eye,
} from 'lucide-react'

// --- Types ---

type FilterTab = 'open' | 'resolved' | 'dismissed' | 'all'

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'all', label: 'All' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'dismissed', label: 'Dismissed' },
]

// --- Helpers ---

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function confidenceColor(confidence: number): string {
  if (confidence >= 0.7) return 'text-red-400'
  if (confidence >= 0.4) return 'text-yellow-400'
  return 'text-c-muted'
}

// --- Flag Card ---

function FlagCard({
  flag,
  onResolve,
  isResolving,
}: {
  flag: ReconsolidationFlag
  onResolve: (resolution: 'resolved' | 'dismissed') => void
  isResolving: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const isOpen = flag.status === 'open'

  return (
    <div
      className={`rounded-lg border transition-colors ${
        isOpen
          ? 'bg-yellow-900/10 border-yellow-700/30'
          : flag.status === 'resolved'
            ? 'bg-green-900/10 border-green-700/20'
            : 'bg-c-surface/30 border-c-border-strong/20'
      }`}
    >
      {/* Header row — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-2 text-left"
      >
        {/* Status icon */}
        {isOpen ? (
          <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
        ) : flag.status === 'resolved' ? (
          <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
        ) : (
          <XCircle className="w-3.5 h-3.5 text-c-muted-light flex-shrink-0" />
        )}

        {/* Description */}
        <span className="text-[11px] text-c-text-dim leading-relaxed flex-1 line-clamp-1">
          {flag.description}
        </span>

        {/* Confidence badge */}
        <span
          className={`text-[9px] font-mono font-medium ${confidenceColor(flag.confidence)}`}
        >
          {(flag.confidence * 100).toFixed(0)}%
        </span>

        {/* Expand toggle */}
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-c-muted flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-c-muted flex-shrink-0" />
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-2 pb-2 space-y-2">
          {/* Conflict detail */}
          <div className="px-2 py-1.5 rounded bg-c-surface/50 border border-c-border-strong/20">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertCircle className="w-3 h-3 text-yellow-400" />
              <span className="text-[10px] font-medium text-c-muted">Conflict Detail</span>
            </div>
            <p className="text-[10px] text-c-text-dim leading-relaxed">{flag.description}</p>
          </div>

          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-2 text-[9px] text-c-muted">
            <div className="flex items-center gap-1">
              <Scale className="w-2.5 h-2.5" />
              <span>
                Confidence: <span className={confidenceColor(flag.confidence)}>{(flag.confidence * 100).toFixed(0)}%</span>
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Eye className="w-2.5 h-2.5" />
              <span>Status: <span className="font-medium capitalize">{flag.status}</span></span>
            </div>
            <div className="flex items-center gap-1">
              <FileText className="w-2.5 h-2.5" />
              <span>Flagged {formatTimeAgo(flag.created_at)}</span>
            </div>
            {flag.resolved_at && (
              <div className="flex items-center gap-1">
                <CheckCircle className="w-2.5 h-2.5" />
                <span>Resolved {formatTimeAgo(flag.resolved_at)}</span>
              </div>
            )}
          </div>

          {/* Action buttons — only for open flags */}
          {isOpen && (
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onResolve('resolved')
                }}
                disabled={isResolving}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-green-600/20 text-green-400 hover:bg-green-600/30 disabled:opacity-50 transition-colors"
              >
                <CheckCircle className="w-3 h-3" />
                {isResolving ? 'Accepting...' : 'Accept'}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onResolve('dismissed')
                }}
                disabled={isResolving}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-red-600/20 text-red-400 hover:bg-red-600/30 disabled:opacity-50 transition-colors"
              >
                <XCircle className="w-3 h-3" />
                {isResolving ? 'Dismissing...' : 'Dismiss'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// --- Main Component ---

export function ReconsolidationPanel() {
  const {
    reconsolidationFlags,
    loadReconsolidationFlags,
    resolveFlag,
  } = useMemoryStore()

  const [activeFilter, setActiveFilter] = useState<FilterTab>('open')
  const [isLoading, setIsLoading] = useState(false)
  const [resolvingId, setResolvingId] = useState<string | null>(null)

  // Load flags on mount and when switching filter tabs
  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      await loadReconsolidationFlags(activeFilter === 'all' ? undefined : activeFilter)
      setIsLoading(false)
    }
    load()
  }, [loadReconsolidationFlags, activeFilter])

  // Handle resolve
  const handleResolve = useCallback(
    async (flagId: string, resolution: 'resolved' | 'dismissed') => {
      setResolvingId(flagId)
      await resolveFlag(flagId, resolution)
      setResolvingId(null)
      // Reload flags to reflect the change
      loadReconsolidationFlags(activeFilter === 'all' ? undefined : activeFilter)
    },
    [resolveFlag, loadReconsolidationFlags, activeFilter]
  )

  // Compute stats from all loaded flags
  const openCount = reconsolidationFlags.filter((f) => f.status === 'open').length
  const resolvedCount = reconsolidationFlags.filter((f) => f.status === 'resolved').length
  const dismissedCount = reconsolidationFlags.filter((f) => f.status === 'dismissed').length

  // Filter locally for 'all' tab or rely on backend filter
  const filteredFlags = activeFilter === 'all'
    ? reconsolidationFlags
    : reconsolidationFlags.filter((f) => f.status === activeFilter)

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-3 border-b border-c-border/50">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="w-4 h-4 text-yellow-400" />
          <h3 className="text-xs font-medium text-c-text">Reconsolidation</h3>
        </div>
        <p className="text-[10px] text-c-muted-light leading-relaxed">
          Conflicts detected between auto-captured episode memory and curated
          note memory. Review and resolve contradictions to keep your knowledge
          base consistent.
        </p>

        {/* Stats row */}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <div className="flex items-center gap-1 text-[10px]">
            <AlertTriangle className="w-3 h-3 text-yellow-400" />
            <span className="text-yellow-400 font-medium">{openCount}</span>
            <span className="text-c-muted">open</span>
          </div>
          <div className="flex items-center gap-1 text-[10px]">
            <CheckCircle className="w-3 h-3 text-green-400" />
            <span className="text-green-400 font-medium">{resolvedCount}</span>
            <span className="text-c-muted">resolved</span>
          </div>
          <div className="flex items-center gap-1 text-[10px]">
            <XCircle className="w-3 h-3 text-c-muted-light" />
            <span className="text-c-muted font-medium">{dismissedCount}</span>
            <span className="text-c-muted">dismissed</span>
          </div>

          {/* Refresh button */}
          <button
            onClick={() => loadReconsolidationFlags(activeFilter === 'all' ? undefined : activeFilter)}
            className="ml-auto p-0.5 rounded hover:bg-c-surface text-c-muted hover:text-c-text-dim transition-colors"
            title="Refresh flags"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-c-border/50">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveFilter(tab.id)}
            className={`flex-1 py-1.5 text-[10px] font-medium transition-colors ${
              activeFilter === tab.id
                ? 'text-c-text border-b-2 border-mothership-500'
                : 'text-c-muted hover:text-c-muted-light'
            }`}
          >
            {tab.label}
            {tab.id === 'open' && openCount > 0 && (
              <span className="ml-1 px-1 py-0.5 text-[8px] bg-yellow-600/30 text-yellow-400 rounded-full">
                {openCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Flag list */}
      <div className="flex-1 px-2 py-2 space-y-1.5 overflow-y-auto">
        {isLoading ? (
          <div className="text-center py-8 text-[11px] text-c-muted-light">Loading...</div>
        ) : filteredFlags.length === 0 ? (
          <div className="text-center py-8">
            <AlertCircle className="w-6 h-6 mx-auto mb-1.5 text-c-muted-light" />
            <p className="text-[11px] text-c-muted-light">
              {activeFilter === 'open'
                ? 'No open conflicts — your knowledge is consistent!'
                : activeFilter === 'all'
                  ? 'No reconsolidation flags yet'
                  : `No ${activeFilter} flags`}
            </p>
            <p className="text-[10px] text-c-muted-light mt-0.5">
              {activeFilter === 'open'
                ? 'Conflicts appear here when episode memory contradicts notes'
                : ''}
            </p>
          </div>
        ) : (
          filteredFlags.map((flag) => (
            <FlagCard
              key={flag.id}
              flag={flag}
              onResolve={(resolution) => handleResolve(flag.id, resolution)}
              isResolving={resolvingId === flag.id}
            />
          ))
        )}
      </div>
    </div>
  )
}
