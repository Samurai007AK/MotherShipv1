import { useState, useMemo } from 'react'
import { useAgentStore } from '../../stores/agentStore'
import { useMemoryStore } from '../../stores/memoryStore'
import { ChangesPanel } from '../diff/ChangesPanel'
import {
  FileText,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Search,
  ChevronDown,
  ChevronRight,
  Users,
} from 'lucide-react'

// --- Collapsible Section ---

function Section({
  title,
  icon,
  count,
  defaultOpen = true,
  children,
}: {
  title: string
  icon: React.ReactNode
  count?: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="px-3 py-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full text-left group"
      >
        {open ? <ChevronDown className="w-3 h-3 text-c-muted" /> : <ChevronRight className="w-3 h-3 text-c-muted" />}
        <span className="text-[9px] font-semibold text-c-muted-light uppercase tracking-widest">{icon}</span>
        <span className="text-[9px] font-semibold text-c-muted-light uppercase tracking-widest">{title}</span>
        {count !== undefined && (
          <span className="ml-auto text-[9px] text-c-muted-light bg-c-surface-hover/50 px-1 rounded">{count}</span>
        )}
      </button>
      {open && <div className="mt-1.5 space-y-0.5">{children}</div>}
    </div>
  )
}

// --- Agent Item (compact for sidebar) ---

function AgentItem({ agent }: { agent: { id: string; name: string; status: string; provider: string } }) {
  const setActiveAgent = useAgentStore((s) => s.setActiveAgent)

  return (
    <button
      onClick={() => setActiveAgent(agent.id)}
      className="flex items-center gap-2 px-2 py-1 rounded w-full text-left hover:bg-c-surface/40 transition-colors group"
    >
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          agent.status === 'running' ? 'bg-green-400 animate-pulse-dot'
          : agent.status === 'idle' ? 'bg-zinc-500'
          : agent.status === 'error' ? 'bg-red-400'
          : 'bg-zinc-700'
        }`}
      />
      <span className="text-[10px] text-c-text-dim truncate flex-1">{agent.name}</span>
      <span className="text-[8px] text-c-muted-light opacity-0 group-hover:opacity-100 transition-opacity">{agent.provider}</span>
    </button>
  )
}

// --- Main FileSidebar ---

export function FileSidebar() {
  const agents = useAgentStore((s) => s.agents)
  const notes = useMemoryStore((s) => s.notes)

  const agentsList = useMemo(() => agents, [agents])
  const runningCount = agents.filter((a) => a.status === 'running').length
  const noteCount = notes.length


  return (
    <aside className="h-full border-r border-c-border bg-c-card flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-c-border">
        <div className="flex items-center gap-2">
          <GitBranch className="w-3.5 h-3.5 text-c-muted" />
          <span className="text-[10px] font-medium text-c-text-dim">main</span>
        </div>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto divide-y divide-c-border/50">
        {/* Agents section */}
        <Section title="Agents" icon={<Users className="w-2.5 h-2.5" />} count={agentsList.length}>
          {agentsList.slice(0, 10).map((agent) => (
            <AgentItem key={agent.id} agent={agent} />
          ))}
          {agentsList.length > 10 && (
            <div className="text-[9px] text-c-muted-light text-center py-1">
              +{agentsList.length - 10} more
            </div>
          )}
        </Section>

        {/* Files section */}
        <Section title="Files" icon={<FileText className="w-2.5 h-2.5" />}>
          <div className="px-2 py-2 text-[9px] text-c-muted-light text-center">
            Open a terminal to browse files
          </div>
        </Section>

        {/* Changes section */}
        <Section title="Changes" icon={<GitCommit className="w-2.5 h-2.5" />} defaultOpen={true}>
          <div className="px-1 py-1">
            <ChangesPanel />
          </div>
        </Section>

        {/* Review section */}
        <Section title="Review" icon={<GitPullRequest className="w-2.5 h-2.5" />} defaultOpen={false}>
          <div className="px-2 py-2 text-[9px] text-c-muted-light text-center">
            No pending reviews
          </div>
        </Section>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-c-border">
        <div className="flex items-center justify-between text-[9px] text-c-muted">
          <span>{noteCount} notes</span>
          {runningCount > 0 && (
            <span className="text-green-400">{runningCount} active</span>
          )}
        </div>
        <button className="w-full flex items-center justify-center gap-1 mt-1.5 py-1 rounded border border-dashed border-c-border-strong/30 text-[9px] text-c-muted hover:text-c-muted-light hover:bg-c-surface/50 transition-all">
          <Search className="w-2.5 h-2.5" />
          Search files...
        </button>
      </div>
    </aside>
  )
}
