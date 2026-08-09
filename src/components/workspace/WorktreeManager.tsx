import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useWorktreeStore, type WorktreeInfo } from '../../stores/worktreeStore'
import { useAgentStore } from '../../stores/agentStore'
import { useEditorDetection } from '../../hooks/useEditorDetection'
import { useWorktreeInit } from '../../hooks/useWorktreeInit'
import { DiffViewer } from './DiffViewer'
import { PresetPanel } from './PresetPanel'
import {
  GitBranch,
  Plus,
  Terminal,
  Trash2,
  RefreshCw,
  FileText,
  GitCommit,
  ArrowUp,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  X,
  Copy,
  FolderOpen,
  Settings2,
  Code2,
} from 'lucide-react'

// ── Main Component ───────────────────────────────────────────────────────

export function WorktreeManager() {
  const {
    worktrees,
    activeWorktreeId,
    projectInfo,
    isInitialized,
    setActiveWorktree,
    listWorktrees,
    detectProject,
    openWorktreeTerminal,
    deleteWorktree,
    syncWorktree,
    commitWorktreeChanges,
    pushWorktreeBranch,
  } = useWorktreeStore()

  const { agents } = useAgentStore()
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [showCreatePanel, setShowCreatePanel] = useState(false)
  const [showPresets, setShowPresets] = useState(false)
  const [expandedWorktrees, setExpandedWorktrees] = useState<Set<string>>(new Set())
  const editors = useEditorDetection()

  // Detect git project and list worktrees on mount
  useWorktreeInit(detectProject, listWorktrees)

  // Expand active worktree by default
  useEffect(() => {
    if (activeWorktreeId) {
      setExpandedWorktrees((prev) => new Set(prev).add(activeWorktreeId))
    }
  }, [activeWorktreeId])

  const toggleExpanded = (id: string) => {
    setExpandedWorktrees((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!isInitialized) {
    return (
      <div className="flex-1 flex items-center justify-center text-c-muted">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-xs">Detecting git project...</span>
      </div>
    )
  }

  if (!projectInfo) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-c-muted p-6">
        <GitBranch className="w-10 h-10 mb-3 text-c-muted-light" />
        <h3 className="text-sm font-medium text-c-muted mb-1">Not a Git Repository</h3>
        <p className="text-xs text-c-muted-light text-center max-w-xs mb-4">
          Open a git repository to use isolated worktree workspaces for your agents.
        </p>
        <button
          onClick={() => detectProject('.')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-mothership-600 hover:bg-mothership-500 text-white text-xs rounded transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Retry Detection
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-c-border bg-c-card">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-mothership-400" />
          <span className="text-xs font-medium text-c-text">Worktrees</span>
          <span className="text-[10px] text-c-muted-light font-mono">
            {projectInfo.currentBranch}
          </span>
          {projectInfo.hasUncommitted && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-500 font-medium">
              DIRTY
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setShowPresets(!showPresets)
              setShowCreatePanel(false)
            }}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors ${
              showPresets
                ? 'bg-mothership-500/20 text-mothership-400'
                : 'text-c-muted-light hover:text-c-text hover:bg-c-surface'
            }`}
            title="Workspace presets"
          >
            <Settings2 className="w-3 h-3" />
            Presets
          </button>
          <button
            onClick={() => {
              setShowCreatePanel(!showCreatePanel)
              setShowPresets(false)
            }}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors ${
              showCreatePanel
                ? 'bg-mothership-500/20 text-mothership-400'
                : 'text-c-muted-light hover:text-c-text hover:bg-c-surface'
            }`}
          >
            {showCreatePanel ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            {showCreatePanel ? 'Cancel' : 'New Workspace'}
          </button>
        </div>
      </div>

      {/* Presets Panel */}
      {showPresets && (
        <PresetPanel
          projectPath={projectInfo.rootPath}
          worktrees={worktrees}
          onClose={() => setShowPresets(false)}
        />
      )}

      {/* Create Panel */}
      {showCreatePanel && (
        <CreateWorktreePanel
          projectPath={projectInfo.rootPath}
          agents={agents}
          onCreated={() => setShowCreatePanel(false)}
        />
      )}

      {/* Worktree List */}
      <div className="flex-1 overflow-y-auto">
        {worktrees.length === 0 && !showCreatePanel && (
          <div className="flex flex-col items-center justify-center h-full text-c-muted p-6">
            <FolderOpen className="w-8 h-8 mb-2 text-c-muted-light" />
            <p className="text-xs text-c-muted-light mb-1">No worktree workspaces yet</p>
            <p className="text-[10px] text-c-muted-light text-center max-w-xs">
              Create isolated Git worktree branches for your agents to work on tasks
              without conflicts.
            </p>
          </div>
        )}
        {worktrees.map((wt) => (
          <WorktreeCard
            key={wt.id}
            worktree={wt}
            isActive={wt.id === activeWorktreeId}
            isExpanded={expandedWorktrees.has(wt.id)}
            showDeleteConfirm={deleteConfirm === wt.id}
            onToggleExpand={() => toggleExpanded(wt.id)}
            onSelect={() => setActiveWorktree(wt.id)}
            onOpenTerminal={() => openWorktreeTerminal(wt)}
            onDelete={() => setDeleteConfirm(wt.id)}
            onCancelDelete={() => setDeleteConfirm(null)}
            onConfirmDelete={() => {
              deleteWorktree(wt.worktreePath, false)
              setDeleteConfirm(null)
            }}
            editors={editors}
            onSync={() => syncWorktree(wt.worktreePath)}
            onCommit={(msg) => commitWorktreeChanges(wt.worktreePath, msg)}
            onPush={() => pushWorktreeBranch(wt.worktreePath)}
          />
        ))}
      </div>

      {/* Footer stats */}
      {worktrees.length > 0 && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-c-border bg-c-card text-[10px] text-c-muted-light">
          <span>{worktrees.length} workspace{worktrees.length !== 1 ? 's' : ''}</span>
          <button
            onClick={() => listWorktrees(projectInfo.rootPath)}
            className="flex items-center gap-1 hover:text-c-text transition-colors"
          >
            <RefreshCw className="w-2.5 h-2.5" />
            Refresh
          </button>
        </div>
      )}
    </div>
  )
}

// ── Create Worktree Panel ───────────────────────────────────────────────

function CreateWorktreePanel({
  projectPath,
  agents,
  onCreated,
}: {
  projectPath: string
  agents: { id: string; name: string; provider: string }[]
  onCreated: () => void
}) {
  const { createWorktree, listWorktrees, presetConfig, readPresetConfig, runPresetSetup } = useWorktreeStore()
  const [taskName, setTaskName] = useState('')
  const [baseBranch, setBaseBranch] = useState('main')
  const [agentId, setAgentId] = useState('')
  const [selectedPreset, setSelectedPreset] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [setupOutput, setSetupOutput] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load presets on mount
  useEffect(() => {
    readPresetConfig(projectPath)
  }, [projectPath, readPresetConfig])

  // When a preset is selected, auto-fill its values
  useEffect(() => {
    if (!selectedPreset) return
    const preset = presetConfig.presets.find((p) => p.name === selectedPreset)
    if (preset) {
      if (preset.base_branch) setBaseBranch(preset.base_branch)
      if (preset.agent_id && !agentId) setAgentId(preset.agent_id)
    }
  }, [selectedPreset, presetConfig]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    if (!taskName.trim()) return
    setIsCreating(true)
    setError(null)
    setSetupOutput(null)

    try {
      const result = await createWorktree(
        projectPath,
        taskName.trim(),
        baseBranch || undefined,
        agentId || undefined
      )

      if (result.success && result.workspace) {
        // Run global setup commands from preset config
        if (presetConfig.setup.length > 0) {
          const setupResult = await runPresetSetup(result.workspace.worktreePath, presetConfig.setup)
          if (!setupResult.success) {
            setSetupOutput(`Setup warnings:\n${setupResult.stderr}`)
          }
        }

        // Run preset-specific setup if a preset was selected
        if (selectedPreset) {
          const preset = presetConfig.presets.find((p) => p.name === selectedPreset)
          if (preset && preset.setup.length > 0) {
            const setupResult = await runPresetSetup(result.workspace.worktreePath, preset.setup, preset.env)
            if (!setupResult.success) {
              setSetupOutput(`${setupResult.stderr || setupResult.stdout}`)
            }
          }
        }

        setTaskName('')
        setSelectedPreset('')
        onCreated()
        // Refresh the list
        await listWorktrees(projectPath)
      } else {
        setError(result.error || 'Failed to create workspace')
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="px-3 py-2 border-b border-c-border bg-c-surface/30">
      <div className="flex flex-col gap-2">
        <input
          value={taskName}
          onChange={(e) => setTaskName(e.target.value)}
          placeholder="Task name (e.g., fix-login-bug)"
          className="w-full bg-c-surface border border-c-border rounded px-2 py-1.5 text-xs text-c-text placeholder:text-c-muted-light focus:outline-none focus:border-mothership-500 transition-colors"
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          autoFocus
        />
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[9px] text-c-muted-light block mb-0.5">Preset (optional)</label>
            <select
              value={selectedPreset}
              onChange={(e) => setSelectedPreset(e.target.value)}
              className="w-full bg-c-surface border border-c-border rounded px-2 py-1 text-[10px] text-c-text focus:outline-none focus:border-mothership-500 transition-colors"
            >
              <option value="">No preset</option>
              {presetConfig.presets.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-[9px] text-c-muted-light block mb-0.5">Base branch</label>
            <input
              value={baseBranch}
              onChange={(e) => setBaseBranch(e.target.value)}
              placeholder="main"
              className="w-full bg-c-surface border border-c-border rounded px-2 py-1 text-[10px] font-mono text-c-text placeholder:text-c-muted-light focus:outline-none focus:border-mothership-500 transition-colors"
            />
          </div>
          <div className="flex-1">
            <label className="text-[9px] text-c-muted-light block mb-0.5">Assign agent (optional)</label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full bg-c-surface border border-c-border rounded px-2 py-1 text-[10px] text-c-text focus:outline-none focus:border-mothership-500 transition-colors"
            >
              <option value="">No assignment</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error && (
          <div className="text-[10px] text-red-400 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {error}
          </div>
        )}
        {setupOutput && (
          <div className="text-[10px] text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded px-2 py-1">
            <pre className="font-mono text-[9px] whitespace-pre-wrap">{setupOutput}</pre>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={handleCreate}
            disabled={!taskName.trim() || isCreating}
            className="flex items-center gap-1 px-3 py-1.5 bg-mothership-600 hover:bg-mothership-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[10px] rounded transition-colors"
          >
            {isCreating ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Plus className="w-3 h-3" />
            )}
            {isCreating ? 'Creating...' : 'Create Workspace'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Worktree Card ───────────────────────────────────────────────────────

export function WorktreeCard({
  worktree,
  isActive,
  isExpanded,
  showDeleteConfirm,
  editors,
  onToggleExpand,
  onSelect,
  onOpenTerminal,
  onDelete,
  onCancelDelete,
  onConfirmDelete,
  onSync,
  onCommit,
  onPush: _onPush,
}: {
  worktree: WorktreeInfo
  isActive: boolean
  isExpanded: boolean
  showDeleteConfirm: boolean
  editors: { vsCode: boolean; cursor: boolean }
  onToggleExpand: () => void
  onSelect: () => void
  onOpenTerminal: () => void
  onDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
  onSync: () => void
  onCommit: (message: string) => void
  onPush: () => void
}) {
  const {
    getWorktreeDiff,
    getWorktreeNotes,
    listWorktreePorts,
    allocatePort,
    releaseWorktreePort,
    worktreePorts,
  } = useWorktreeStore()
  const [diff, setDiff] = useState<{ filesChanged: number; insertions: number; deletions: number } | null>(null)
  const [showDiff, setShowDiff] = useState(false)
  const [showCommit, setShowCommit] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')
  const [isLoadingDiff, setIsLoadingDiff] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isCommitting, setIsCommitting] = useState(false)

  const notes = getWorktreeNotes(worktree.id)
  const ports = worktreePorts.get(worktree.id) || []
  const [showPortInput, setShowPortInput] = useState(false)
  const [portServiceName, setPortServiceName] = useState('')
  const [isAllocatingPort, setIsAllocatingPort] = useState(false)

  // Lazy-fetch ports when expanded
  useEffect(() => {
    if (isExpanded) {
      listWorktreePorts(worktree.projectRoot, worktree.id).catch(() => {})
    }
  }, [isExpanded]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAllocatePort = async () => {
    if (!portServiceName.trim()) return
    setIsAllocatingPort(true)
    try {
      await allocatePort(worktree.projectRoot, worktree.id, portServiceName.trim())
      setPortServiceName('')
      setShowPortInput(false)
    } catch (e) {
      console.error('Failed to allocate port:', e)
    } finally {
      setIsAllocatingPort(false)
    }
  }

  // Lazy-fetch diff stats when expanded (for accurate badge count)
  useEffect(() => {
    if (isExpanded && worktree.hasUncommitted && diff === null) {
      getWorktreeDiff(worktree.worktreePath).then((fullDiff) => {
        setDiff({
          filesChanged: fullDiff.filesChanged,
          insertions: fullDiff.insertions,
          deletions: fullDiff.deletions,
        })
      }).catch(() => {})
    }
  }, [isExpanded, worktree.hasUncommitted, worktree.worktreePath]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleShowDiff = useCallback(async () => {
    if (showDiff) {
      setShowDiff(false)
      return
    }
    setIsLoadingDiff(true)
    try {
      const fullDiff = await getWorktreeDiff(worktree.worktreePath)
      setDiff({
        filesChanged: fullDiff.filesChanged,
        insertions: fullDiff.insertions,
        deletions: fullDiff.deletions,
      })
      setShowDiff(true)
    } catch (e) {
      console.error('Failed to get diff:', e)
    } finally {
      setIsLoadingDiff(false)
    }
  }, [worktree.worktreePath, showDiff, getWorktreeDiff])

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      await onSync()
    } finally {
      setIsSyncing(false)
    }
  }

  const handlePush = async () => {
    try {
      await _onPush()
    } catch (e) {
      console.error('Failed to push:', e)
    }
  }

  const handleCommit = async () => {
    if (!commitMsg.trim()) return
    setIsCommitting(true)
    try {
      await onCommit(commitMsg.trim())
      setCommitMsg('')
      setShowCommit(false)
    } finally {
      setIsCommitting(false)
    }
  }

  const openInEditor = useCallback(async (editor: string) => {
    try {
      await invoke('open_in_editor', { path: worktree.worktreePath, editor })
    } catch (e) {
      console.error(`Failed to open ${editor}:`, e)
    }
  }, [worktree.worktreePath])

  const statusColor =
    worktree.status === 'active'
      ? worktree.hasUncommitted
        ? 'text-yellow-400'
        : 'text-green-400'
      : worktree.status === 'orphaned'
      ? 'text-red-400'
      : 'text-c-muted'

  return (
    <div
      className={`border-b border-c-border transition-colors ${
        isActive ? 'bg-mothership-600/5' : 'hover:bg-c-surface/30'
      }`}
    >
      {/* Card Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer group"
        onClick={() => {
          onSelect()
          onToggleExpand()
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpand()
          }}
          className="p-0.5 rounded hover:bg-c-surface text-c-muted-light hover:text-c-text transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
        </button>

        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-c-text truncate">
              {worktree.branchName}
            </span>
            {worktree.agentId && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-c-surface text-c-muted-light font-mono">
                {worktree.agentId}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[9px] text-c-muted-light mt-0.5">
            <span className="font-mono truncate">{worktree.worktreePath}</span>
            {worktree.aheadBehind && (
              <span className="font-mono">{worktree.aheadBehind}</span>
            )}
          </div>
        </div>

        {/* Delete confirmation overlay */}
        {showDeleteConfirm && (
          <div className="flex items-center gap-1.5 mr-1" onClick={(e) => e.stopPropagation()}>
            <span className="text-[9px] text-red-400 font-medium">Delete?</span>
            <button
              onClick={onConfirmDelete}
              className="p-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
              title="Confirm delete"
            >
              <CheckCircle2 className="w-3 h-3" />
            </button>
            <button
              onClick={onCancelDelete}
              className="p-1 rounded hover:bg-c-surface text-c-muted-light hover:text-c-text transition-colors"
              title="Cancel delete"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Quick action buttons */}
        {!showDeleteConfirm && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onOpenTerminal()
              }}
              className="p-1 rounded hover:bg-c-surface text-c-muted-light hover:text-mothership-400 transition-colors"
              title="Open terminal in this workspace"
            >
              <Terminal className="w-3 h-3" />
            </button>
            {editors.vsCode && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  openInEditor('code')
                }}
                className="p-1 rounded hover:bg-c-surface text-c-muted-light hover:text-blue-400 transition-colors"
                title="Open in VS Code"
              >
                <Code2 className="w-3 h-3" />
              </button>
            )}
            {editors.cursor && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  openInEditor('cursor')
                }}
                className="p-1 rounded hover:bg-c-surface text-c-muted-light hover:text-purple-400 transition-colors"
                title="Open in Cursor"
              >
                <Code2 className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                navigator.clipboard.writeText(worktree.worktreePath)
              }}
              className="p-1 rounded hover:bg-c-surface text-c-muted-light hover:text-c-text transition-colors"
              title="Copy path"
            >
              <Copy className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              className="p-1 rounded hover:bg-c-surface text-c-muted-light hover:text-red-400 transition-colors"
              title="Delete workspace"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-6 pb-2 space-y-1.5">
          {/* Status info */}
          <div className="flex items-center gap-3 text-[10px] text-c-muted-light">
            <span>Status: <span className="font-medium text-c-text">{worktree.status}</span></span>
            {worktree.commitsAhead > 0 && (
              <span className="flex items-center gap-0.5">
                <ArrowUp className="w-2.5 h-2.5 text-green-400" />
                <span className="text-green-400">+{worktree.commitsAhead}</span>
              </span>
            )}
            {worktree.commitsBehind > 0 && (
              <span className="flex items-center gap-0.5">
                <ArrowUp className="w-2.5 h-2.5 text-yellow-400 rotate-180" />
                <span className="text-yellow-400">-{worktree.commitsBehind}</span>
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <ActionButton
              icon={<Terminal className="w-2.5 h-2.5" />}
              label="Open Terminal"
              onClick={(e) => { e.stopPropagation(); onOpenTerminal() }}
            />
            {editors.vsCode && (
              <ActionButton
                icon={<Code2 className="w-2.5 h-2.5" />}
                label="VS Code"
                onClick={(e) => { e.stopPropagation(); openInEditor('code') }}
                hoverColor="text-blue-400"
              />
            )}
            {editors.cursor && (
              <ActionButton
                icon={<Code2 className="w-2.5 h-2.5" />}
                label="Cursor"
                onClick={(e) => { e.stopPropagation(); openInEditor('cursor') }}
                hoverColor="text-purple-400"
              />
            )}
            <ActionButton
              icon={isSyncing ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <RefreshCw className="w-2.5 h-2.5" />}
              label="Sync"
              onClick={(e) => { e.stopPropagation(); handleSync() }}
              disabled={isSyncing}
            />
            <ActionButton
              icon={isLoadingDiff ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <FileText className="w-2.5 h-2.5" />}
              label={showDiff ? 'Hide Diff' : 'View Diff'}
              onClick={(e) => { e.stopPropagation(); handleShowDiff() }}
              disabled={isLoadingDiff}
            />
            <ActionButton
              icon={<GitCommit className="w-2.5 h-2.5" />}
              label="Commit"
              onClick={(e) => { e.stopPropagation(); setShowCommit(!showCommit) }}
            />
            <ActionButton
              icon={<ArrowUp className="w-2.5 h-2.5" />}
              label="Push"
              onClick={(e) => { e.stopPropagation(); handlePush() }}
            />
            <ActionButton
              icon={<Terminal className="w-2.5 h-2.5" />}
              label={showPortInput ? 'Cancel Port' : 'Allocate Port'}
              onClick={(e) => {
                e.stopPropagation()
                setShowPortInput(!showPortInput)
                if (showPortInput) setPortServiceName('')
              }}
            />
            {worktree.hasUncommitted && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-500 font-medium">
                {diff
                  ? `${diff.filesChanged} file${diff.filesChanged !== 1 ? 's' : ''} changed`
                  : 'Uncommitted'}
              </span>
            )}
          </div>

          {/* Port allocations */}
          {ports.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {ports.map((p) => (
                <div
                  key={`${p.service}-${p.port}`}
                  className="flex items-center gap-1.5 px-2 py-1 rounded bg-c-surface border border-c-border text-[10px]"
                >
                  <span className="text-c-muted-light">{p.service}:</span>
                  <span className="font-mono font-medium text-c-text">{p.port}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      navigator.clipboard.writeText(String(p.port))
                    }}
                    className="p-0.5 rounded hover:bg-c-surface text-c-muted-light hover:text-c-text transition-colors"
                    title="Copy port number"
                  >
                    <Copy className="w-2.5 h-2.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      releaseWorktreePort(worktree.projectRoot, worktree.id, p.service)
                    }}
                    className="p-0.5 rounded hover:bg-c-surface text-c-muted-light hover:text-red-400 transition-colors"
                    title="Release port"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Allocate port input */}
          {showPortInput && (
            <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
              <input
                value={portServiceName}
                onChange={(e) => setPortServiceName(e.target.value)}
                placeholder="Service name (e.g., web, api, db)"
                className="flex-1 bg-c-surface border border-c-border rounded px-2 py-1 text-[10px] text-c-text placeholder:text-c-muted-light focus:outline-none focus:border-mothership-500 transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAllocatePort()
                  if (e.key === 'Escape') { setShowPortInput(false); setPortServiceName('') }
                }}
                autoFocus
              />
              <button
                onClick={handleAllocatePort}
                disabled={!portServiceName.trim() || isAllocatingPort}
                className="px-2 py-1 bg-mothership-600 hover:bg-mothership-500 disabled:opacity-50 text-white text-[10px] rounded transition-colors"
              >
                {isAllocatingPort ? (
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                ) : (
                  'Allocate'
                )}
              </button>
            </div>
          )}

          {/* Commit input */}
          {showCommit && (
            <div className="flex gap-1.5 mt-1" onClick={(e) => e.stopPropagation()}>
              <input
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                placeholder="Commit message..."
                className="flex-1 bg-c-surface border border-c-border rounded px-2 py-1 text-[10px] text-c-text placeholder:text-c-muted-light focus:outline-none focus:border-mothership-500 transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCommit()
                  if (e.key === 'Escape') setShowCommit(false)
                }}
                autoFocus
              />
              <button
                onClick={handleCommit}
                disabled={!commitMsg.trim() || isCommitting}
                className="px-2 py-1 bg-mothership-600 hover:bg-mothership-500 disabled:opacity-50 text-white text-[10px] rounded transition-colors"
              >
                {isCommitting ? (
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-2.5 h-2.5" />
                )}
              </button>
            </div>
          )}

          {/* Diff viewer */}
          {showDiff && (
            <div className="mt-2" onClick={(e) => e.stopPropagation()}>
              <DiffViewer
                worktree={worktree}
                onClose={() => {
                  setShowDiff(false)
                }}
              />
            </div>
          )}

          {/* Worktree notes */}
          {notes.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {notes.slice(0, 3).map((note) => (
                <div key={note.id} className="text-[9px] text-c-muted-light flex items-start gap-1">
                  <span className="text-c-muted mt-0.5">•</span>
                  <span className="flex-1">{note.content}</span>
                </div>
              ))}
              {notes.length > 3 && (
                <div className="text-[9px] text-c-muted-light italic">
                  +{notes.length - 3} more notes
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Action Button ───────────────────────────────────────────────────────

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
  hoverColor,
}: {
  icon: React.ReactNode
  label: string
  onClick: (e: React.MouseEvent) => void
  disabled?: boolean
  hoverColor?: string
}) {
  const hoverStyle = hoverColor
    ? `hover:${hoverColor} hover:bg-c-surface`
    : 'hover:text-c-text hover:bg-c-surface'

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 px-1.5 py-0.5 text-[9px] text-c-muted-light rounded disabled:opacity-50 transition-colors ${hoverStyle}`}
    >
      {icon}
      {label}
    </button>
  )
}
