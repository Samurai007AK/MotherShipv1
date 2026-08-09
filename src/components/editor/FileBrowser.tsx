import { useState, useMemo, useCallback, useEffect } from 'react'
import { useFileStore, type FileEntry } from '../../stores/fileStore'
import { useEditorStore } from '../../stores/editorStore'
import {
  FileText,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Search,
  RefreshCw,
  Loader2,
  X,
} from 'lucide-react'

// --- File tree node ---

interface TreeNode {
  entry: FileEntry
  children: TreeNode[]
  isExpanded: boolean
}

// --- Build tree from flat file list ---

function buildFileTree(files: FileEntry[]): TreeNode[] {
  const root: TreeNode[] = []
  const map = new Map<string, TreeNode>()

  // Sort: dirs first, then alphabetically
  const sorted = [...files].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.path.localeCompare(b.path)
  })

  for (const entry of sorted) {
    const parts = entry.path.split('/')
    const node: TreeNode = { entry, children: [], isExpanded: false }
    map.set(entry.path, node)

    if (parts.length === 1) {
      root.push(node)
    } else {
      const parentPath = parts.slice(0, -1).join('/')
      const parent = map.get(parentPath)
      if (parent) {
        parent.children.push(node)
      } else {
        root.push(node)
      }
    }
  }

  return root
}

// --- Tree item component ---

function TreeItem({
  node,
  depth,
  searchQuery,
  onFileClick,
}: {
  node: TreeNode
  depth: number
  searchQuery: string
  onFileClick: (entry: FileEntry) => void
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  const entry = node.entry
  const isDir = entry.isDir

  // Auto-expand directories matching search
  useEffect(() => {
    if (searchQuery && isDir) {
      setExpanded(true)
    }
  }, [searchQuery, isDir])

  if (isDir) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-1.5 px-2 py-1 text-left hover:bg-c-surface/50 transition-colors group"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3 text-c-muted flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-c-muted flex-shrink-0" />
          )}
          {expanded ? (
            <FolderOpen className="w-3.5 h-3.5 text-mothership-400 flex-shrink-0" />
          ) : (
            <Folder className="w-3.5 h-3.5 text-mothership-400 flex-shrink-0" />
          )}
          <span className="text-[11px] text-c-text-dim truncate">{entry.name}</span>
        </button>
        {expanded && (
          <div>
            {node.children.map((child) => (
              <TreeItem
                key={child.entry.path}
                node={child}
                depth={depth + 1}
                searchQuery={searchQuery}
                onFileClick={onFileClick}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // File item
  const ext = entry.ext.toLowerCase()
  const iconColor = getFileIconColor(ext)

  return (
    <button
      onClick={() => onFileClick(entry)}
      className="w-full flex items-center gap-1.5 px-2 py-1 text-left hover:bg-c-surface/50 transition-colors group"
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
    >
      <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${iconColor}`} />
      <span className="text-[11px] text-c-text-dim truncate">{entry.name}</span>
      <span className="text-[9px] text-c-muted-light ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
        {formatSize(entry.size)}
      </span>
    </button>
  )
}

// --- File icon color by extension ---

function getFileIconColor(ext: string): string {
  const map: Record<string, string> = {
    ts: 'text-blue-400',
    tsx: 'text-blue-400',
    js: 'text-yellow-400',
    jsx: 'text-yellow-400',
    py: 'text-green-400',
    rs: 'text-orange-400',
    go: 'text-cyan-400',
    html: 'text-red-400',
    css: 'text-purple-400',
    scss: 'text-pink-400',
    json: 'text-yellow-300',
    md: 'text-blue-300',
    yaml: 'text-pink-400',
    yml: 'text-pink-400',
    toml: 'text-gray-400',
    sh: 'text-green-300',
    sql: 'text-blue-300',
    svg: 'text-green-300',
    png: 'text-purple-300',
    jpg: 'text-purple-300',
    gif: 'text-purple-300',
  }
  return map[ext] || 'text-c-muted-light'
}

// --- Format file size ---

function formatSize(bytes: number): string {
  if (bytes === 0) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

// --- Main FileBrowser ---

export function FileBrowser() {
  const { files, isLoading, fetchFiles } = useFileStore()
  const { openFile } = useEditorStore()
  const readFileContent = useFileStore((s) => s.readFileContent)
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoadingContent, setIsLoadingContent] = useState(false)

  useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  const handleFileClick = useCallback(async (entry: FileEntry) => {
    setIsLoadingContent(true)
    try {
      const content = await readFileContent(entry.path)
      openFile(entry.path, entry.name, content)
    } catch (e) {
      console.error('Failed to open file:', e)
    } finally {
      setIsLoadingContent(false)
    }
  }, [readFileContent, openFile])

  const fileTree = useMemo(() => buildFileTree(files), [files])

  // Filter tree by search query
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files.filter((f) => !f.isDir).slice(0, 200)
    const q = searchQuery.toLowerCase()
    return files.filter(
      (f) =>
        !f.isDir &&
        (f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
    ).slice(0, 50)
  }, [files, searchQuery])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-c-border">
        <FileText className="w-3.5 h-3.5 text-mothership-400" />
        <span className="text-xs font-medium text-c-text">Files</span>
        <span className="text-[10px] text-c-muted-light">{files.filter((f) => !f.isDir).length}</span>
        <div className="flex-1" />
        <button
          onClick={() => fetchFiles()}
          className="p-1 rounded hover:bg-c-surface text-c-muted-light hover:text-c-text transition-colors"
          title="Refresh files"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* Search */}
      <div className="px-2 py-1.5 border-b border-c-border/50">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-c-muted-light" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search files..."
            className="w-full pl-7 pr-6 py-1 bg-c-surface border border-c-border-strong/30 rounded text-[11px] text-c-text placeholder:text-c-muted-light focus:outline-none focus:border-mothership-500/50 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-c-surface-hover text-c-muted-light hover:text-c-text transition-colors"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-c-muted">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <span className="text-xs">Loading files...</span>
          </div>
        ) : searchQuery ? (
          // Search results (flat list)
          <div className="py-1">
            {filteredFiles.map((file) => (
              <button
                key={file.path}
                onClick={() => handleFileClick(file)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-c-surface/50 transition-colors group"
              >
                <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${getFileIconColor(file.ext)}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-c-text-dim truncate">{file.name}</div>
                  <div className="text-[9px] text-c-muted-light truncate">{file.path}</div>
                </div>
              </button>
            ))}
            {filteredFiles.length === 0 && (
              <div className="py-4 text-center text-[11px] text-c-muted-light">
                No files match "{searchQuery}"
              </div>
            )}
          </div>
        ) : (
          // Tree view
          <div className="py-1">
            {fileTree.map((node) => (
              <TreeItem
                key={node.entry.path}
                node={node}
                depth={0}
                searchQuery={searchQuery}
                onFileClick={handleFileClick}
              />
            ))}
            {fileTree.length === 0 && (
              <div className="py-4 text-center text-[11px] text-c-muted-light">
                No files found
              </div>
            )}
          </div>
        )}
      </div>

      {/* Loading indicator for file open */}
      {isLoadingContent && (
        <div className="px-3 py-1.5 border-t border-c-border bg-c-surface/30 text-[10px] text-c-muted-light flex items-center gap-1.5">
          <Loader2 className="w-2.5 h-2.5 animate-spin" />
          Opening file...
        </div>
      )}
    </div>
  )
}
