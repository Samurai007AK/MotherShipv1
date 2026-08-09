import { useCallback } from 'react'
import { useAgentStore } from '../../stores/agentStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useMCPStore } from '../../stores/mcpStore'
import {
  Plus,
  Globe,
  Plug,
  Sparkles,
  LayoutDashboard,
  Users,
  BrainCircuit,
  Bot,
  Cpu,
} from 'lucide-react'

export type NavTab = 'workspace' | 'agents' | 'memory' | 'automations' | 'acp'

// --- Navigation Tab Button ---

function NavButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg transition-all duration-150 ${
        active
          ? 'bg-mothership-500/15 text-mothership-300 shadow-sm'
          : 'text-c-muted hover:text-c-muted-light hover:bg-c-surface/50'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

// --- Main TopBar ---

export function TopBar({
  activeNav,
  onNavChange,
  onPortsClick,
}: {
  activeNav: NavTab
  onNavChange: (tab: NavTab) => void
  onPortsClick?: () => void
}) {
  const agents = useAgentStore((s) => s.agents)
  const mcpServers = useMCPStore((s) => s.servers)
  const runningCount = agents.filter((a) => a.status === 'running').length
  const connectedMCPServers = mcpServers.filter((s) => s.status === 'connected').length
  const totalMCPServers = mcpServers.length

  const handleNewWorkspace = useCallback(() => {
    const state = useAgentStore.getState()
    const firstAgent = state.agents[0]
    if (firstAgent) {
      state.setActiveAgent(firstAgent.id)
      const { addTab } = useWorkspaceStore.getState()
      addTab(firstAgent.id, firstAgent.name, firstAgent.provider)
      onNavChange('workspace')
    }
  }, [onNavChange])

  return (
    <header className="flex items-center h-11 px-4 border-b border-c-border bg-c-card flex-shrink-0">
      {/* Left: Logo */}
      <div className="flex items-center gap-2 mr-6">
        <div className="w-5 h-5 rounded-md bg-mothership-600 flex items-center justify-center">
          <Sparkles className="w-3 h-3 text-white" />
        </div>
        <span className="text-[11px] font-bold text-c-text tracking-wide">MOTHERSHIP</span>
      </div>

      {/* Center: Nav tabs */}
      <nav className="flex items-center gap-1">
        <NavButton
          icon={<LayoutDashboard className="w-3 h-3" />}
          label="Workspace"
          active={activeNav === 'workspace'}
          onClick={() => onNavChange('workspace')}
        />
        <NavButton
          icon={<Users className="w-3 h-3" />}
          label="Agents"
          active={activeNav === 'agents'}
          onClick={() => onNavChange('agents')}
        />
        <NavButton
          icon={<BrainCircuit className="w-3 h-3" />}
          label="Memory"
          active={activeNav === 'memory'}
          onClick={() => onNavChange('memory')}
        />
        <NavButton
          icon={<Bot className="w-3 h-3" />}
          label="Automations"
          active={activeNav === 'automations'}
          onClick={() => onNavChange('automations')}
        />
        <NavButton
          icon={<Cpu className="w-3 h-3" />}
          label="ACP"
          active={activeNav === 'acp'}
          onClick={() => onNavChange('acp')}
        />
      </nav>

      {/* Right: Status + Actions */}
      <div className="flex items-center gap-2 ml-auto">
        {/* Running agent count */}
        {runningCount > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-500/10 border border-green-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse-dot" />
            <span className="text-[10px] text-green-400 font-medium">{runningCount} running</span>
          </div>
        )}

        {/* MCP status badge */}
        <div
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors cursor-default ${
            connectedMCPServers > 0
              ? 'bg-mothership-500/10 border-mothership-500/20 text-mothership-400'
              : 'bg-c-surface/50 border-c-border-strong/30 text-c-muted-light'
          }`}
          title={`${connectedMCPServers} of ${totalMCPServers} MCP servers connected`}
        >
          <Plug className={`w-2.5 h-2.5 ${connectedMCPServers > 0 ? '' : 'opacity-50'}`} />
          <span className="text-[9px] font-medium">MCP</span>
          {totalMCPServers > 0 && (
            <span className="text-[8px] opacity-70">{connectedMCPServers}/{totalMCPServers}</span>
          )}
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              connectedMCPServers > 0 ? 'bg-green-400' : 'bg-zinc-600'
            }`}
          />
        </div>

        {/* Ports button */}
        <button
          onClick={onPortsClick}
          className="flex items-center gap-1 px-2 py-1 rounded-md border border-c-border-strong/30 bg-c-surface/50 text-c-muted hover:text-c-muted-light hover:bg-c-surface/80 transition-colors"
        >
          <Globe className="w-2.5 h-2.5" />
          <span className="text-[9px] font-medium">Ports</span>
        </button>

        {/* New Workspace button */}
        <button
          onClick={handleNewWorkspace}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-mothership-600/20 border border-mothership-500/30 text-mothership-300 hover:bg-mothership-600/30 hover:border-mothership-500/50 transition-all text-[10px] font-semibold"
        >
          <Plus className="w-3 h-3" />
          New Workspace
        </button>
      </div>
    </header>
  )
}
