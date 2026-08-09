import { useState, memo } from 'react'
import ReactDiffViewer from 'react-diff-viewer-continued'
import { ChevronDown, ChevronRight, FileText, Plus, Minus } from 'lucide-react'

// --- File Diff Card ---

interface FileDiffProps {
  path: string
  status: string
  oldContent: string
  newContent: string
  insertions: number
  deletions: number
  defaultOpen?: boolean
}

function getStatusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case 'A':
      return { label: 'Added', className: 'bg-green-500/20 text-green-400 border-green-500/30' }
    case 'D':
      return { label: 'Deleted', className: 'bg-red-500/20 text-red-400 border-red-500/30' }
    case 'M':
      return { label: 'Modified', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' }
    case 'R':
      return { label: 'Renamed', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' }
    default:
      return { label: status, className: 'bg-c-surface-hover/50 text-c-muted border-c-border-strong/30' }
  }
}

export const FileDiffCard = memo(function FileDiffCard({
  path,
  status,
  oldContent,
  newContent,
  insertions,
  deletions,
  defaultOpen = false,
}: FileDiffProps) {
  const [expanded, setExpanded] = useState(defaultOpen)
  const badge = getStatusBadge(status)

  return (
    <div className="rounded-lg border border-c-border-strong/30 bg-c-surface/30 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-c-surface/50 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-c-muted flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-c-muted flex-shrink-0" />
        )}
        <FileText className="w-3 h-3 text-c-muted-light flex-shrink-0" />
        <span className="text-[11px] font-medium text-c-text-dim truncate flex-1">{path}</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${badge.className}`}>
          {badge.label}
        </span>
        {insertions > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-green-400 font-medium">
            <Plus className="w-2.5 h-2.5" />
            {insertions}
          </span>
        )}
        {deletions > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] text-red-400 font-medium">
            <Minus className="w-2.5 h-2.5" />
            {deletions}
          </span>
        )}
      </button>

      {/* Diff content */}
      {expanded && (
        <div className="border-t border-c-border-strong/20 text-[10px] font-mono">
          <ReactDiffViewer
            oldValue={oldContent}
            newValue={newContent}
            splitView={true}
            useDarkTheme={true}
            showDiffOnly={false}
            extraLinesSurroundingDiff={3}
            leftTitle="Original"
            rightTitle="Changed"
            styles={{
              variables: {
                dark: {
                  diffViewerBackground: 'transparent',
                  diffViewerColor: '#a1a1aa',
                  addedBackground: 'rgba(34, 197, 94, 0.08)',
                  addedColor: '#e1e1e6',
                  removedBackground: 'rgba(239, 68, 68, 0.08)',
                  removedColor: '#e1e1e6',
                  wordAddedBackground: 'rgba(34, 197, 94, 0.20)',
                  wordRemovedBackground: 'rgba(239, 68, 68, 0.20)',
                  addedGutterBackground: 'rgba(34, 197, 94, 0.12)',
                  removedGutterBackground: 'rgba(239, 68, 68, 0.12)',
                  gutterBackground: 'rgba(255, 255, 255, 0.03)',
                  gutterColor: '#666',
                  highlightBackground: 'rgba(255, 255, 255, 0.04)',
                  codeFoldBackground: 'rgba(255, 255, 255, 0.03)',
                  codeFoldGutterBackground: 'rgba(255, 255, 255, 0.03)',
                  emptyLineBackground: 'transparent',
                },
              },
            }}
          />
        </div>
      )}
    </div>
  )
})

// --- Diff Stats Bar ---

export function DiffStatsBar({
  filesChanged,
  insertions,
  deletions,
}: {
  filesChanged: number
  insertions: number
  deletions: number
}) {
  const total = insertions + deletions
  const insertWidth = total > 0 ? (insertions / total) * 100 : 0

  return (
    <div className="flex items-center gap-3 text-[10px] text-c-muted">
      <span className="font-medium text-c-text-dim">{filesChanged} files</span>
      <div className="flex items-center gap-2 flex-1">
        <div className="flex-1 h-1.5 rounded-full bg-c-surface-hover/50 overflow-hidden flex">
          <div
            className="h-full bg-green-500/60 rounded-l-full transition-all"
            style={{ width: `${insertWidth}%` }}
          />
          <div
            className="h-full bg-red-500/60 rounded-r-full transition-all"
            style={{ width: `${100 - insertWidth}%` }}
          />
        </div>
      </div>
      <span className="flex items-center gap-1 text-green-400">
        <Plus className="w-2.5 h-2.5" />{insertions}
      </span>
      <span className="flex items-center gap-1 text-red-400">
        <Minus className="w-2.5 h-2.5" />{deletions}
      </span>
    </div>
  )
}

// --- Empty Diff State ---

export function EmptyDiffState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <FileText className="w-6 h-6 text-c-muted-light mb-2" />
      <p className="text-[11px] text-c-muted-light">No file diffs to show</p>
      <p className="text-[9px] text-c-muted mt-1">
        Open a worktree terminal and make changes to see diffs here
      </p>
    </div>
  )
}
