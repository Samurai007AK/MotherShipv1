import { useCallback, useRef, useMemo } from 'react'
import { useAgentStore, getProviderColor, getStatusColor, type Agent } from '../../stores/agentStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'

// --- Mini Agent Card ---

function AgentCard({ agent, isActive, taskCount, onClick }: {
  agent: Agent
  isActive: boolean
  taskCount: number
  onClick: () => void
}) {
  const statusColor = getStatusColor(agent.status)

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all duration-150 flex-shrink-0 ${
        isActive
          ? 'bg-mothership-500/10 border-mothership-500/20'
          : 'bg-c-surface/30 border-transparent hover:bg-c-surface/60 hover:border-c-border-strong/40'
      }`}
    >
      {/* Avatar */}
      <div className={`w-5 h-5 rounded ${getProviderColor(agent.provider)} flex items-center justify-center text-[7px] font-bold text-white flex-shrink-0`}>
        {agent.name.slice(0, 2).toUpperCase()}
      </div>

      {/* Name */}
      <span className={`text-[10px] font-medium truncate max-w-[80px] ${
        isActive ? 'text-c-text' : 'text-c-text-dim'
      }`}>
        {agent.name}
      </span>

      {/* Status dot */}
      <span
        className={`w-1.5 h-1.5 rounded-full ${statusColor} ${
          agent.status === 'running' ? 'animate-pulse-dot' : ''
        }`}
        title={agent.status}
      />

      {/* Task count badge */}
      {taskCount > 0 && (
        <span className="text-[8px] font-medium text-mothership-400 bg-mothership-500/15 px-1 rounded">
          {taskCount}
        </span>
      )}
    </button>
  )
}

// --- Main Agent Bar ---

export function AgentBar() {
  const { agents, activeAgentId, setActiveAgent } = useAgentStore()
  const { addTab } = useWorkspaceStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  const handleAgentClick = useCallback((agent: Agent) => {
    setActiveAgent(agent.id)
    // If the agent already has a tab, switch to it; otherwise create one
    const { tabs, setActiveTab } = useWorkspaceStore.getState()
    const existing = tabs.find((t) => t.agentId === agent.id)
    if (existing) {
      setActiveTab(agent.id)
    } else {
      addTab(agent.id, agent.name, agent.provider)
    }
  }, [setActiveAgent, addTab])

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -200 : 200,
        behavior: 'smooth',
      })
    }
  }

  const { tabs } = useWorkspaceStore()

  const totalCount = agents.length
  const runningCount = agents.filter((a) => a.status === 'running').length

  // Track which agents have running tasks
  const taskCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const tab of tabs) {
      counts[tab.agentId] = (counts[tab.agentId] || 0) + 1
    }
    return counts
  }, [tabs])

  return (
    <div className="h-11 border-t border-c-border bg-c-card flex items-center px-3 gap-2 flex-shrink-0">
      {/* Count badge */}
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-c-surface/50 border border-c-border-strong/20 flex-shrink-0">
        <span className="text-[9px] font-medium text-c-muted">
          {totalCount} agents
        </span>
        {runningCount > 0 && (
          <>
            <span className="w-1 h-1 rounded-full bg-c-border-strong" />
            <span className="text-[9px] text-green-400 font-medium">{runningCount} active</span>
          </>
        )}
      </div>

      {/* Scroll buttons */}
      <button
        onClick={() => scroll('left')}
        className="p-0.5 rounded hover:bg-c-surface/50 text-c-muted hover:text-c-muted-light transition-colors flex-shrink-0"
      >
        <ChevronLeft className="w-3 h-3" />
      </button>

      {/* Agent cards (horizontal scroll) */}
      <div
        ref={scrollRef}
        className="flex items-center gap-1.5 overflow-x-auto flex-1 scrollbar-thin scrollbar-thumb-c-border scrollbar-track-transparent"
      >
        {agents.map((agent) => {
          const count = taskCounts[agent.id] || 0
          return (
            <AgentCard
              key={agent.id}
              agent={agent}
              isActive={activeAgentId === agent.id}
              taskCount={count}
              onClick={() => handleAgentClick(agent)}
            />
          )
        })}
      </div>

      {/* Scroll right */}
      <button
        onClick={() => scroll('right')}
        className="p-0.5 rounded hover:bg-c-surface/50 text-c-muted hover:text-c-muted-light transition-colors flex-shrink-0"
      >
        <ChevronRight className="w-3 h-3" />
      </button>

      {/* Add agent button */}
      <button className="flex items-center gap-1 px-2 py-1 rounded-md border border-dashed border-c-border-strong/30 text-c-muted hover:text-c-muted-light hover:bg-c-surface/50 transition-all flex-shrink-0">
        <Plus className="w-3 h-3" />
      </button>
    </div>
  )
}
