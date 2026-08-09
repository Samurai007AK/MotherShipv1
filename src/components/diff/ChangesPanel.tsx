import { useState, useEffect, useCallback } from 'react'
import { useWorktreeStore, type FileContentPair } from '../../stores/worktreeStore'
import { FileDiffCard, DiffStatsBar, EmptyDiffState } from './DiffViewer'
import { RefreshCw, GitCommit } from 'lucide-react'

// --- Main Changes Panel ---

export function ChangesPanel() {
  const { worktrees, activeWorktreeId, getWorktreeFileDiffs } = useWorktreeStore()
  const [fileDiffs, setFileDiffs] = useState<FileContentPair[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeWorktree = worktrees.find((w) => w.id === activeWorktreeId)

  const fetchDiffs = useCallback(async () => {
    if (!activeWorktree) {
      setFileDiffs([])
      return
    }

    setLoading(true)
    setError(null)
    try {
      const diffs = await getWorktreeFileDiffs(activeWorktree.worktreePath)
      setFileDiffs(diffs)
    } catch (e) {
      console.error('Failed to fetch diffs:', e)
      setError(String(e))
      setFileDiffs([])
    } finally {
      setLoading(false)
    }
  }, [activeWorktree, getWorktreeFileDiffs])

  // Auto-fetch when active worktree changes
  useEffect(() => {
    fetchDiffs()
  }, [fetchDiffs])

  // Poll for changes every 10 seconds if there's an active worktree
  useEffect(() => {
    if (!activeWorktree) return
    const interval = setInterval(fetchDiffs, 10000)
    return () => clearInterval(interval)
  }, [activeWorktree, fetchDiffs])

  const totalInsertions = fileDiffs.reduce((sum, f) => sum + f.insertions, 0)
  const totalDeletions = fileDiffs.reduce((sum, f) => sum + f.deletions, 0)

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <GitCommit className="w-3.5 h-3.5 text-c-muted" />
          <span className="text-[10px] font-medium text-c-text-dim">
            {activeWorktree ? activeWorktree.branchName : 'Changes'}
          </span>
        </div>
        <button
          onClick={fetchDiffs}
          disabled={loading}
          className="p-1 rounded hover:bg-c-surface/50 text-c-muted hover:text-c-text-dim transition-colors disabled:opacity-50"
          title="Refresh diffs"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Diff stats */}
      {fileDiffs.length > 0 && (
        <div className="px-1">
          <DiffStatsBar
            filesChanged={fileDiffs.length}
            insertions={totalInsertions}
            deletions={totalDeletions}
          />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="px-3 py-2 text-[10px] text-red-400 bg-red-500/10 rounded-lg border border-red-500/20">
          Failed to load diffs: {error}
        </div>
      )}

      {/* Loading state */}
      {loading && fileDiffs.length === 0 && !error && (
        <div className="px-3 py-4 text-[10px] text-c-muted-light text-center">
          Loading diffs...
        </div>
      )}

      {/* File diff list */}
      {fileDiffs.length > 0 ? (
        <div className="space-y-1.5">
          {fileDiffs.map((file, i) => (
            <FileDiffCard
              key={`${file.path}-${i}`}
              path={file.path}
              status={file.status}
              oldContent={file.old_content}
              newContent={file.new_content}
              insertions={file.insertions}
              deletions={file.deletions}
              defaultOpen={i === 0}
            />
          ))}
        </div>
      ) : !loading && !error && (
        <EmptyDiffState />
      )}
    </div>
  )
}
