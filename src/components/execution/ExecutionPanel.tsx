import { useState } from 'react'
import { useExecutionEngineStore, type ExecutionGroupConfig } from '../../stores/executionEngineStore'
import { useAgentStore, getProviderColor, type AgentProvider } from '../../stores/agentStore'
import { useMemoryStore } from '../../stores/memoryStore'
import {
  Play,
  Square,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Users,
  Share2,
  Plus,
  Trash2,
  Copy,
} from 'lucide-react'

// --- Helpers ---

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${m}m ${s}s`
}

function statusIcon(status: string) {
  switch (status) {
    case 'running':
      return <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
    case 'completed':
      return <CheckCircle2 className="w-3 h-3 text-green-400" />
    case 'error':
      return <XCircle className="w-3 h-3 text-red-400" />
    case 'spawning':
      return <Loader2 className="w-3 h-3 text-yellow-400 animate-spin" />
    default:
      return <Clock className="w-3 h-3 text-c-muted-light" />
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending': return 'Pending'
    case 'spawning': return 'Starting...'
    case 'running': return 'Running...'
    case 'completed': return 'Completed'
    case 'error': return 'Failed'
    default: return status
  }
}

// --- Agent Execution Row ---

function AgentRow({
  agent,
}: {
  agent: { agent_id: string; prompt: string; status: string; output: string; error?: string }
}) {
  const [expanded, setExpanded] = useState(false)
  const agents = useAgentStore((s) => s.agents)
 const agentInfo = agents.find((a) => a.id === agent.agent_id)

  return (
    <div className="rounded-lg bg-c-surface/30 border border-c-border-strong/20">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-2 text-left hover:bg-c-surface-hover/30 rounded-lg transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-c-muted flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-c-muted flex-shrink-0" />
        )}
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            getProviderColor((agentInfo?.provider as AgentProvider) || 'claude')
          }`}
        />
        <span className="text-[11px] font-medium text-c-text-dim">
          {agentInfo?.name || agent.agent_id}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {statusIcon(agent.status)}
          <span className={`text-[10px] ${
            agent.status === 'error' ? 'text-red-400' :
            agent.status === 'completed' ? 'text-green-400' :
            agent.status === 'running' ? 'text-blue-400' :
            'text-c-muted-light'
          }`}>
            {statusLabel(agent.status)}
          </span>
        </span>
      </button>

      {expanded && (
        <div className="px-2 pb-2 space-y-1.5">
          {/* Prompt */}
          <div className="px-2 py-1.5 rounded bg-c-surface/50 border border-c-border-strong/20">
            <div className="text-[9px] text-c-muted-light mb-0.5 font-medium">Prompt</div>
            <pre className="text-[10px] text-c-text-dim whitespace-pre-wrap font-mono leading-relaxed">
              {agent.prompt.slice(0, 500)}
              {agent.prompt.length > 500 ? '...' : ''}
            </pre>
          </div>

          {/* Error */}
          {agent.error && (
            <div className="flex items-center gap-1 px-2 py-1 rounded bg-red-600/10 border border-red-600/20">
              <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
              <span className="text-[10px] text-red-400">{agent.error}</span>
            </div>
          )}

          {/* Output */}
          {agent.output && (
            <div className="px-2 py-1.5 rounded bg-c-surface/50 border border-c-border-strong/20">
              <div className="text-[9px] text-c-muted-light mb-0.5 font-medium">Output</div>
              <pre className="text-[10px] text-c-text-dim whitespace-pre-wrap font-mono leading-relaxed max-h-32 overflow-y-auto">
                {agent.output.slice(0, 2000)}
                {agent.output.length > 2000 ? '...' : ''}
              </pre>
            </div>
          )}

          {/* Copy output */}
          {agent.output && (
            <button
              onClick={() => navigator.clipboard.writeText(agent.output)}
              className="flex items-center gap-1 px-2 py-1 rounded text-[9px] text-c-muted hover:text-c-text-dim hover:bg-c-surface-hover transition-colors"
            >
              <Copy className="w-2.5 h-2.5" />
              Copy output
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// --- Group Card ---

function GroupCard({ group }: { group: ReturnType<typeof useExecutionEngineStore.getState>['groups'][0] }) {
  const { cancelGroup, addContext } = useExecutionEngineStore()
  const [showContextInput, setShowContextInput] = useState(false)
  const [contextContent, setContextContent] = useState('')
  const isRunning = group.status === 'running' || group.status === 'spawning'

  const handleAddContext = () => {
    if (!contextContent.trim()) return
    addContext(group.id, 'user', contextContent.trim())
    setContextContent('')
    setShowContextInput(false)
  }

  const formattedDuration = group.completed_at
    ? formatDuration(
        new Date(group.completed_at).getTime() - new Date(group.created_at).getTime()
      )
    : formatDuration(Date.now() - new Date(group.created_at).getTime())

  return (
    <div className="rounded-lg bg-c-card border border-c-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-c-border">
        <div className="flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-mothership-400" />
          <span className="text-[11px] font-medium text-c-text">{group.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-c-muted-light">{formattedDuration}</span>
          {isRunning && (
            <button
              onClick={() => cancelGroup(group.id)}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors"
            >
              <Square className="w-2.5 h-2.5" />
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="px-3 py-1.5 border-b border-c-border/50 flex items-center gap-2">
        {statusIcon(group.status)}
        <span className={`text-[10px] font-medium ${
          group.status === 'error' ? 'text-red-400' :
          group.status === 'completed' ? 'text-green-400' :
          group.status === 'running' ? 'text-blue-400' :
          'text-c-muted'
        }`}>
          {statusLabel(group.status)}
        </span>

        {/* Stats */}
        <span className="ml-auto text-[10px] text-c-muted-light">
          {group.agents.filter((a) => a.status === 'completed').length}/{group.agents.length} agents
        </span>
      </div>

      {/* Shared context */}
      {group.shared_context.length > 0 && (
        <div className="px-3 py-1.5 border-b border-c-border/50">
          <div className="flex items-center gap-1 mb-1">
            <Share2 className="w-2.5 h-2.5 text-c-muted" />
            <span className="text-[9px] font-medium text-c-muted">Shared Context</span>
          </div>
          <div className="space-y-0.5">
            {group.shared_context.map((entry, i) => (
              <div key={i} className="flex items-start gap-1">
                <span className="text-[8px] text-c-muted-light mt-0.5 flex-shrink-0">[{entry.source}]</span>
                <span className="text-[9px] text-c-text-dim leading-relaxed">
                  {entry.content.slice(0, 200)}
                  {entry.content.length > 200 ? '...' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Context input (only while running) */}
      {isRunning && (
        <div className="px-3 py-1.5 border-b border-c-border/50">
          {showContextInput ? (
            <div className="flex gap-1">
              <input
                type="text"
                value={contextContent}
                onChange={(e) => setContextContent(e.target.value)}
                placeholder="Add context for agents..."
                className="flex-1 px-2 py-1 bg-c-surface border border-c-border-strong rounded text-[10px] text-c-text-dim placeholder:text-c-muted-light outline-none focus:border-mothership-500/50"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddContext()
                  if (e.key === 'Escape') setShowContextInput(false)
                }}
                autoFocus
              />
              <button
                onClick={handleAddContext}
                disabled={!contextContent.trim()}
                className="px-2 py-1 rounded text-[9px] font-medium bg-mothership-600/20 text-mothership-400 hover:bg-mothership-600/30 disabled:opacity-50 transition-colors"
              >
                Send
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowContextInput(true)}
              className="flex items-center gap-1 text-[9px] text-c-muted hover:text-c-text-dim transition-colors"
            >
              <Plus className="w-2.5 h-2.5" />
              Add shared context
            </button>
          )}
        </div>
      )}

      {/* Agent list */}
      <div className="p-2 space-y-1">          {group.agents.map((agent) => (
            <AgentRow key={agent.agent_id} agent={agent} />
          ))}
      </div>
    </div>
  )
}

// --- New Execution Form ---

function NewExecutionForm({
  onClose,
}: {
  onClose: () => void
}) {
  const { startGroup } = useExecutionEngineStore()
  const agents = useAgentStore((s) => s.agents)
  const addNote = useMemoryStore((s) => s.addNote)

  const [name, setName] = useState('')
  const [agentSelections, setAgentSelections] = useState<Array<{
    agentId: string
    prompt: string
  }>>([{ agentId: '', prompt: '' }])
  const [sharedContext, setSharedContext] = useState('')
  const [isStarting, setIsStarting] = useState(false)

  const addAgentSlot = () => {
    setAgentSelections((prev) => [...prev, { agentId: '', prompt: '' }])
  }

  const removeAgentSlot = (index: number) => {
    setAgentSelections((prev) => prev.filter((_, i) => i !== index))
  }

  const updateAgentSlot = (index: number, field: 'agentId' | 'prompt', value: string) => {
    setAgentSelections((prev) =>
      prev.map((slot, i) => (i === index ? { ...slot, [field]: value } : slot))
    )
  }

  const canStart = name.trim() && agentSelections.some((a) => a.agentId && a.prompt.trim())

  const handleStart = async () => {
    if (!canStart || isStarting) return
    setIsStarting(true)

    const config: ExecutionGroupConfig = {
      name: name.trim(),
      agents: agentSelections
        .filter((a) => a.agentId && a.prompt.trim())
        .map((a) => ({
          agent_id: a.agentId,
          prompt: a.prompt.trim(),
        })),
      initial_context: sharedContext.trim() || undefined,
    }

    const groupId = await startGroup(config)
    if (groupId) {
      // Record in memory
      addNote(
        `Started execution group "${name}" with ${config.agents.length} agents`,
        undefined,
        ['execution', `agents:${config.agents.length}`]
      )
    }
    setIsStarting(false)
    onClose()
  }

  return (
    <div className="space-y-3">
      {/* Group name */}
      <div>
        <label className="text-[10px] font-medium text-c-text-dim mb-1 block">Execution Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Analyze PR from all angles"
          className="w-full px-2 py-1.5 bg-c-surface border border-c-border-strong rounded text-[11px] text-c-text-dim placeholder:text-c-muted-light outline-none focus:border-mothership-500/50"
        />
      </div>

      {/* Agent slots */}
      <div>
        <label className="text-[10px] font-medium text-c-text-dim mb-1 block">Agents</label>
        <div className="space-y-2">
          {agentSelections.map((slot, i) => (
            <div key={i} className="flex flex-col gap-1 p-2 rounded bg-c-surface/50 border border-c-border-strong/20">
              <div className="flex items-center gap-1">
                <select
                  value={slot.agentId}
                  onChange={(e) => updateAgentSlot(i, 'agentId', e.target.value)}
                  className="flex-1 px-2 py-1 bg-c-surface border border-c-border-strong rounded text-[10px] text-c-text-dim outline-none focus:border-mothership-500/50"
                >
                  <option value="">Select agent...</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.provider})
                    </option>
                  ))}
                </select>
                {agentSelections.length > 1 && (
                  <button
                    onClick={() => removeAgentSlot(i)}
                    className="p-1 rounded hover:bg-c-surface-hover text-c-muted hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              <textarea
                value={slot.prompt}
                onChange={(e) => updateAgentSlot(i, 'prompt', e.target.value)}
                placeholder="Enter prompt for this agent..."
                rows={2}
                className="w-full px-2 py-1 bg-c-surface border border-c-border-strong rounded text-[10px] text-c-text-dim placeholder:text-c-muted-light outline-none focus:border-mothership-500/50 resize-none"
              />
            </div>
          ))}
          <button
            onClick={addAgentSlot}
            className="flex items-center gap-1 px-2 py-1 rounded text-[9px] text-c-muted hover:text-c-text-dim hover:bg-c-surface-hover transition-colors"
          >
            <Plus className="w-2.5 h-2.5" />
            Add agent
          </button>
        </div>
      </div>

      {/* Shared context */}
      <div>
        <label className="text-[10px] font-medium text-c-text-dim mb-1 block">
          Shared Context{' '}
          <span className="text-c-muted-light font-normal">(optional — injected into all agent prompts)</span>
        </label>
        <textarea
          value={sharedContext}
          onChange={(e) => setSharedContext(e.target.value)}
          placeholder="Context visible to all agents..."
          rows={3}
          className="w-full px-2 py-1.5 bg-c-surface border border-c-border-strong rounded text-[10px] text-c-text-dim placeholder:text-c-muted-light outline-none focus:border-mothership-500/50 resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleStart}
          disabled={!canStart || isStarting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-medium bg-mothership-600 text-white hover:bg-mothership-500 disabled:opacity-50 transition-colors"
        >
          {isStarting ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Play className="w-3 h-3" />
          )}
          {isStarting ? 'Starting...' : `Execute with ${agentSelections.filter((a) => a.agentId).length} agent${agentSelections.filter((a) => a.agentId).length !== 1 ? 's' : ''}`}
        </button>
        <button
          onClick={onClose}
          className="px-2 py-1.5 rounded text-[10px] text-c-muted hover:text-c-text-dim hover:bg-c-surface-hover transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// --- Main Panel ---

export function ExecutionPanel() {
  const { groups, activeGroupId, setActiveGroup, clearCompleted } = useExecutionEngineStore()
  const [showNewForm, setShowNewForm] = useState(false)

  const activeGroup = groups.find((g) => g.id === activeGroupId)
  const completedCount = groups.filter((g) => g.status === 'completed').length
  const runningCount = groups.filter((g) => g.status === 'running' || g.status === 'spawning').length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-c-border/50">
        <div className="flex items-center gap-2 mb-1">
          <Play className="w-4 h-4 text-mothership-400" />
          <h3 className="text-xs font-medium text-c-text">Execution Engine</h3>
        </div>
        <p className="text-[10px] text-c-muted-light leading-relaxed">
          Run prompts across multiple agents in parallel with shared context.
        </p>

        {/* Stats */}
        <div className="flex items-center gap-3 mt-2">
          <div className="flex items-center gap-1 text-[10px] text-c-muted">
            <Users className="w-3 h-3" />
            <span>{groups.length} groups</span>
          </div>
          {runningCount > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-blue-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{runningCount} running</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-[10px] text-c-muted">
            <CheckCircle2 className="w-3 h-3" />
            <span>{completedCount} completed</span>
          </div>
        </div>
      </div>

      {/* New execution button */}
      <div className="p-2 border-b border-c-border/50">
        {showNewForm ? (
          <NewExecutionForm onClose={() => setShowNewForm(false)} />
        ) : (
          <button
            onClick={() => setShowNewForm(true)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-c-border-strong/40 text-c-muted hover:text-c-text-dim hover:border-c-border-strong hover:bg-c-surface-hover/30 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="text-[10px] font-medium">New Parallel Execution</span>
          </button>
        )}
      </div>

      {/* Group selector */}
      {groups.length > 1 && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-c-border/50 overflow-x-auto">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setActiveGroup(g.id)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] whitespace-nowrap transition-colors ${
                g.id === activeGroupId
                  ? 'bg-mothership-500/15 text-mothership-400 font-medium'
                  : 'text-c-muted hover:text-c-text-dim hover:bg-c-surface-hover'
              }`}
            >
              {statusIcon(g.status)}
              <span>{g.name}</span>
            </button>
          ))}
          {completedCount > 0 && (
            <button
              onClick={clearCompleted}
              className="ml-auto px-2 py-0.5 rounded text-[9px] text-c-muted-light hover:text-c-text-dim hover:bg-c-surface-hover transition-colors"
            >
              Clear completed
            </button>
          )}
        </div>
      )}

      {/* Group list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {groups.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-8 h-8 mx-auto mb-2 text-c-muted-light" />
            <p className="text-[10px] text-c-muted-light">No executions yet</p>
            <p className="text-[9px] text-c-muted-light mt-1">
              Create a parallel execution to run prompts across multiple agents
            </p>
          </div>
        ) : (
          <>
            {activeGroup && <GroupCard key={activeGroup.id} group={activeGroup} />}
            {!activeGroup && groups.slice(0, 5).map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
