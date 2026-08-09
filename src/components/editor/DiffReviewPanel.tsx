import { useCallback } from 'react'
import { useEditorStore, type PendingChange } from '../../stores/editorStore'
import { DiffView } from './DiffView'
import { X, Check, XCircle, CheckSquare, XSquare, GitPullRequest, Clock } from 'lucide-react'

// ── Change card ───────────────────────────────────────────────────────

function ChangeCard({
  change,
  onAccept,
  onReject,
}: {
  change: PendingChange
  onAccept: () => void
  onReject: () => void
}) {
  const timeAgo = formatTimeAgo(change.createdAt)
  const isPending = change.status === 'pending'

  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${
      change.status === 'accepted'
        ? 'border-green-500/30 bg-green-900/10'
        : change.status === 'rejected'
        ? 'border-red-500/30 bg-red-900/10 opacity-60'
        : 'border-c-border-strong/30 bg-c-surface/50'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-c-border/50 bg-c-card/50">
        <div className="flex items-center gap-2 min-w-0">
          <GitPullRequest className={`w-3.5 h-3.5 flex-shrink-0 ${
            change.status === 'accepted'
              ? 'text-green-400'
              : change.status === 'rejected'
              ? 'text-red-400'
              : 'text-mothership-400'
          }`} />
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-c-text truncate">{change.summary}</div>
            <div className="flex items-center gap-2 text-[9px] text-c-muted-light">
              <span className="font-mono truncate">{change.fileName}</span>
              {change.agentId && <span>by {change.agentId}</span>}
              <span className="flex items-center gap-0.5">
                <Clock className="w-2 h-2" />
                {timeAgo}
              </span>
            </div>
          </div>
        </div>

        {/* Status badge */}
        {change.status === 'accepted' && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-600/20 text-green-400 font-medium flex items-center gap-0.5">
            <Check className="w-2.5 h-2.5" /> Accepted
          </span>
        )}
        {change.status === 'rejected' && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 font-medium flex items-center gap-0.5">
            <X className="w-2.5 h-2.5" /> Rejected
          </span>
        )}
        {isPending && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-600/20 text-yellow-400 font-medium">Pending</span>
        )}
      </div>

      {/* Diff */}
      <div className="max-h-80 overflow-y-auto border-b border-c-border/30">
        <DiffView
          oldContent={change.oldContent}
          newContent={change.newContent}
          fileName={change.fileName}
        />
      </div>

      {/* Actions */}
      {isPending && (
        <div className="flex items-center justify-end gap-1.5 px-3 py-2">
          <button
            onClick={onReject}
            className="flex items-center gap-1 px-2.5 py-1 text-[10px] rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <XCircle className="w-3 h-3" />
            Reject
          </button>
          <button
            onClick={onAccept}
            className="flex items-center gap-1 px-2.5 py-1 text-[10px] rounded bg-green-600 text-white hover:bg-green-500 transition-colors"
          >
            <Check className="w-3 h-3" />
            Accept
          </button>
        </div>
      )}

      {/* Accepted/Rejected actions indicator */}
      {!isPending && (
        <div className="flex items-center justify-end gap-1.5 px-3 py-1.5">
          <span className="text-[9px] text-c-muted-light">
            {change.status === 'accepted' ? 'Change applied to editor' : 'Change discarded'}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-c-muted p-6">
      <GitPullRequest className="w-8 h-8 text-c-muted-light mb-2" />
      <h3 className="text-sm font-medium text-c-muted mb-1">No pending changes</h3>
      <p className="text-xs text-c-muted-light text-center max-w-xs">
        Agent-proposed edits will appear here for review before being applied.
      </p>
    </div>
  )
}

// ── Main DiffReviewPanel ──────────────────────────────────────────────

export function DiffReviewPanel() {
  const {
    pendingChanges,
    acceptChange,
    rejectChange,
    acceptAllPending,
    rejectAllPending,
    setShowDiffReview,
  } = useEditorStore()

  const pendingCount = pendingChanges.filter((c) => c.status === 'pending').length
  const resolvedCount = pendingChanges.filter((c) => c.status !== 'pending').length

  const handleAccept = useCallback((id: string) => {
    acceptChange(id)
  }, [acceptChange])

  const handleReject = useCallback((id: string) => {
    rejectChange(id)
  }, [rejectChange])

  if (pendingChanges.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-c-border bg-c-card">
        <div className="flex items-center gap-2">
          <GitPullRequest className="w-3.5 h-3.5 text-mothership-400" />
          <span className="text-[11px] font-medium text-c-text">Review Changes</span>
          {pendingCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-600/20 text-yellow-400 font-medium">
              {pendingCount} pending
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {pendingCount > 0 && (
            <>
              <button
                onClick={rejectAllPending}
                className="flex items-center gap-0.5 px-2 py-1 text-[9px] rounded text-c-muted-light hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <XSquare className="w-2.5 h-2.5" />
                Reject all
              </button>
              <button
                onClick={acceptAllPending}
                className="flex items-center gap-0.5 px-2 py-1 text-[9px] rounded bg-mothership-600 text-white hover:bg-mothership-500 transition-colors"
              >
                <CheckSquare className="w-2.5 h-2.5" />
                Accept all
              </button>
            </>
          )}
          <button
            onClick={() => setShowDiffReview(false)}
            className="p-1 rounded hover:bg-c-surface text-c-muted-light hover:text-c-text transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {resolvedCount > 0 && (
        <div className="px-3 py-1 text-[9px] text-c-muted-light border-b border-c-border/50">
          {resolvedCount} change{resolvedCount !== 1 ? 's' : ''} resolved
        </div>
      )}

      {/* Changes list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {pendingChanges.map((change) => (
          <ChangeCard
            key={change.id}
            change={change}
            onAccept={() => handleAccept(change.id)}
            onReject={() => handleReject(change.id)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Helper ────────────────────────────────────────────────────────────

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
