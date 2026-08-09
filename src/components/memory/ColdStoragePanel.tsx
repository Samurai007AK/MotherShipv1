import { useState, useEffect, useCallback } from 'react'
import { useMemoryStore, type ArchivedSessionInfo } from '../../stores/memoryStore'
import {
  Archive,
  RotateCcw,
  Trash2,
  HardDrive,
  Database,
  ChevronDown,
  ChevronRight,
  Clock,
  Info,
} from 'lucide-react'

// --- Preset durations ---

interface Preset {
  label: string
  hours: number
}

const ARCHIVE_PRESETS: Preset[] = [
  { label: '24 hours', hours: 24 },
  { label: '48 hours', hours: 48 },
  { label: '72 hours', hours: 72 },
  { label: '1 week', hours: 168 },
  { label: '2 weeks', hours: 336 },
]

const PRUNE_PRESETS: { label: string; days: number; minKeep: number }[] = [
  { label: '7 days, keep 10', days: 7, minKeep: 10 },
  { label: '14 days, keep 20', days: 14, minKeep: 20 },
  { label: '30 days, keep 50', days: 30, minKeep: 50 },
  { label: '60 days, keep 100', days: 60, minKeep: 100 },
]

// --- Format helpers ---

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// --- Archived Session Row ---

function ArchivedSessionRow({
  session,
  onRestore,
  isRestoring,
}: {
  session: ArchivedSessionInfo
  onRestore: () => void
  isRestoring: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg bg-c-surface/50 border border-c-border-strong/30 hover:border-c-border-strong transition-colors">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-2 text-left"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-c-muted flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-c-muted flex-shrink-0" />
        )}
        <Archive className="w-3.5 h-3.5 text-mothership-400 flex-shrink-0" />
        <span className="text-[11px] font-medium text-c-text-dim">{session.agent_id}</span>
        <span className="text-[10px] text-c-muted-light ml-auto">{formatBytes(session.size_bytes)}</span>
      </button>

      {expanded && (
        <div className="px-2 pb-2 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] text-c-muted">
            <Database className="w-3 h-3" />
            <span>Session: {session.session_id}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-c-muted">
            <HardDrive className="w-3 h-3" />
            <span className="font-mono text-[9px] truncate">{session.file_path}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-c-muted">
            <Info className="w-3 h-3" />
            <span>Size: {formatBytes(session.size_bytes)}</span>
          </div>
          <button
            onClick={onRestore}
            disabled={isRestoring}
            className="flex items-center gap-1 px-2 py-1 mt-1 rounded text-[10px] font-medium bg-mothership-600/20 text-mothership-400 hover:bg-mothership-600/30 disabled:opacity-50 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            {isRestoring ? 'Restoring...' : 'Restore'}
          </button>
        </div>
      )}
    </div>
  )
}

// --- Main Component ---

export function ColdStoragePanel() {
  const {
    archivedSessions,
    loadArchivedSessions,
    archiveOldSessions,
    pruneOldSnapshots,
    restoreArchivedSession,
  } = useMemoryStore()

  const [isLoading, setIsLoading] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)
  const [isPruning, setIsPruning] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [resultMessage, setResultMessage] = useState<string | null>(null)
  const [resultType, setResultType] = useState<'success' | 'error'>('success')
  const [showCustomArchive, setShowCustomArchive] = useState(false)
  const [customArchiveHours, setCustomArchiveHours] = useState('')
  const [showCustomPrune, setShowCustomPrune] = useState(false)
  const [customPruneDays, setCustomPruneDays] = useState('')
  const [customPruneKeep, setCustomPruneKeep] = useState('')

  // Auto-size calculation
  const totalSize = archivedSessions.reduce((sum, s) => sum + s.size_bytes, 0)
  const totalSessions = archivedSessions.length

  // Load on mount
  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      await loadArchivedSessions()
      setIsLoading(false)
    }
    load()
  }, [loadArchivedSessions])

  const showResult = useCallback((message: string, type: 'success' | 'error') => {
    setResultMessage(message)
    setResultType(type)
    setTimeout(() => setResultMessage(null), 4000)
  }, [])

  const handleArchive = useCallback(
    async (hours: number) => {
      setIsArchiving(true)
      const count = await archiveOldSessions(hours)
      setIsArchiving(false)
      if (count > 0) {
        showResult(`Archived ${count} session${count > 1 ? 's' : ''}`, 'success')
      } else {
        showResult('No sessions to archive', 'success')
      }
    },
    [archiveOldSessions, showResult]
  )

  const handlePrune = useCallback(
    async (days: number, minKeep: number) => {
      setIsPruning(true)
      const count = await pruneOldSnapshots(days, minKeep)
      setIsPruning(false)
      if (count > 0) {
        showResult(`Pruned ${count} old snapshot${count > 1 ? 's' : ''}`, 'success')
      } else {
        showResult('No snapshots to prune', 'success')
      }
    },
    [pruneOldSnapshots, showResult]
  )

  const handleRestore = useCallback(
    async (session: ArchivedSessionInfo) => {
      setRestoringId(session.session_id)
      const count = await restoreArchivedSession(session.agent_id, session.session_id)
      setRestoringId(null)
      if (count > 0) {
        showResult(`Restored ${count} entr${count > 1 ? 'ies' : 'y'}`, 'success')
      } else {
        showResult('Nothing to restore', 'error')
      }
    },
    [restoreArchivedSession, showResult]
  )

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-3 border-b border-c-border/50">
        <div className="flex items-center gap-2 mb-1">
          <HardDrive className="w-4 h-4 text-mothership-400" />
          <h3 className="text-xs font-medium text-c-text">Cold Storage</h3>
        </div>
        <p className="text-[10px] text-c-muted-light leading-relaxed">
          Manage archived memory entries. Old sessions are compressed and stored
          on disk to keep the active database lean while preserving history.
        </p>

        {/* Stats */}
        <div className="flex items-center gap-3 mt-2">
          <div className="flex items-center gap-1 text-[10px] text-c-muted">
            <Archive className="w-3 h-3" />
            <span>{totalSessions} archived</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-c-muted">
            <HardDrive className="w-3 h-3" />
            <span>{formatBytes(totalSize)} total</span>
          </div>
        </div>
      </div>

      {/* Result toast */}
      {resultMessage && (
        <div
          className={`mx-2 mt-2 px-2 py-1.5 rounded text-[10px] font-medium transition-opacity ${
            resultType === 'success'
              ? 'bg-green-600/20 text-green-400'
              : 'bg-red-600/20 text-red-400'
          }`}
        >
          {resultMessage}
        </div>
      )}

      {/* Actions */}
      <div className="p-2 space-y-2">
        {/* Archive section */}
        <div className="rounded-lg bg-c-surface/30 border border-c-border-strong/20 p-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Archive className="w-3.5 h-3.5 text-mothership-400" />
            <span className="text-[10px] font-medium text-c-text-dim">Archive Old Sessions</span>
          </div>
          <p className="text-[9px] text-c-muted-light mb-2">
            Move old memory entries from SQLite to compressed JSON files on disk.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ARCHIVE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => handleArchive(preset.hours)}
                disabled={isArchiving}
                className="px-2 py-1 rounded text-[9px] font-medium bg-c-surface-hover/50 text-c-muted hover:text-c-text-dim hover:bg-c-surface-hover disabled:opacity-50 transition-colors"
              >
                {preset.label}
              </button>
            ))}
            <button
              onClick={() => setShowCustomArchive(!showCustomArchive)}
              className="px-2 py-1 rounded text-[9px] font-medium bg-c-surface-hover/50 text-c-muted hover:text-c-text-dim transition-colors"
            >
              Custom...
            </button>
          </div>
          {showCustomArchive && (
            <div className="flex items-center gap-1.5 mt-2">
              <input
                type="number"
                value={customArchiveHours}
                onChange={(e) => setCustomArchiveHours(e.target.value)}
                placeholder="Age in hours"
                min={1}
                className="flex-1 px-2 py-1 bg-c-surface border border-c-border-strong rounded text-[10px] text-c-text-dim placeholder:text-c-muted-light outline-none focus:border-mothership-500/50"
              />
              <button
                onClick={() => {
                  const h = parseInt(customArchiveHours)
                  if (h > 0) handleArchive(h)
                }}
                disabled={isArchiving || !customArchiveHours}
                className="px-2 py-1 rounded text-[9px] font-medium bg-mothership-600/20 text-mothership-400 hover:bg-mothership-600/30 disabled:opacity-50 transition-colors"
              >
                Go
              </button>
            </div>
          )}
        </div>

        {/* Prune section */}
        <div className="rounded-lg bg-c-surface/30 border border-c-border-strong/20 p-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Trash2 className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-[10px] font-medium text-c-text-dim">Prune Old Snapshots</span>
          </div>
          <p className="text-[9px] text-c-muted-light mb-2">
            Remove old context snapshots from the database, keeping at least N per agent.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PRUNE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => handlePrune(preset.days, preset.minKeep)}
                disabled={isPruning}
                className="px-2 py-1 rounded text-[9px] font-medium bg-c-surface-hover/50 text-c-muted hover:text-c-text-dim hover:bg-c-surface-hover disabled:opacity-50 transition-colors"
              >
                {preset.label}
              </button>
            ))}
            <button
              onClick={() => setShowCustomPrune(!showCustomPrune)}
              className="px-2 py-1 rounded text-[9px] font-medium bg-c-surface-hover/50 text-c-muted hover:text-c-text-dim transition-colors"
            >
              Custom...
            </button>
          </div>
          {showCustomPrune && (
            <div className="flex items-center gap-1.5 mt-2">
              <input
                type="number"
                value={customPruneDays}
                onChange={(e) => setCustomPruneDays(e.target.value)}
                placeholder="Max age (days)"
                min={1}
                className="flex-1 px-2 py-1 bg-c-surface border border-c-border-strong rounded text-[10px] text-c-text-dim placeholder:text-c-muted-light outline-none focus:border-mothership-500/50"
              />
              <input
                type="number"
                value={customPruneKeep}
                onChange={(e) => setCustomPruneKeep(e.target.value)}
                placeholder="Min keep"
                min={1}
                className="w-20 px-2 py-1 bg-c-surface border border-c-border-strong rounded text-[10px] text-c-text-dim placeholder:text-c-muted-light outline-none focus:border-mothership-500/50"
              />
              <button
                onClick={() => {
                  const d = parseInt(customPruneDays)
                  const k = parseInt(customPruneKeep)
                  if (d > 0 && k > 0) handlePrune(d, k)
                }}
                disabled={isPruning || !customPruneDays || !customPruneKeep}
                className="px-2 py-1 rounded text-[9px] font-medium bg-mothership-600/20 text-mothership-400 hover:bg-mothership-600/30 disabled:opacity-50 transition-colors"
              >
                Go
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Archived sessions list */}
      <div className="flex-1 px-2 pb-2 overflow-y-auto">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Clock className="w-3 h-3 text-c-muted" />
          <span className="text-[10px] font-medium text-c-muted">Archived Sessions</span>
          <button
            onClick={loadArchivedSessions}
            className="ml-auto p-0.5 rounded hover:bg-c-surface text-c-muted hover:text-c-text-dim transition-colors"
            title="Refresh"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-6 text-[10px] text-c-muted-light">Loading...</div>
        ) : archivedSessions.length === 0 ? (
          <div className="text-center py-6">
            <HardDrive className="w-6 h-6 mx-auto mb-1.5 text-c-muted-light" />
            <p className="text-[10px] text-c-muted-light">No archived sessions</p>
            <p className="text-[9px] text-c-muted-light mt-0.5">
              Archive old sessions above to see them here
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {archivedSessions.map((session) => (
              <ArchivedSessionRow
                key={session.session_id}
                session={session}
                onRestore={() => handleRestore(session)}
                isRestoring={restoringId === session.session_id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
