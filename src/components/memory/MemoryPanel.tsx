import { useState, useEffect, memo } from 'react'
import {
  useMemoryStore,
  type MemoryTab,
  type MemoryNote,
  type ContextEntry,
} from '../../stores/memoryStore'
import { useAgentStore } from '../../stores/agentStore'
import { NoteEditor } from './NoteEditor'
import { Timeline } from './Timeline'
import { HandoffDialog } from './HandoffDialog'
import { ColdStoragePanel } from './ColdStoragePanel'
import { ReconsolidationPanel } from './ReconsolidationPanel'
import { ModelRouterPanel } from '../model-router/ModelRouterPanel'
import { WarRoom } from '../war-room/WarRoom'
import { TaskGraph } from '../task-graph/TaskGraph'
import { BrowserConnector } from '../browser/BrowserConnector'
import { MCPPanel } from '../mcp/MCPPanel'
import { ExecutionPanel } from '../execution/ExecutionPanel'
import { PerformancePanel } from '../performance/PerformancePanel'
import {
  StickyNote,
  Clock,
  Search,
  Plus,
  Trash2,
  FileText,
  ArrowRight,
  GitBranch,
  Lightbulb,
  MessageSquare,
  X,
  Send,
  Bot,
  Radio,
  Network,
  Globe,
  Plug,
  HardDrive,
  Activity,
  Play,
  AlertTriangle,
  ChevronDown,
  MoreHorizontal,
  LayoutList,
} from 'lucide-react'

// --- Core tabs (always visible) ---

const CORE_TABS: { id: MemoryTab; label: string; icon: React.ReactNode }[] = [
  { id: 'notes', label: 'Notes', icon: <StickyNote className="w-3 h-3" /> },
  { id: 'context', label: 'Context', icon: <Clock className="w-3 h-3" /> },
  { id: 'search', label: 'Search', icon: <Search className="w-3 h-3" /> },
  { id: 'reconsolidation', label: 'Flags', icon: <AlertTriangle className="w-3 h-3" /> },
]

const ADVANCED_TABS: { id: MemoryTab; label: string; icon: React.ReactNode }[] = [
  { id: 'timeline', label: 'Timeline', icon: <LayoutList className="w-3 h-3" /> },
  { id: 'storage', label: 'Storage', icon: <HardDrive className="w-3 h-3" /> },
  { id: 'models', label: 'Models', icon: <Bot className="w-3 h-3" /> },
  { id: 'warroom', label: 'War Room', icon: <Radio className="w-3 h-3" /> },
  { id: 'graph', label: 'Graph', icon: <Network className="w-3 h-3" /> },
  { id: 'browser', label: 'Browser', icon: <Globe className="w-3 h-3" /> },
  { id: 'mcp', label: 'MCP', icon: <Plug className="w-3 h-3" /> },
  { id: 'execution', label: 'Execution', icon: <Play className="w-3 h-3" /> },
  { id: 'performance', label: 'Perf', icon: <Activity className="w-3 h-3" /> },
]

function TabBar() {
  const { activeTab, setActiveTab } = useMemoryStore()
  const [showAdvanced, setShowAdvanced] = useState(false)
  const isAdvanced = ADVANCED_TABS.some((t) => t.id === activeTab)

  return (
    <div>
      {/* Core tabs */}
      <div className="flex border-b border-c-border">
        {CORE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-c-text border-b-2 border-mothership-500'
                : 'text-c-muted hover:text-c-muted-light'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
        {/* Advanced toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`flex items-center justify-center gap-1 px-2 py-2 text-[10px] font-medium transition-colors border-b-2 border-transparent ${
            isAdvanced || showAdvanced
              ? 'text-c-text border-b-2 border-mothership-500'
              : 'text-c-muted hover:text-c-muted-light'
          }`}
          title="More tools"
        >
          <MoreHorizontal className="w-3 h-3" />
          <ChevronDown className={`w-2.5 h-2.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Advanced tabs (collapsible) */}
      {(showAdvanced || isAdvanced) && (
        <div className="flex flex-wrap border-b border-c-border/50 bg-c-surface/20">
          {ADVANCED_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id)
                setShowAdvanced(false)
              }}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-[9px] font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-c-text bg-c-surface/50'
                  : 'text-c-muted hover:text-c-muted-light hover:bg-c-surface/20'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Notes Tab ---

function NotesTab() {
  const { searchQuery, setSearchQuery, addNote, deleteNote, getFilteredNotes } = useMemoryStore()
  const [showEditor, setShowEditor] = useState(false)

  const displayNotes = getFilteredNotes()

  return (
    <div className="flex flex-col h-full">
      {/* Search + Add */}
      <div className="p-2 flex items-center gap-1.5">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter notes..."
          className="flex-1 px-2 py-1 bg-c-surface border border-c-border-strong rounded text-[11px] text-c-text-dim placeholder:text-c-muted-light focus:border-mothership-500/50 outline-none"
        />
        <button
          onClick={() => setShowEditor(!showEditor)}
          className="p-1 rounded hover:bg-c-surface text-c-muted hover:text-c-text-dim transition-colors"
        >
          {showEditor ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Note editor */}
      {showEditor && (
        <div className="px-2 pb-2">
          <NoteEditor
            onSave={(content, tags) => {
              addNote(content, undefined, tags)
              setShowEditor(false)
            }}
            onCancel={() => setShowEditor(false)}
          />
        </div>
      )}

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1.5">
        {displayNotes.map((note) => (
          <NoteCard key={note.id} note={note} onDelete={() => deleteNote(note.id)} />
        ))}
        {displayNotes.length === 0 && (
          <div className="text-center py-8 text-[11px] text-c-muted-light">
            {searchQuery ? 'No matching notes' : 'No notes yet'}
          </div>
        )}
      </div>
    </div>
  )
}

const NoteCard = memo(function NoteCard({ note, onDelete }: { note: MemoryNote; onDelete: () => void }) {
  const timeAgo = formatTimeAgo(note.createdAt)

  return (
    <div className="group p-2 rounded-lg bg-c-surface/50 border border-c-border-strong/30 hover:border-c-border-strong transition-colors">
      <p className="text-[11px] text-c-text-dim leading-relaxed">{note.content}</p>
      <div className="flex items-center justify-between mt-1.5">
        <div className="flex items-center gap-1.5">
          {note.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-1 py-0.5 text-[9px] bg-c-surface-hover/50 text-c-muted rounded"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-c-muted-light">{timeAgo}</span>
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-c-surface-hover text-c-muted hover:text-c-text-dim transition-all"
          >
            <Trash2 className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>
    </div>
  )
})

// --- Context Tab ---

function ContextTab() {
  const { contextHistory, contextFilter, setContextFilter, clearContextHistory } =
    useMemoryStore()
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const [showHandoff, setShowHandoff] = useState(false)

  const filtered = contextFilter
    ? contextHistory.filter(
        (c) =>
          c.content.toLowerCase().includes(contextFilter.toLowerCase()) ||
          c.entryType.toLowerCase().includes(contextFilter.toLowerCase())
      )
    : contextHistory

  return (
    <div className="flex flex-col h-full">
      {/* Filter + Actions */}
      <div className="p-2 flex items-center gap-1.5">
        <input
          type="text"
          value={contextFilter}
          onChange={(e) => setContextFilter(e.target.value)}
          placeholder="Filter context..."
          className="flex-1 px-2 py-1 bg-c-surface border border-c-border-strong rounded text-[11px] text-c-text-dim placeholder:text-c-muted-light focus:border-mothership-500/50 outline-none"
        />
        {activeAgentId && (
          <button
            onClick={() => setShowHandoff(true)}
            className="p-1 rounded hover:bg-c-surface text-c-muted hover:text-mothership-400 transition-colors"
            title="Handoff context"
          >
            <Send className="w-3 h-3" />
          </button>
        )}
        {contextHistory.length > 0 && (
          <button
            onClick={clearContextHistory}
            className="p-1 rounded hover:bg-c-surface text-c-muted hover:text-c-text-dim transition-colors"
            title="Clear history"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Context list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {filtered.map((entry) => (
          <ContextCard key={entry.id} entry={entry} />
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-[11px] text-c-muted-light">
            {contextFilter ? 'No matching entries' : 'No context history yet'}
          </div>
        )}
      </div>

      {/* Handoff dialog */}
      {activeAgentId && (
        <HandoffDialog
          isOpen={showHandoff}
          sourceAgentId={activeAgentId}
          onClose={() => setShowHandoff(false)}
        />
      )}
    </div>
  )
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  prompt: <MessageSquare className="w-3 h-3 text-blue-400" />,
  output: <FileText className="w-3 h-3 text-c-muted" />,
  summary: <Lightbulb className="w-3 h-3 text-yellow-400" />,
  handoff: <ArrowRight className="w-3 h-3 text-green-400" />,
  decision: <GitBranch className="w-3 h-3 text-purple-400" />,
}

const ContextCard = memo(function ContextCard({ entry }: { entry: ContextEntry }) {
  const timeAgo = formatTimeAgo(entry.createdAt)

  return (
    <div className="p-2 rounded-lg bg-c-surface/50 border border-c-border-strong/30">
      <div className="flex items-center gap-1.5 mb-1">
        {TYPE_ICONS[entry.entryType] || <Clock className="w-3 h-3 text-c-muted" />}
        <span className="text-[10px] font-medium text-c-muted capitalize">{entry.entryType}</span>
        <span className="text-[9px] text-c-muted-light ml-auto">{entry.agentId} · {timeAgo}</span>
      </div>
      <p className="text-[11px] text-c-text-dim leading-relaxed">{entry.content}</p>
      {entry.summary && (
        <p className="text-[10px] text-c-muted mt-1 italic">{entry.summary}</p>
      )}
      {entry.filesReferenced.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {entry.filesReferenced.slice(0, 4).map((file) => (
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

// --- Search Tab ---

function SearchTab() {
  const { globalSearchQuery, setGlobalSearchQuery, searchResults } = useMemoryStore()

  return (
    <div className="flex flex-col h-full">
      {/* Search input */}
      <div className="p-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-c-muted-light" />
          <input
            type="text"
            value={globalSearchQuery}
            onChange={(e) => setGlobalSearchQuery(e.target.value)}
            placeholder="Search notes and context..."
            className="w-full pl-7 pr-2 py-1.5 bg-c-surface border border-c-border-strong rounded text-[11px] text-c-text-dim placeholder:text-c-muted-light focus:border-mothership-500/50 outline-none"
            autoFocus
          />
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {searchResults.map((result, i) => (
          <div
            key={`${result.type}-${result.item.id}-${i}`}
            className="p-2 rounded-lg bg-c-surface/50 border border-c-border-strong/30"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span
                className={`px-1 py-0.5 text-[8px] font-medium rounded ${
                  result.type === 'note'
                    ? 'bg-mothership-600/20 text-mothership-400'
                    : 'bg-c-surface-hover/50 text-c-muted'
                }`}
              >
                {result.type === 'note' ? 'NOTE' : 'CONTEXT'}
              </span>
              {'tags' in result.item && (
                <span className="text-[9px] text-c-muted-light">
                  {(result.item as MemoryNote).tags.join(', ')}
                </span>
              )}
            </div>
            <p className="text-[11px] text-c-text-dim leading-relaxed">
              {result.item.content}
            </p>
          </div>
        ))}
        {globalSearchQuery && searchResults.length === 0 && (
          <div className="text-center py-8 text-[11px] text-c-muted-light">No results found</div>
        )}
        {!globalSearchQuery && (
          <div className="text-center py-8 text-[11px] text-c-muted-light">
            Type to search across notes and context
          </div>
        )}
      </div>
    </div>
  )
}

// --- Utility ---

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

// --- Main Component ---

export function MemoryPanel({ hideHeader, fullWidth }: { hideHeader?: boolean; fullWidth?: boolean }) {
  const { activeTab, loadFromBackend } = useMemoryStore()

  // Load data from SQLite backend on mount
  useEffect(() => {
    loadFromBackend()
  }, [loadFromBackend])

  return (
    <aside className={`h-full bg-c-card flex flex-col overflow-hidden ${
      fullWidth ? 'flex-1' : 'border-l border-c-border w-72'
    }`}>
      {/* Header */}
      {!hideHeader && (
        <div className="px-4 pt-3 pb-0">
          <span className="text-xs font-medium text-c-muted">Memory</span>
        </div>
      )}

      {/* Tabs */}
      <TabBar />

      {/* Content */}
      <div className={`flex-1 overflow-hidden ${fullWidth ? 'flex flex-col' : ''}`}>
        {activeTab === 'notes' && <NotesTab />}
        {activeTab === 'context' && <ContextTab />}
        {activeTab === 'timeline' && <Timeline />}
        {activeTab === 'search' && <SearchTab />}
        {activeTab === 'storage' && <ColdStoragePanel />}
        {activeTab === 'models' && <ModelRouterPanel />}
        {activeTab === 'warroom' && <WarRoom />}
        {activeTab === 'graph' && <TaskGraph />}
        {activeTab === 'browser' && <BrowserConnector />}
        {activeTab === 'mcp' && <MCPPanel />}
        {activeTab === 'execution' && <ExecutionPanel />}
        {activeTab === 'performance' && <PerformancePanel />}
        {activeTab === 'reconsolidation' && <ReconsolidationPanel />}
      </div>
    </aside>
  )
}
