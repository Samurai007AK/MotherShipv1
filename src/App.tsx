import { useState, useCallback, useEffect } from 'react'
import { CommandPalette, useCommandPalette } from './components/command-palette/CommandPalette'
import { OnboardingWizard } from './components/onboarding/OnboardingWizard'
import { UpdateBanner } from './components/updater/UpdateBanner'
import { MenuBar } from './components/layout/MenuBar'
import { ActivityBar, type ActivityTab } from './components/layout/ActivityBar'
import { AgentSidebar } from './components/agents/AgentSidebar'
import { WorkspaceView } from './components/workspace/WorkspaceView'
import { MemoryPanel } from './components/memory/MemoryPanel'
import { PortsDialog } from './components/layout/PortsDialog'
import { useThemeStore } from './stores/themeStore'
import { useAgentStore } from './stores/agentStore'
import { useWorkspaceStore } from './stores/workspaceStore'
import { useWorktreeStore } from './stores/worktreeStore'
import { useContextCapture } from './hooks/useContextCapture'
import { initAcpEventListeners } from './stores/acpStore'
import { startStatusPolling } from './stores/statusHeuristicsStore'

export default function App() {
  const { isOpen, setIsOpen } = useCommandPalette()
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)
  const agents = useAgentStore((s) => s.agents)
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const addTab = useWorkspaceStore((s) => s.addTab)
  const setWorkspaceView = useWorktreeStore((s) => s.setWorkspaceView)

  const [activityTab, setActivityTab] = useState<ActivityTab>('agents')
  const [showPortsDialog, setShowPortsDialog] = useState(false)

  // Global context capture
  useContextCapture()

  // Sync resolved theme class onto <html>
  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(resolvedTheme)
  }, [resolvedTheme])

  // Initialize ACP event listeners and status polling on mount
  useEffect(() => {
    initAcpEventListeners()
    startStatusPolling(5000)
  }, [])

  // Cmd+M — toggle memory panel
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'm') {
        e.preventDefault()
        setActivityTab((prev) => prev === 'memory' ? 'agents' : 'memory')
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])  // ── MenuBar actions ─────────────────────────────────────────────────────

  const handleMenuAction = useCallback((action: string) => {
    switch (action) {
      case 'new-terminal':
        if (activeAgentId) {
          const agent = useAgentStore.getState().agents.find((a) => a.id === activeAgentId)
          if (agent) {
            addTab(agent.id, agent.name, agent.provider)
          }
        }
        break
      case 'close-terminal':
        if (activeAgentId) {
          useWorkspaceStore.getState().removeTab(activeAgentId)
        }
        break
      case 'command-palette':
        setIsOpen(true)
        break
      case 'toggle-memory':
        setActivityTab((prev) => prev === 'memory' ? 'agents' : 'memory')
        break
      case 'open-editor':
        setWorkspaceView('editor')
        break
      case 'open-worktrees':
        setWorkspaceView('worktrees')
        break
      case 'open-war-room':
        setActivityTab('memory')
        break
      case 'open-task-graph':
        setActivityTab('memory')
        break
      case 'open-ports':
        setShowPortsDialog(true)
        break
      case 'devtools':
        // Toggle devtools - handled by Tauri
        break
      case 'exit':
        // Close app - handled by Tauri
        break
      default:
        break
    }
  }, [activeAgentId, addTab, setIsOpen, setWorkspaceView])

  // ── Activity tab switching ──────────────────────────────────────────────

  const handleActivityTabChange = useCallback((tab: ActivityTab) => {
    setActivityTab(tab)
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-c-bg text-c-text transition-colors duration-200">
      {/* Update Banner */}
      <UpdateBanner />

      {/* Command Palette (Cmd+K) */}
      <CommandPalette isOpen={isOpen} onClose={() => setIsOpen(false)} />

      {/* Onboarding Wizard */}
      <OnboardingWizard />

      {/* VS Code-style Menu Bar */}
      <MenuBar onAction={handleMenuAction} />

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Activity Bar — thin left icon strip */}
        <ActivityBar
          activeTab={activityTab}
          onTabChange={handleActivityTabChange}
          agentCount={agents.length}
        />

        {/* Agent Sidebar (visible when in agents tab) */}
        {activityTab === 'agents' && (
          <div className="w-64 border-r border-c-border bg-c-card flex-shrink-0 overflow-hidden">
            <AgentSidebar />
          </div>
        )}

        {/* Main workspace */}
        <div className="flex-1 flex overflow-hidden">
          {activityTab === 'agents' ? (
            <WorkspaceView />
          ) : activityTab === 'memory' ? (
            <MemoryPanel fullWidth />
          ) : activityTab === 'settings' ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-2">
                <SettingsIcon />
                <p className="text-xs text-c-muted">Settings</p>
                <p className="text-[10px] text-c-muted-light max-w-xs">
                  Theme, keybindings, and preferences coming soon.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Ports Dialog */}
      <PortsDialog open={showPortsDialog} onClose={() => setShowPortsDialog(false)} />
    </div>
  )
}

function SettingsIcon() {
  return (
    <svg className="w-8 h-8 text-c-muted-light mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  )
}
