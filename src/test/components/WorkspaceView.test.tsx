import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkspaceView } from '../../components/workspace/WorkspaceView'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useAgentStore, type Agent } from '../../stores/agentStore'
import { useWorktreeStore } from '../../stores/worktreeStore'
import { useMemoryStore } from '../../stores/memoryStore'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

vi.mock('../../components/terminal/TerminalPane', () => ({
  TerminalPane: ({ agentId, visible }: { agentId: string; visible: boolean }) => (
    <div data-testid={`terminal-pane-${agentId}`} data-visible={visible}>
      Terminal {agentId}
    </div>
  ),
}))

vi.mock('../../components/terminal/SplitPane', () => ({
  SplitPaneContainer: ({ tabId }: { tabId: string }) => (
    <div data-testid={`split-pane-${tabId}`}>Split {tabId}</div>
  ),
}))

vi.mock('../../components/workspace/WorktreeManager', () => ({
  WorktreeManager: () => <div data-testid="worktree-manager">Worktrees</div>,
}))

const MOCK_AGENTS: Agent[] = [
  { id: 'claude', name: 'Claude', provider: 'claude', role: 'software-engineer', status: 'idle', description: '', category: 'engineering', model: 'claude-sonnet' },
  { id: 'codex', name: 'Codex', provider: 'codex', role: 'software-engineer', status: 'idle', description: '', category: 'engineering', model: 'codex-mini' },
]

function renderWorkspaceView() {
  return render(<WorkspaceView />)
}

function resetStores() {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    splitPanes: new Map(),
    activeSplitPaneId: null,
  })
  useAgentStore.setState({ agents: MOCK_AGENTS, activeAgentId: null })
  useWorktreeStore.setState({
    workspaceView: 'terminal',
    worktrees: [],
    activeWorktreeId: null,
    isInitialized: false,
    projectInfo: null,
    isGitAvailable: false,
  })
  useMemoryStore.setState({
    notes: [],
    searchQuery: '',
    contextHistory: [],
    contextFilter: '',
    globalSearchQuery: '',
    searchResults: [],
    isLoaded: true,
    loadFromBackend: vi.fn().mockResolvedValue(undefined),
  })
}

describe('WorkspaceView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetStores()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('view toggle', () => {
    it('shows view toggle buttons (Terminals / Worktrees)', () => {
      renderWorkspaceView()
      expect(screen.getByText('Terminals')).toBeInTheDocument()
      expect(screen.getByText('Worktrees')).toBeInTheDocument()
    })

    it('starts in terminal view by default', () => {
      renderWorkspaceView()
      expect(screen.getByText('Welcome to Crew')).toBeInTheDocument()
      expect(screen.queryByTestId('worktree-manager')).not.toBeInTheDocument()
    })

    it('switches to worktree view when Worktrees button is clicked', () => {
      renderWorkspaceView()
      fireEvent.click(screen.getByText('Worktrees'))
      expect(screen.getByTestId('worktree-manager')).toBeInTheDocument()
    })

    it('switches back to terminal view when Terminals button is clicked', () => {
      renderWorkspaceView()
      fireEvent.click(screen.getByText('Worktrees'))
      expect(screen.getByTestId('worktree-manager')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Terminals'))
      expect(screen.getByText('Welcome to Crew')).toBeInTheDocument()
    })

    it('highlights the active view button', () => {
      renderWorkspaceView()
      const terminalsBtn = screen.getByText('Terminals')
      expect(terminalsBtn).toBeInTheDocument()

      fireEvent.click(screen.getByText('Worktrees'))
      expect(screen.getByTestId('worktree-manager')).toBeInTheDocument()
    })
  })

  describe('welcome screen', () => {
    it('shows "Welcome to Crew" heading', () => {
      renderWorkspaceView()
      expect(screen.getByText('Welcome to Crew')).toBeInTheDocument()
    })

    it('shows description text', () => {
      renderWorkspaceView()
      expect(
        screen.getByText(/Your AI control center/)
      ).toBeInTheDocument()
    })

    it('shows agent count', () => {
      renderWorkspaceView()
      const twos = screen.getAllByText('2')
      expect(twos.length).toBeGreaterThanOrEqual(1)
      const agentTexts = screen.getAllByText(/agents/)
      expect(agentTexts.length).toBeGreaterThanOrEqual(1)
    })

    it('shows Quick Actions section', () => {
      renderWorkspaceView()
      expect(screen.getByText('Open a Terminal')).toBeInTheDocument()
      expect(screen.getByText('Search Knowledge')).toBeInTheDocument()
      expect(screen.getByText('Start a Loop')).toBeInTheDocument()
      expect(screen.getByText('Browse Notes')).toBeInTheDocument()
    })

    it('shows keyboard shortcut hint', () => {
      renderWorkspaceView()
      const shortcuts = screen.getAllByText('Ctrl+K')
      expect(shortcuts.length).toBeGreaterThanOrEqual(1)
    })

    it('shows Getting Started steps', () => {
      renderWorkspaceView()
      expect(screen.getByText('Select an agent from the sidebar')).toBeInTheDocument()
      expect(screen.getByText('Run commands in the terminal')).toBeInTheDocument()
      expect(screen.getByText('Save important findings as notes')).toBeInTheDocument()
    })

    it('opens a terminal when "Open a Terminal" card is clicked', () => {
      renderWorkspaceView()
      expect(useWorkspaceStore.getState().tabs.length).toBe(0)

      fireEvent.click(screen.getByText('Open a Terminal'))

      const { tabs } = useWorkspaceStore.getState()
      expect(tabs.length).toBe(1)
      expect(tabs[0].agentId).toBe('claude')
    })
  })

  describe('tab bar', () => {
    it('shows "No open terminals" when there are no tabs', () => {
      renderWorkspaceView()
      expect(screen.getByText('No open terminals')).toBeInTheDocument()
    })

    it('renders tab for each open terminal', () => {
      useWorkspaceStore.getState().addTab('claude', 'Claude', 'claude')
      renderWorkspaceView()

      expect(screen.getByText('Claude')).toBeInTheDocument()
    })

    it('renders multiple tabs', () => {
      useWorkspaceStore.getState().addTab('claude', 'Claude', 'claude')
      useWorkspaceStore.getState().addTab('codex', 'Codex', 'codex')
      renderWorkspaceView()

      expect(screen.getByText('Claude')).toBeInTheDocument()
      expect(screen.getByText('Codex')).toBeInTheDocument()
    })

    it('switches active tab when clicked', () => {
      useWorkspaceStore.getState().addTab('claude', 'Claude', 'claude')
      useWorkspaceStore.getState().addTab('codex', 'Codex', 'codex')
      renderWorkspaceView()

      expect(useWorkspaceStore.getState().activeTabId).toBe('codex')

      fireEvent.click(screen.getByText('Claude'))
      expect(useWorkspaceStore.getState().activeTabId).toBe('claude')
    })

    it('removes a tab when close button is clicked', () => {
      useWorkspaceStore.getState().addTab('claude', 'Claude', 'claude')
      renderWorkspaceView()

      expect(useWorkspaceStore.getState().tabs.length).toBe(1)

      const claudeTab = screen.getByText('Claude').closest('.group')!
      const closeBtn = claudeTab.querySelectorAll('button')
      fireEvent.click(closeBtn[closeBtn.length - 1])

      expect(useWorkspaceStore.getState().tabs.length).toBe(0)
    })
  })

  describe('terminal content', () => {
    it('renders a TerminalPane when a tab exists', () => {
      useWorkspaceStore.getState().addTab('claude', 'Claude', 'claude')
      renderWorkspaceView()

      expect(screen.getByTestId('terminal-pane-claude')).toBeInTheDocument()
    })

    it('renders TerminalPane for the active tab', () => {
      useWorkspaceStore.getState().addTab('claude', 'Claude', 'claude')
      useWorkspaceStore.getState().addTab('codex', 'Codex', 'codex')
      renderWorkspaceView()

      const codexPane = screen.getByTestId('terminal-pane-codex')
      expect(codexPane).toHaveAttribute('data-visible', 'true')
    })

    it('hides TerminalPane for inactive tabs', () => {
      useWorkspaceStore.getState().addTab('claude', 'Claude', 'claude')
      useWorkspaceStore.getState().addTab('codex', 'Codex', 'codex')
      renderWorkspaceView()

      const claudePane = screen.getByTestId('terminal-pane-claude')
      expect(claudePane).toHaveAttribute('data-visible', 'false')
    })
  })
})
