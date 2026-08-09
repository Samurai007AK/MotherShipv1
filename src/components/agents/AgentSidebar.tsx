import { useState, useMemo } from 'react'
import {
  useAgentStore,
  getRoleColor,
  getRoleMeta,
  type Agent,
  type TeamCategory,
} from '../../stores/agentStore'
import { useStatusHeuristicsStore } from '../../stores/statusHeuristicsStore'
import { useExecutionEngineStore } from '../../stores/executionEngineStore'
import { AddAgentDialog } from './AddAgentDialog'
import { Plus, Play, Square, Trash2 } from 'lucide-react'

// ── Heuristic status emoji map ──────────────────────────────────────────

const HEURISTIC_EMOJI: Record<string, { emoji: string; label: string; color: string }> = {
  working: { emoji: '🟡', label: 'Working', color: 'text-yellow-400' },
  blocked: { emoji: '🔴', label: 'Blocked', color: 'text-red-400' },
  done: { emoji: '🔵', label: 'Done', color: 'text-blue-400' },
  idle: { emoji: '🟢', label: 'Idle', color: 'text-green-400' },
  error: { emoji: '⛔', label: 'Error', color: 'text-red-500' },
}

/** Derive heuristic status from agentStore + heuristic buffer */
function getHeuristicStatus(
  agentStatus: Agent['status'],
  bufferLastStatus: string | null,
  lastActivity: number | null
): { emoji: string; label: string; color: string } {
  if (agentStatus === 'error') return HEURISTIC_EMOJI.error
  if (agentStatus === 'offline') return { emoji: '⚪', label: 'Offline', color: 'text-zinc-500' }

  if (bufferLastStatus === 'running') {
    const idleDuration = lastActivity ? (Date.now() - lastActivity) / 1000 : 0
    if (idleDuration > 15) return HEURISTIC_EMOJI.blocked
    return HEURISTIC_EMOJI.working
  }

  // Recently transitioned to idle (within 10s) = done
  if (agentStatus === 'idle' && lastActivity && (Date.now() - lastActivity) < 10000) {
    return HEURISTIC_EMOJI.done
  }

  return HEURISTIC_EMOJI.idle
}

// --- Heuristic Status Badge ---

function HeuristicBadge({ agentId, status }: { agentId: string; status: Agent['status'] }) {
  const buffer = useStatusHeuristicsStore((s) => s.buffers[agentId])
  const heuristic = getHeuristicStatus(
    status,
    buffer?.lastStatus || null,
    buffer?.lastActivity || null
  )

  return (
    <span
      className={`text-[11px] ${heuristic.color}`}
      title={heuristic.label}
    >
      {heuristic.emoji}
    </span>
  )
}

// --- Agent Row ---

function AgentRow({
  agent,
  isActive,
  onSelect,
  onExecute,
  onCancel,
  onDelete,
  executionStatus
}: {
  agent: Agent
  isActive: boolean
  onSelect: () => void
  onExecute?: (agentId: string) => void
  onCancel?: (agentId: string) => void
  onDelete?: (agentId: string) => void
  executionStatus?: 'running' | 'idle' | 'error'
}) {
  const roleMeta = getRoleMeta(agent.role)
  return (
    <div
      onClick={onSelect}
      className={`group flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-150 ${
        isActive
          ? 'bg-mothership-500/10 border border-mothership-500/20'
          : 'hover:bg-c-surface/40 border border-transparent'
      }`}
    >
      {/* Role avatar */}
      <div className={`w-7 h-7 rounded-lg ${getRoleColor(agent.role)} flex items-center justify-center text-[10px] flex-shrink-0`}>
        {roleMeta.icon}
      </div>

      {/* Name + description */}
      <div className="flex-1 min-w-0">
        <div className={`text-[11px] font-medium truncate ${isActive ? 'text-c-text' : 'text-c-text-dim'}`}>
          {agent.name}
        </div>
        <div className="text-[9px] text-c-muted truncate">{agent.description}</div>
      </div>

      {/* Heuristic status badge */}
      <HeuristicBadge agentId={agent.id} status={agent.status} />

      {/* Execution controls - only show on hover */}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {executionStatus === 'running' ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onCancel?.(agent.id)
            }}
            className="p-0.5 text-c-muted hover:text-red-400 hover:bg-c-surface/50 rounded transition-colors"
            title="Cancel execution"
          >
            <Square className="w-3 h-3" />
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onExecute?.(agent.id)
            }}
            className="p-0.5 text-c-muted hover:text-green-400 hover:bg-c-surface/50 rounded transition-colors"
            title="Execute agent"
          >
            <Play className="w-3 h-3" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete?.(agent.id)
          }}
          className="p-0.5 text-c-muted hover:text-red-400 hover:bg-c-surface/50 rounded transition-colors"
          title="Delete agent"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

// --- Main Sidebar ---

const CATEGORY_LABELS: Record<TeamCategory, string> = {
  engineering: 'Engineering',
  operations: 'Operations',
  quality: 'Quality',
  'data-ai': 'Data & AI',
}

const CATEGORY_ORDER: TeamCategory[] = ['engineering', 'operations', 'quality', 'data-ai']

export function AgentSidebar() {
  const { agents, activeAgentId, setActiveAgent } = useAgentStore()
  const { startGroup } = useExecutionEngineStore()
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [executionStatusMap, setExecutionStatusMap] = useState<Record<string, 'running' | 'idle' | 'error'>>({})

  const runningCount = agents.filter((a) => a.status === 'running').length

  const handleExecuteAgent = useCallback(async (agentId: string) => {
    const agent = agents.find(a => a.id === agentId)
    if (!agent) return

    setExecutionStatusMap(prev => ({...prev, [agentId]: 'running'}))
    try {
      const roleMeta = getRoleMeta(agent.role)
      const groupId = await startGroup({
        name: `Task for ${agent.name}`,
        agents: [{
          agent_id: agent.id,
          prompt: agent.systemPrompt || roleMeta.systemPrompt
        }]
      })
      if (!groupId) {
        setExecutionStatusMap(prev => ({...prev, [agentId]: 'error'}))
      }
    } catch (error) {
      console.error('Failed to start execution:', error)
      setExecutionStatusMap(prev => ({...prev, [agentId]: 'error'}))
    } finally {
      setTimeout(() => {
        setExecutionStatusMap(prev => ({...prev, [agentId]: 'idle'}))
      }, 2000)
    }
  }, [agents, startGroup])

  const handleCancelAgent = useCallback((agentId: string) => {
    // TODO: Implement cancellation logic
    setExecutionStatusMap(prev => ({...prev, [agentId]: 'idle'}))
  }, [])

  const handleDeleteAgent = useCallback((agentId: string) => {
    // TODO: Implement deletion logic
  }, [])

  const categoryGroups = useMemo(() => {
    return CATEGORY_ORDER
      .map((cat) => ({
        category: cat,
        label: CATEGORY_LABELS[cat],
        agents: agents.filter((a) => a.category === cat),
      }))
      .filter((g) => g.agents.length > 0)
  }, [agents])

  return (
    <aside className="h-full border-r border-c-border bg-c-card flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-c-border">
        <h1 className="text-xs font-bold text-c-text tracking-wide">MOTHERSHIP</h1>
        <p className="text-[9px] text-c-muted mt-0.5">Engineering Team</p>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
        {categoryGroups.map(({ category, label, agents: groupAgents }) => (
          <div key={category}>
            {/* Category header */}
            <div className="px-1.5 py-1 text-[8px] font-semibold text-c-muted-light uppercase tracking-widest">
              {label} · {groupAgents.length}
            </div>
            <div className="space-y-0.5 mt-0.5">
              {groupAgents.map((agent) => (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  isActive={activeAgentId === agent.id}
                  onSelect={() => setActiveAgent(agent.id)}
                  onExecute={handleExecuteAgent}
                  onCancel={handleCancelAgent}
                  onDelete={handleDeleteAgent}
                  executionStatus={executionStatusMap[agent.id] || 'idle'}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-c-border">
        <div className="text-[9px] text-c-muted mb-2">
          {agents.length} team members{runningCount > 0 && ` · ${runningCount} active`}
        </div>
        <button
          onClick={() => setShowAddDialog(true)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-c-border-strong text-[9px] text-c-muted hover:text-c-muted-light hover:bg-c-surface/50 transition-all"
        >
          <Plus className="w-3 h-3" />
          Add Team Member
        </button>
      </div>

      <AddAgentDialog open={showAddDialog} onClose={() => setShowAddDialog(false)} />
    </aside>
  )
}
