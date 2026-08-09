import { useState, useEffect, useRef } from 'react'
import ReactDiffViewer from 'react-diff-viewer-continued'
import { codeToHtml } from 'shiki'
import { useWorktreeStore, type WorktreeInfo, type FileContentPair } from '../../stores/worktreeStore'
import {
  FileText,
  Plus,
  Minus,
  Pencil,
  Trash2,
  SplitSquareHorizontal,
  Columns,
  Loader2,
  X,
  Search,
} from 'lucide-react'

// ── Cache for highlighted code ────────────────────────────────────────────

const highlightCache = new Map<string, string>()

async function highlightCode(code: string, lang: string, theme: string): Promise<string> {
  const key = `${lang}:${theme}:${code.slice(0, 200)}`
  const cached = highlightCache.get(key)
  if (cached) return cached

  try {
    const html = await codeToHtml(code, {
      lang: lang || 'text',
      theme: theme === 'dark' ? 'dark-plus' : 'light-plus',
    })
    // Extract the inner content (shiki returns a full HTML structure)
    highlightCache.set(key, html)
    return html
  } catch {
    // Fallback: escape and wrap
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    return `<span class="text-c-text font-mono">${escaped}</span>`
  }
}

// ── Props ─────────────────────────────────────────────────────────────────

interface DiffViewerProps {
  worktree: WorktreeInfo
  onClose: () => void
}

// ── Status Icon ───────────────────────────────────────────────────────────

function FileStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'A':
      return <Plus className="w-3 h-3 text-green-500" />
    case 'D':
      return <Trash2 className="w-3 h-3 text-red-500" />
    case 'M':
      return <Pencil className="w-3 h-3 text-mothership-400" />
    default:
      return <FileText className="w-3 h-3 text-c-muted-light" />
  }
}

function FileStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    A: 'bg-green-500/20 text-green-500',
    M: 'bg-mothership-500/20 text-mothership-400',
    D: 'bg-red-500/20 text-red-500',
  }
  return (
    <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${colors[status] || 'bg-c-surface text-c-muted-light'}`}>
      {status}
    </span>
  )
}

// ── Syntax-highlighted code block ─────────────────────────────────────────

function HighlightedBlock({
  code,
  language,
  isDark,
}: {
  code: string
  language: string
  isDark: boolean
}) {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    highlightCode(code, language, isDark ? 'dark' : 'light').then(setHtml)
  }, [code, language, isDark])

  if (!html) {
    return (
      <span className="text-c-text font-mono text-[11px] leading-relaxed whitespace-pre">
        {code}
      </span>
    )
  }

  return (
    <span
      className="[&_pre]:inline [&_code]:inline font-mono text-[11px] leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

// ── File Summary Row ──────────────────────────────────────────────────────

function FileSummaryRow({
  file,
  isSelected,
  onClick,
}: {
  file: FileContentPair
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
        isSelected
          ? 'bg-mothership-600/15 border-l-2 border-mothership-500'
          : 'border-l-2 border-transparent hover:bg-c-surface/50'
      }`}
    >
      <FileStatusIcon status={file.status} />
      <span className="flex-1 text-[11px] font-mono text-c-text truncate min-w-0">
        {file.path}
      </span>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {file.insertions > 0 && (
          <span className="text-[9px] text-green-500 font-medium">+{file.insertions}</span>
        )}
        {file.deletions > 0 && (
          <span className="text-[9px] text-red-500 font-medium">-{file.deletions}</span>
        )}
        <FileStatusBadge status={file.status} />
      </div>
    </button>
  )
}

// ── Main DiffViewer Component ─────────────────────────────────────────────

export function DiffViewer({ worktree, onClose }: DiffViewerProps) {
  const { getWorktreeFileDiffs } = useWorktreeStore()
  const [fileDiffs, setFileDiffs] = useState<FileContentPair[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [splitView, setSplitView] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showOnlyDiff, setShowOnlyDiff] = useState(true)
  const [isDark, setIsDark] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Detect dark mode
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    setIsDark(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Also check for explicit dark class on <html>
  useEffect(() => {
    const checkDark = () => setIsDark(document.documentElement.classList.contains('dark'))
    checkDark()
    const observer = new MutationObserver(checkDark)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  // Fetch file diffs
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)

    getWorktreeFileDiffs(worktree.worktreePath)
      .then((diffs) => {
        if (cancelled) return
        setFileDiffs(diffs)
        if (diffs.length > 0) {
          setSelectedPath(diffs[0].path)
        }
        setIsLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(String(e))
        setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [worktree.worktreePath, getWorktreeFileDiffs])

  const selectedFile = fileDiffs.find((f) => f.path === selectedPath)

  const totalInsertions = fileDiffs.reduce((acc, f) => acc + f.insertions, 0)
  const totalDeletions = fileDiffs.reduce((acc, f) => acc + f.deletions, 0)

  const langRef = useRef(selectedFile?.language || 'text')
  langRef.current = selectedFile?.language || 'text'

  const renderContent = (source: string) => (
    <HighlightedBlock
      code={source}
      language={langRef.current}
      isDark={isDark}
    />
  )

  // Custom styles for ReactDiffViewer to match Crew theme
  const diffStyles = {
    variables: {
      light: {
        codeFoldGutterBackground: 'rgb(var(--color-surface-rgb))',
        codeFoldBackground: 'rgb(var(--color-surface-rgb))',
        addedBackground: 'rgba(34, 197, 94, 0.08)',
        addedGutterBackground: 'rgba(34, 197, 94, 0.15)',
        removedBackground: 'rgba(239, 68, 68, 0.08)',
        removedGutterBackground: 'rgba(239, 68, 68, 0.15)',
        gutterBackground: 'rgb(var(--color-surface-rgb))',
        gutterBackgroundDark: 'rgb(var(--color-card-rgb))',
        diffViewerBackground: 'rgb(var(--color-card-rgb))',
        diffViewerTitleBackground: 'rgb(var(--color-surface-rgb))',
        diffViewerTitleColor: 'rgb(var(--color-text))',
        diffViewerTitleBorderColor: 'rgb(var(--color-border-rgb))',
        emptyLineBackground: 'rgb(var(--color-bg-rgb))',
        gutterColor: 'rgb(var(--color-muted))',
        textColor: 'rgb(var(--color-text))',
        codeFoldTextColor: 'rgb(var(--color-muted))',
        codeFoldContentColor: 'rgb(var(--color-muted))',
      },
      dark: {
        codeFoldGutterBackground: 'rgb(var(--color-surface-rgb))',
        codeFoldBackground: 'rgb(var(--color-surface-rgb))',
        addedBackground: 'rgba(34, 197, 94, 0.12)',
        addedGutterBackground: 'rgba(34, 197, 94, 0.25)',
        removedBackground: 'rgba(239, 68, 68, 0.12)',
        removedGutterBackground: 'rgba(239, 68, 68, 0.25)',
        gutterBackground: 'rgb(var(--color-surface-rgb))',
        gutterBackgroundDark: 'rgb(var(--color-card-rgb))',
        diffViewerBackground: 'rgb(var(--color-card-rgb))',
        diffViewerTitleBackground: 'rgb(var(--color-surface-rgb))',
        diffViewerTitleColor: 'rgb(var(--color-text))',
        diffViewerTitleBorderColor: 'rgb(var(--color-border-rgb))',
        emptyLineBackground: 'rgb(var(--color-bg-rgb))',
        gutterColor: 'rgb(var(--color-muted))',
        textColor: 'rgb(var(--color-text))',
        codeFoldTextColor: 'rgb(var(--color-muted))',
        codeFoldContentColor: 'rgb(var(--color-muted))',
      },
    },
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-c-muted">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-xs">Loading diffs...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-c-muted px-4">
        <p className="text-xs text-red-400 mb-2">{error}</p>
        <button
          onClick={onClose}
          className="text-[10px] text-mothership-400 hover:text-mothership-300 transition-colors"
        >
          Close
        </button>
      </div>
    )
  }

  if (fileDiffs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-c-muted px-4">
        <FileText className="w-6 h-6 mb-2 text-c-muted-light" />
        <p className="text-xs text-c-muted-light">No changes to display</p>
        <p className="text-[10px] text-c-muted-light mt-1">
          The working tree is clean.
        </p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="border border-c-border rounded overflow-hidden bg-c-card"
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── Header ────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-c-border bg-c-surface/50">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-3.5 h-3.5 text-mothership-400 flex-shrink-0" />
          <span className="text-[11px] font-medium text-c-text truncate">
            {worktree.branchName}
          </span>
          <div className="flex items-center gap-1 text-[10px] text-c-muted-light">
            <span className="text-green-500 font-medium">+{totalInsertions}</span>
            <span className="text-red-500 font-medium">-{totalDeletions}</span>
            <span className="text-c-muted-light">
              · {fileDiffs.length} file{fileDiffs.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSplitView(!splitView)}
            className={`p-1 rounded transition-colors ${
              splitView
                ? 'bg-mothership-500/20 text-mothership-400'
                : 'text-c-muted-light hover:text-c-text hover:bg-c-surface'
            }`}
            title={splitView ? 'Switch to unified view' : 'Switch to split view'}
          >
            {splitView ? <Columns className="w-3 h-3" /> : <SplitSquareHorizontal className="w-3 h-3" />}
          </button>
          <button
            onClick={() => setShowOnlyDiff(!showOnlyDiff)}
            className={`p-1 rounded transition-colors ${
              showOnlyDiff
                ? 'bg-mothership-500/20 text-mothership-400'
                : 'text-c-muted-light hover:text-c-text hover:bg-c-surface'
            }`}
            title={showOnlyDiff ? 'Show all lines' : 'Show only changed lines'}
          >
            <Search className="w-3 h-3" />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded text-c-muted-light hover:text-c-text hover:bg-c-surface transition-colors ml-1"
            title="Close diff viewer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* ── Body: Sidebar + Diff ──────────────────────── */}
      <div className="flex" style={{ maxHeight: 'min(70vh, 600px)' }}>
        {/* File sidebar */}
        <div className="w-56 flex-shrink-0 border-r border-c-border overflow-y-auto bg-c-bg/50">
          <div className="px-3 py-1.5 text-[9px] text-c-muted-light font-medium uppercase tracking-wider border-b border-c-border">
            Changed Files
          </div>
          {fileDiffs.map((file) => (
            <FileSummaryRow
              key={file.path}
              file={file}
              isSelected={file.path === selectedPath}
              onClick={() => setSelectedPath(file.path)}
            />
          ))}
        </div>

        {/* Diff content */}
        <div className="flex-1 overflow-auto min-w-0">
          {selectedFile ? (
            <div className="text-[11px]">
              <ReactDiffViewer
                oldValue={selectedFile.old_content}
                newValue={selectedFile.new_content}
                splitView={splitView}
                showDiffOnly={showOnlyDiff}
                useDarkTheme={isDark}
                styles={diffStyles}
                renderContent={renderContent}
                leftTitle={
                  <span className="text-[10px] font-mono text-c-muted">
                    {selectedFile.path}{splitView ? ' (old)' : ''}
                  </span>
                }
                rightTitle={splitView ? (
                  <span className="text-[10px] font-mono text-c-muted">{selectedFile.path} (new)</span>
                ) : undefined}
                extraLinesSurroundingDiff={2}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-c-muted-light text-xs">
              Select a file to view its diff
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-c-border bg-c-surface/30 text-[10px] text-c-muted-light">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Plus className="w-2.5 h-2.5 text-green-500" />
            <span className="text-green-500">{totalInsertions}</span>
          </span>
          <span className="flex items-center gap-1">
            <Minus className="w-2.5 h-2.5 text-red-500" />
            <span className="text-red-500">{totalDeletions}</span>
          </span>
        </div>
        <span className="font-mono">
          {fileDiffs.length} file{fileDiffs.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}

export default DiffViewer
