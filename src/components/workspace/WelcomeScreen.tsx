import { useCallback } from 'react'
import { useAgentStore } from '../../stores/agentStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useMemoryStore } from '../../stores/memoryStore'
import { Terminal, Search, Play, Sparkles, ArrowRight, Clock, Bot, BookOpen } from 'lucide-react'

// --- Quick Action Card ---

function ActionCard({
  icon,
  title,
  description,
  shortcut,
  onClick,
  primary = false,
}: {
  icon: React.ReactNode
  title: string
  description: string
  shortcut?: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all duration-200 group ${
        primary
          ? 'bg-mothership-600/10 border-mothership-500/30 hover:bg-mothership-600/20 hover:border-mothership-500/50'
          : 'bg-c-surface/50 border-c-border-strong/30 hover:bg-c-surface hover:border-c-border-strong/60'
      }`}
    >
      <div
        className={`p-2 rounded-lg flex-shrink-0 ${
          primary
            ? 'bg-mothership-500/20 text-mothership-400'
            : 'bg-c-surface-hover/50 text-c-muted group-hover:text-c-text-dim'
        }`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-semibold mb-0.5 ${primary ? 'text-mothership-300' : 'text-c-text-dim'}`}>
          {title}
        </div>
        <div className="text-[10px] text-c-muted-light leading-relaxed">{description}</div>
        {shortcut && (
          <div className="mt-1.5 flex items-center gap-1">
            <kbd className="px-1 py-0.5 text-[8px] font-mono bg-c-surface-hover/50 text-c-muted-light rounded border border-c-border-strong/30">
              {shortcut}
            </kbd>
          </div>
        )}
      </div>
      <ArrowRight className={`w-4 h-4 mt-1 flex-shrink-0 transition-all duration-200 ${
        primary
          ? 'text-mothership-400 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5'
          : 'text-c-muted opacity-0 group-hover:opacity-60'
      }`} />
    </button>
  )
}

// --- Getting Started Step ---

function StepCard({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-c-surface/30 border border-c-border-strong/20">
      <div className="w-6 h-6 rounded-full bg-mothership-500/20 text-mothership-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
        {number}
      </div>
      <div>
        <div className="text-[11px] font-medium text-c-text-dim">{title}</div>
        <div className="text-[10px] text-c-muted-light leading-relaxed mt-0.5">{description}</div>
      </div>
    </div>
  )
}

// --- Recent Activity Row ---

function RecentActivity({ time, text }: { time: string; text: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-c-surface/30 transition-colors cursor-pointer">
      <Clock className="w-3 h-3 text-c-muted-light flex-shrink-0" />
      <span className="text-[10px] text-c-muted-light w-12 flex-shrink-0">{time}</span>
      <span className="text-[10px] text-c-text-dim truncate">{text}</span>
    </div>
  )
}

// --- Main Welcome Screen ---

export function WelcomeScreen() {
  const { agents, setActiveAgent } = useAgentStore()
  const { addTab } = useWorkspaceStore()
  const { notes } = useMemoryStore()

  const handleOpenTerminal = useCallback(() => {
    const firstAgent = agents[0]
    if (firstAgent) {
      setActiveAgent(firstAgent.id)
      addTab(firstAgent.id, firstAgent.name, firstAgent.provider)
    }
  }, [agents, setActiveAgent, addTab])

  const handleSearchMemory = useCallback(() => {
    useMemoryStore.getState().setActiveTab('search')
  }, [])

  const handleOpenNotes = useCallback(() => {
    useMemoryStore.getState().setActiveTab('notes')
  }, [])

  // Count recent activity (last 7 days)
  const recentNotes = notes.filter((n) => {
    const age = Date.now() - new Date(n.createdAt).getTime()
    return age < 7 * 24 * 60 * 60 * 1000
  })

  const runningCount = agents.filter((a) => a.status === 'running').length

  return (
    <div className="flex-1 flex overflow-y-auto">
      <div className="max-w-2xl mx-auto w-full px-8 py-10 space-y-8">
        {/* Hero */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-mothership-400" />
            <h1 className="text-lg font-bold text-c-text tracking-tight">Welcome to Crew</h1>
          </div>
          <p className="text-xs text-c-muted-light leading-relaxed max-w-lg">
            Your AI control center. Connect agents, run terminals, and keep
            knowledge shared across everything. Start with one of the actions below.
          </p>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-4 text-[10px] text-c-muted">
          <div className="flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-mothership-400" />
            <span className="font-medium text-c-text-dim">{agents.length}</span> agents
            {runningCount > 0 && (
              <span className="text-green-400 font-medium">({runningCount} active)</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-c-muted-light" />
            <span className="font-medium text-c-text-dim">{notes.length}</span> notes
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-2">
          <h2 className="text-[10px] font-semibold text-c-muted uppercase tracking-widest">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <ActionCard
              icon={<Terminal className="w-4 h-4" />}
              title="Open a Terminal"
              description="Start a shell session with any agent"
              shortcut="Ctrl+T"
              onClick={handleOpenTerminal}
              primary
            />
            <ActionCard
              icon={<Search className="w-4 h-4" />}
              title="Search Knowledge"
              description="Find notes, context, and decisions"
              shortcut="Ctrl+K"
              onClick={handleSearchMemory}
            />
            <ActionCard
              icon={<Play className="w-4 h-4" />}
              title="Start a Loop"
              description="Run autonomous task iterations"
              onClick={() => {}}
            />
            <ActionCard
              icon={<BookOpen className="w-4 h-4" />}
              title="Browse Notes"
              description="View and manage your memory"
              onClick={handleOpenNotes}
            />
          </div>
        </div>

        {/* Getting Started */}
        <div className="space-y-2">
          <h2 className="text-[10px] font-semibold text-c-muted uppercase tracking-widest">
            Getting Started
          </h2>
          <div className="space-y-1.5">
            <StepCard
              number={1}
              title="Select an agent from the sidebar"
              description="Click any agent to make it active, then open a terminal with Ctrl+T"
            />
            <StepCard
              number={2}
              title="Run commands in the terminal"
              description="Your agent's output is automatically captured as context"
            />
            <StepCard
              number={3}
              title="Save important findings as notes"
              description="Use the Memory panel to keep knowledge across sessions"
            />
          </div>
        </div>

        {/* Recent Activity */}
        {recentNotes.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-[10px] font-semibold text-c-muted uppercase tracking-widest">
              Recent Activity
            </h2>
            <div className="space-y-0.5">
              {recentNotes.slice(0, 6).map((note) => (
                <RecentActivity
                  key={note.id}
                  time={formatTimeAgoShort(note.createdAt)}
                  text={note.content.slice(0, 100)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-4 border-t border-c-border/50 text-center">
          <p className="text-[9px] text-c-muted-light">
            Press <kbd className="px-1 py-0.5 bg-c-surface rounded text-[8px] font-mono border border-c-border-strong/30">Ctrl+K</kbd> to open the command palette
          </p>
        </div>
      </div>
    </div>
  )
}

// --- Helpers ---

function formatTimeAgoShort(dateStr: string): string {
  const date = new Date(dateStr)
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}
