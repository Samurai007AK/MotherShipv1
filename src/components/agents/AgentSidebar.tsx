import { useState, useRef, useCallback, useMemo } from 'react'
import { useAgentStore, getProviderColor, getStatusColor, type Agent, type AgentStatus, type AgentCategory } from '../../stores/agentStore'
import { AddAgentDialog } from './AddAgentDialog'
import { Plus, Settings, GripVertical, ChevronDown } from 'lucide-react'
import { ThemeToggle } from '../layout/ThemeToggle'

// --- Agent Avatar (colored circle with initials) ---

function AgentAvatar({ agent, isActive }: { agent: Agent; isActive: boolean }) {
  const providerColor = getProviderColor(agent.provider)
  const initials = agent.name.slice(0, 2).toUpperCase()

  return (
    <div
      className={`relative w-8 h-8 rounded-lg ${providerColor} flex items-center justify-center text-xs font-bold text-white transition-all duration-200 ${
        isActive ? 'ring-2 ring-white/30 scale-105' : 'opacity-80'
      }`}
    >
      {initials}
    </div>
  )
}

// --- Status Dot ---

function StatusDot({ status }: { status: AgentStatus }) {
  const color = getStatusColor(status)
  const isRunning = status === 'running'

  return (
    <span
      className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-c-card ${color} ${
        isRunning ? 'animate-pulse-dot' : ''
      }`}
      title={status}
    />
  )
}

// --- Single Agent Row ---

interface AgentRowProps {
  agent: Agent
  isActive: boolean
  index: number
  onSelect: () => void
  onDragStart: (index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDrop: (index: number) => void
}

function AgentRow({
  agent,
  isActive,
  index,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
}: AgentRowProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isDescHovered, setIsDescHovered] = useState(false)

  return (
    <div
      className={`group relative flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer transition-all duration-150 select-none ${
        isActive
          ? 'bg-c-surface border border-c-border-strong/50'
          : 'hover:bg-c-surface/50 border border-transparent'
      } ${isDragging ? 'opacity-40 scale-95' : ''} ${      isDragOver ? 'border-mothership-500/50 bg-c-surface/30' : ''}`}
      onClick={onSelect}
      draggable
      onDragStart={(e) => {
        setIsDragging(true)
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', String(index))
        onDragStart(index)
      }}
      onDragEnd={() => setIsDragging(false)}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setIsDragOver(true)
        onDragOver(e, index)
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragOver(false)
        onDrop(index)
      }}
    >
      {/* Drag handle */}
      <div className="opacity-0 group-hover:opacity-40 transition-opacity cursor-grab active:cursor-grabbing">
        <GripVertical className="w-3 h-3 text-c-muted" />
      </div>

      {/* Avatar with status dot */}
      <div className="relative flex-shrink-0">
        <AgentAvatar agent={agent} isActive={isActive} />
        <StatusDot status={agent.status} />
      </div>

      {/* Name + description */}
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-medium truncate ${isActive ? 'text-c-text' : 'text-c-text-dim'}`}>
          {agent.name}
        </div>
        <div className="relative">
          <div
            title={agent.description}
            className={`text-[10px] text-c-muted cursor-pointer hover:text-c-muted-light transition-colors ${
              isExpanded ? 'whitespace-normal break-words' : 'truncate'
            }`}
            onMouseEnter={() => setIsDescHovered(true)}
            onMouseLeave={() => setIsDescHovered(false)}
            onClick={(e) => {
              e.stopPropagation()
              setIsExpanded(!isExpanded)
            }}
          >
            {agent.description}
          </div>
          {/* Custom tooltip — only shown when truncated and not expanded */}
          {!isExpanded && isDescHovered && agent.description.length > 40 && (
            <div className="absolute left-0 bottom-full mb-1 z-50 max-w-[220px] px-2.5 py-1.5 rounded-md bg-c-bg border border-c-border shadow-lg text-[10px] text-c-text-dim leading-relaxed pointer-events-none animate-tooltip-in">
              {agent.description}
              <div className="absolute left-3 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-c-border" />
            </div>
          )}
        </div>
      </div>

      {/* Model badge (if known) */}
      {agent.model && isActive && (
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-c-surface-hover/50 text-c-muted flex-shrink-0">
          {agent.model}
        </span>
      )}
    </div>
  )
}

// --- Main Sidebar Component ---

export function AgentSidebar() {
  const { agents, activeAgentId, setActiveAgent, reorderAgents } = useAgentStore()
  const [showAddDialog, setShowAddDialog] = useState(false)
  const dragIndexRef = useRef<number | null>(null)

  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index
  }, [])

  const handleDragOver = useCallback((_e: React.DragEvent, _index: number) => {
    // Visual feedback handled by state
  }, [])

  const handleDrop = useCallback(
    (dropIndex: number) => {
      const dragIndex = dragIndexRef.current
      if (dragIndex !== null && dragIndex !== dropIndex) {
        reorderAgents(dragIndex, dropIndex)
      }
      dragIndexRef.current = null
    },
    [reorderAgents]
  )

  const runningCount = agents.filter((a) => a.status === 'running').length
  const [collapsedCategories, setCollapsedCategories] = useState<Set<AgentCategory>>(new Set())

  const toggleCategory = useCallback((cat: AgentCategory) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }, [])

  const CATEGORY_LABELS: Record<AgentCategory, string> = {
    coding: 'Coding',
    research: 'Research',
    ops: 'Operations',
    creative: 'Creative',
  }

  const CATEGORY_ORDER: AgentCategory[] = ['coding', 'research', 'ops', 'creative']

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
      <div className="p-4 border-b border-c-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-c-text tracking-wide">
              MOTHERSHIP
            </h1>
            <p className="text-[10px] text-c-muted mt-0.5">AI Control Center</p>
          </div>
          <ThemeToggle />
          <button
            className="p-1.5 rounded-md hover:bg-c-surface text-c-muted hover:text-c-text-dim transition-colors"
            title="Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Agent list grouped by category */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {categoryGroups.map(({ category, label, agents: groupAgents }) => (
          <div key={category}>
            <button
              onClick={() => toggleCategory(category)}
              className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-c-muted uppercase tracking-wider hover:text-c-text-dim transition-colors"
            >
              <ChevronDown
                className={`w-3 h-3 transition-transform ${
                  collapsedCategories.has(category) ? '-rotate-90' : ''
                }`}
              />
              {label}
              <span className="ml-auto text-[9px] text-c-muted-light font-normal">
                {groupAgents.length}
              </span>
            </button>
            {!collapsedCategories.has(category) &&
              groupAgents.map((agent) => {
                const globalIndex = agents.indexOf(agent)
                return (
                  <AgentRow
                    key={agent.id}
                    agent={agent}
                    isActive={activeAgentId === agent.id}
                    index={globalIndex}
                    onSelect={() => setActiveAgent(agent.id)}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                  />
                )
              })}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-c-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-c-muted">
            {agents.length} agents
            {runningCount > 0 && (
              <span className="text-status-running ml-1">
                {runningCount} active
              </span>
            )}
          </span>
        </div>
        <button
          onClick={() => setShowAddDialog(true)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-c-border-strong text-[10px] text-c-muted hover:text-c-muted-light hover:bg-c-surface/50 transition-all"
        >
          <Plus className="w-3 h-3" />
          Add Agent
        </button>
      </div>

      <AddAgentDialog open={showAddDialog} onClose={() => setShowAddDialog(false)} />
    </aside>
  )
}
