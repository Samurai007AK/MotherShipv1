import { useMemo } from 'react'
import { diffLines, type Change } from 'diff'

// ── Props ─────────────────────────────────────────────────────────────

interface DiffViewProps {
  oldContent: string
  newContent: string
  fileName: string
}

// ── Diff chunk renderer ───────────────────────────────────────────────

function DiffChunk({
  change,
  index,
  oldLineStart,
  newLineStart,
}: {
  change: Change
  index: number
  oldLineStart: number
  newLineStart: number
}) {
  const isAdded = change.added
  const isRemoved = change.removed

  const bgClass = isAdded
    ? 'bg-green-900/20'
    : isRemoved
    ? 'bg-red-900/20'
    : 'bg-transparent'

  const prefix = isAdded ? '+' : isRemoved ? '-' : ' '
  const prefixClass = isAdded ? 'text-green-400' : isRemoved ? 'text-red-400' : 'text-c-muted-light'

  const lines = change.value.split('\n')
  // Remove trailing empty line from split
  if (lines[lines.length - 1] === '') lines.pop()

  let oldLine = oldLineStart
  let newLine = newLineStart

  return (
    <>
      {lines.map((line, lineIdx) => {
        const showOldLine = !isAdded
        const showNewLine = !isRemoved

        const lineEl = (
          <div
            key={`${index}-${lineIdx}`}
            className={`flex font-mono text-[11px] leading-relaxed ${bgClass} hover:bg-white/[0.02]`}
          >
            {/* Old line number */}
            <span className={`w-10 flex-shrink-0 text-right pr-2 select-none ${isAdded ? 'text-transparent' : 'text-c-muted-light'}`}>
              {showOldLine ? oldLine : ''}
            </span>
            {/* New line number */}
            <span className={`w-10 flex-shrink-0 text-right pr-2 select-none ${isRemoved ? 'text-transparent' : 'text-c-muted-light'}`}>
              {showNewLine ? newLine : ''}
            </span>
            {/* Prefix (+/-/ ) */}
            <span className={`w-4 flex-shrink-0 select-none ${prefixClass}`}>{prefix}</span>
            {/* Content */}
            <span className={`flex-1 whitespace-pre ${isAdded ? 'text-green-300' : isRemoved ? 'text-red-300' : 'text-c-text-dim'}`}>
              {line || ' '}
            </span>
          </div>
        )

        if (!isAdded) oldLine++
        if (!isRemoved) newLine++

        return lineEl
      })}
    </>
  )
}

// ── Stats bar ─────────────────────────────────────────────────────────

function DiffStats({ changes, oldContent, newContent }: { changes: Change[]; oldContent: string; newContent: string }) {
  const added = changes.filter((c) => c.added).reduce((acc, c) => acc + (c.count || 0), 0)
  const removed = changes.filter((c) => c.removed).reduce((acc, c) => acc + (c.count || 0), 0)

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 border-b border-c-border bg-c-surface/30 text-[10px]">
      <span className="text-c-muted-light font-mono">
        {oldContent.split('\n').length} → {newContent.split('\n').length} lines
      </span>
      {added > 0 && <span className="text-green-400 font-medium">+{added}</span>}
      {removed > 0 && <span className="text-red-400 font-medium">-{removed}</span>}
      <div className="flex-1" />
      <div className="flex items-center gap-1">
        <span className="w-2 h-2 rounded-sm bg-green-500/60" />
        <span className="text-c-muted-light">added</span>
        <span className="w-2 h-2 rounded-sm bg-red-500/60 ml-2" />
        <span className="text-c-muted-light">removed</span>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────

export function DiffView({ oldContent, newContent, fileName }: DiffViewProps) {
  const changes = useMemo(() => {
    return diffLines(oldContent, newContent)
  }, [oldContent, newContent])

  if (oldContent === newContent) {
    return (
      <div className="flex flex-col h-full">
        <DiffStats changes={changes} oldContent={oldContent} newContent={newContent} />
        <div className="flex-1 flex items-center justify-center text-[11px] text-c-muted-light">
          No changes — files are identical
        </div>
      </div>
    )
  }

  // Track cumulative line numbers across chunks
  let oldLine = 1
  let newLine = 1

  return (
    <div className="flex flex-col h-full">
      {/* Stats */}
      <DiffStats changes={changes} oldContent={oldContent} newContent={newContent} />

      {/* Filename header */}
      <div className="flex items-center gap-3 px-3 py-1 border-b border-c-border/50 bg-c-surface/20 text-[9px] font-mono">
        <span className="text-red-400">--- a/{fileName}</span>
        <span className="text-green-400">+++ b/{fileName}</span>
      </div>

      {/* Unified diff */}
      <div className="flex-1 overflow-y-auto py-1">
        {changes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[11px] text-c-muted-light">
            No differences
          </div>
        ) : (
          changes.map((change, index) => {
            const chunk = (
              <DiffChunk
                key={index}
                change={change}
                index={index}
                oldLineStart={oldLine}
                newLineStart={newLine}
              />
            )
            // Advance line counters
            if (!change.added) oldLine += change.count || 0
            if (!change.removed) newLine += change.count || 0
            return chunk
          })
        )}
      </div>
    </div>
  )
}
