import { Users, BrainCircuit, Settings, type LucideIcon } from 'lucide-react'

export type ActivityTab = 'agents' | 'memory' | 'settings'

// ── Activity Icon Button ──────────────────────────────────────────────────

function ActivityButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`relative flex items-center justify-center w-11 h-11 transition-colors ${
        active
          ? 'text-c-text'
          : 'text-c-muted-light hover:text-c-text-dim'
      }`}
    >
      {/* Active indicator (VS Code style left bar) */}
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-mothership-500" />
      )}
      <Icon className="w-5 h-5" />
    </button>
  )
}

// ── Main ActivityBar ──────────────────────────────────────────────────────

export function ActivityBar({
  activeTab,
  onTabChange,
  agentCount,
}: {
  activeTab: ActivityTab
  onTabChange: (tab: ActivityTab) => void
  agentCount: number
}) {
  return (
    <aside className="w-11 h-full bg-c-card border-r border-c-border flex flex-col items-center pt-2 gap-0.5 flex-shrink-0">
      {/* Top section: main views */}
      <ActivityButton
        icon={Users}
        label={`Agents (${agentCount})`}
        active={activeTab === 'agents'}
        onClick={() => onTabChange('agents')}
      />
      <ActivityButton
        icon={BrainCircuit}
        label="Memory"
        active={activeTab === 'memory'}
        onClick={() => onTabChange('memory')}
      />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom section */}
      <ActivityButton
        icon={Settings}
        label="Settings"
        active={activeTab === 'settings'}
        onClick={() => onTabChange('settings')}
      />
    </aside>
  )
}
