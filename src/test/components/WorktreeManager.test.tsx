import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { WorktreeManager } from '../../components/workspace/WorktreeManager'
import { useWorktreeStore, type WorktreeInfo, type ProjectGitInfo } from '../../stores/worktreeStore'
import { useAgentStore } from '../../stores/agentStore'

// ── Mock Tauri invoke ──────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// ── Mock hooks ─────────────────────────────────────────────────────────────

vi.mock('../../hooks/useWorktreeInit', () => ({
  useWorktreeInit: vi.fn(),
}))

vi.mock('../../hooks/useEditorDetection', () => ({
  useEditorDetection: vi.fn().mockReturnValue({ vsCode: true, cursor: true }),
}))

// ── Mock child components ──────────────────────────────────────────────────

vi.mock('../../components/workspace/DiffViewer', () => ({
  DiffViewer: () => <div data-testid="diff-viewer">Diff</div>,
}))

vi.mock('../../components/workspace/PresetPanel', () => ({
  PresetPanel: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="preset-panel">
      <button data-testid="preset-close" onClick={onClose}>Close</button>
    </div>
  ),
}))

// ── Mock data ──────────────────────────────────────────────────────────────

const MOCK_WORKTREES: WorktreeInfo[] = [
  {
    id: 'wt-1',
    branchName: 'feature/auth',
    worktreePath: '/tmp/repo/.mothership/worktrees/feature-auth',
    projectRoot: '/tmp/repo',
    status: 'active',
    agentId: 'claude',
    createdAt: '2026-06-21T10:00:00Z',
    aheadBehind: null,
    hasUncommitted: false,
    commitsAhead: 0,
    commitsBehind: 0,
  },
  {
    id: 'wt-2',
    branchName: 'fix/login-bug',
    worktreePath: '/tmp/repo/.mothership/worktrees/fix-login-bug',
    projectRoot: '/tmp/repo',
    status: 'active',
    agentId: null,
    createdAt: '2026-06-20T08:00:00Z',
    aheadBehind: '1 ahead, 2 behind',
    hasUncommitted: true,
    commitsAhead: 1,
    commitsBehind: 2,
  },
]

const MOCK_PROJECT_INFO: ProjectGitInfo = {
  rootPath: '/tmp/repo',
  currentBranch: 'main',
  hasRemotes: true,
  remoteName: 'origin',
  hasUncommitted: false,
}

const MOCK_AGENTS = [
  { id: 'claude', name: 'Claude', provider: 'claude' as const, role: 'software-engineer' as const, status: 'idle' as const, description: 'Anthropic Claude', category: 'engineering' as const },
  { id: 'codex', name: 'Codex', provider: 'codex' as const, role: 'software-engineer' as const, status: 'idle' as const, description: 'OpenAI Codex', category: 'engineering' as const },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function renderManager() {
  return render(<WorktreeManager />)
}

function resetStore() {
  useWorktreeStore.setState({
    worktrees: [],
    activeWorktreeId: null,
    isInitialized: false,
    projectInfo: null,
    worktreePorts: new Map(),
    worktreeDiffCache: new Map(),
    presetConfig: { setup: [], teardown: [], presets: [] },
    // Replace async store actions with no-ops to prevent act() warnings
    detectProject: vi.fn().mockResolvedValue(null),
    listWorktrees: vi.fn().mockResolvedValue(undefined),
    createWorktree: vi.fn(),
    deleteWorktree: vi.fn(),
    syncWorktree: vi.fn().mockResolvedValue(''),
    commitWorktreeChanges: vi.fn().mockResolvedValue(''),
    pushWorktreeBranch: vi.fn().mockResolvedValue(''),
    openWorktreeTerminal: vi.fn().mockResolvedValue(undefined),
    readPresetConfig: vi.fn().mockResolvedValue({ setup: [], teardown: [], presets: [] }),
    setActiveWorktree: vi.fn(),
    setWorkspaceView: vi.fn(),
    allocatePort: vi.fn(),
    listWorktreePorts: vi.fn().mockResolvedValue([]),
    releaseWorktreePort: vi.fn(),
    releaseAllWorktreePorts: vi.fn(),
    runPresetSetup: vi.fn(),
    getWorktreeDiff: vi.fn().mockRejectedValue(new Error('not called')),
    addWorktreeNote: vi.fn(),
    getWorktreeNotes: vi.fn().mockReturnValue([]),
  })
  useAgentStore.setState({
    agents: MOCK_AGENTS,
    activeAgentId: null,
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('WorktreeManager', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    resetStore()
  })

  // ── Loading state ────────────────────────────────────────────────────

  describe('loading state', () => {
    it('shows loading spinner when isInitialized is false', () => {
      renderManager()
      expect(screen.getByText('Detecting git project...')).toBeInTheDocument()
      expect(document.querySelector('.animate-spin')).toBeInTheDocument()
    })

    it('does not show the worktree header when loading', () => {
      renderManager()
      expect(screen.queryByText('Worktrees')).not.toBeInTheDocument()
    })
  })

  // ── Non-git state ────────────────────────────────────────────────────

  describe('non-git state', () => {
    beforeEach(() => {
      useWorktreeStore.setState({
        isInitialized: true,
        projectInfo: null,
      })
    })

    it('shows the "Not a Git Repository" message', () => {
      renderManager()
      expect(screen.getByText('Not a Git Repository')).toBeInTheDocument()
    })

    it('shows a Retry Detection button', () => {
      renderManager()
      expect(screen.getByText('Retry Detection')).toBeInTheDocument()
    })

    it('calls detectProject when Retry is clicked', async () => {
      const detectProject = vi.fn().mockResolvedValue(null)
      useWorktreeStore.setState({ detectProject })
      renderManager()

      await act(async () => {
        fireEvent.click(screen.getByText('Retry Detection'))
      })

      expect(detectProject).toHaveBeenCalledWith('.')
    })

    it('shows the GitBranch icon', () => {
      renderManager()
      expect(document.querySelector('.lucide-git-branch')).toBeInTheDocument()
    })
  })

  // ── Normal state: header ─────────────────────────────────────────────

  describe('header', () => {
    beforeEach(() => {
      useWorktreeStore.setState({
        isInitialized: true,
        projectInfo: MOCK_PROJECT_INFO,
        worktrees: MOCK_WORKTREES,
      })
    })

    it('shows the Worktrees title', () => {
      renderManager()
      expect(screen.getByText('Worktrees')).toBeInTheDocument()
    })

    it('shows the current branch name', () => {
      renderManager()
      expect(screen.getByText('main')).toBeInTheDocument()
    })

    it('shows the DIRTY badge when project has uncommitted changes', () => {
      useWorktreeStore.setState({
        projectInfo: { ...MOCK_PROJECT_INFO, hasUncommitted: true },
      })
      renderManager()
      expect(screen.getByText('DIRTY')).toBeInTheDocument()
    })

    it('does not show the DIRTY badge when project is clean', () => {
      renderManager()
      expect(screen.queryByText('DIRTY')).not.toBeInTheDocument()
    })

    it('shows the Presets button', () => {
      renderManager()
      expect(screen.getByTitle('Workspace presets')).toBeInTheDocument()
    })

    it('shows the New Workspace button', () => {
      renderManager()
      expect(screen.getByText('New Workspace')).toBeInTheDocument()
    })
  })

  // ── Normal state: worktree list ──────────────────────────────────────

  describe('worktree list', () => {
    beforeEach(() => {
      useWorktreeStore.setState({
        isInitialized: true,
        projectInfo: MOCK_PROJECT_INFO,
        worktrees: MOCK_WORKTREES,
      })
    })

    it('renders a WorktreeCard for each worktree', () => {
      renderManager()
      expect(screen.getByText('feature/auth')).toBeInTheDocument()
      expect(screen.getByText('fix/login-bug')).toBeInTheDocument()
    })

    it('shows the agent badge on worktree cards when assigned', () => {
      renderManager()
      expect(screen.getByText('claude')).toBeInTheDocument()
    })

    it('shows worktree paths', () => {
      renderManager()
      expect(screen.getByText('/tmp/repo/.mothership/worktrees/feature-auth')).toBeInTheDocument()
    })
  })

  // ── Normal state: empty list ─────────────────────────────────────────

  describe('empty worktree list', () => {
    beforeEach(() => {
      useWorktreeStore.setState({
        isInitialized: true,
        projectInfo: MOCK_PROJECT_INFO,
        worktrees: [],
      })
    })

    it('shows the empty state message', () => {
      renderManager()
      expect(screen.getByText('No worktree workspaces yet')).toBeInTheDocument()
    })

    it('shows the FolderOpen icon', () => {
      renderManager()
      expect(document.querySelector('.lucide-folder-open')).toBeInTheDocument()
    })

    it('does not show the footer', () => {
      renderManager()
      // The empty state has "No worktree workspaces yet" which contains "workspace" —
      // instead check that the Refresh button (a footer-only element) is absent
      expect(screen.queryByText('Refresh')).not.toBeInTheDocument()
    })
  })

  // ── Footer ───────────────────────────────────────────────────────────

  describe('footer', () => {
    beforeEach(() => {
      useWorktreeStore.setState({
        isInitialized: true,
        projectInfo: MOCK_PROJECT_INFO,
        worktrees: MOCK_WORKTREES,
      })
    })

    it('shows the worktree count', () => {
      renderManager()
      expect(screen.getByText('2 workspaces')).toBeInTheDocument()
    })

    it('shows singular count for one worktree', () => {
      useWorktreeStore.setState({ worktrees: [MOCK_WORKTREES[0]] })
      renderManager()
      expect(screen.getByText('1 workspace')).toBeInTheDocument()
    })

    it('shows a Refresh button', async () => {
      const listWorktrees = vi.fn().mockResolvedValue(undefined)
      useWorktreeStore.setState({ listWorktrees })
      renderManager()

      await act(async () => {
        fireEvent.click(screen.getByText('Refresh'))
      })

      expect(listWorktrees).toHaveBeenCalledWith('/tmp/repo')
    })
  })

  // ── Create panel ────────────────────────────────────────────────────

  describe('create panel', () => {
    beforeEach(() => {
      useWorktreeStore.setState({
        isInitialized: true,
        projectInfo: MOCK_PROJECT_INFO,
        worktrees: MOCK_WORKTREES,
      })
    })

    it('shows the create form when New Workspace is clicked', () => {
      renderManager()
      fireEvent.click(screen.getByText('New Workspace'))

      expect(screen.getByPlaceholderText('Task name (e.g., fix-login-bug)')).toBeInTheDocument()
    })

    it('shows Cancel text and X icon when create panel is open', () => {
      renderManager()
      fireEvent.click(screen.getByText('New Workspace'))

      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })

    it('hides the create form when Cancel is clicked', () => {
      renderManager()
      fireEvent.click(screen.getByText('New Workspace'))
      expect(screen.getByPlaceholderText('Task name (e.g., fix-login-bug)')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Cancel'))
      expect(screen.queryByPlaceholderText('Task name (e.g., fix-login-bug)')).not.toBeInTheDocument()
    })

    it('shows agent select dropdown with available agents', () => {
      renderManager()
      fireEvent.click(screen.getByText('New Workspace'))

      expect(screen.getByText('Claude')).toBeInTheDocument()
      expect(screen.getByText('Codex')).toBeInTheDocument()
    })

    it('shows preset select dropdown', () => {
      renderManager()
      fireEvent.click(screen.getByText('New Workspace'))

      expect(screen.getByText('No preset')).toBeInTheDocument()
    })

    it('shows base branch input with placeholder', () => {
      renderManager()
      fireEvent.click(screen.getByText('New Workspace'))

      const baseInput = screen.getByPlaceholderText('main')
      expect(baseInput).toBeInTheDocument()
    })

    it('shows Create Workspace button', () => {
      renderManager()
      fireEvent.click(screen.getByText('New Workspace'))

      expect(screen.getByText('Create Workspace')).toBeInTheDocument()
    })

    it('disables Create Workspace when task name is empty', async () => {
      renderManager()
      fireEvent.click(screen.getByText('New Workspace'))
      // Flush microtasks from CreateWorktreePanel mount useEffect (readPresetConfig)
      await act(async () => {})

      const createBtn = screen.getByText('Create Workspace')
      expect(createBtn).toBeDisabled()
    })

    it('enables Create Workspace when task name is filled', () => {
      renderManager()
      fireEvent.click(screen.getByText('New Workspace'))

      const input = screen.getByPlaceholderText('Task name (e.g., fix-login-bug)')
      fireEvent.change(input, { target: { value: 'my-task' } })

      const createBtn = screen.getByText('Create Workspace')
      expect(createBtn).not.toBeDisabled()
    })

    it('calls createWorktree on submission', () => {
      const createWorktree = vi.fn().mockResolvedValue({ success: true, workspace: MOCK_WORKTREES[0], error: null })
      const listWorktrees = vi.fn().mockResolvedValue(undefined)
      useWorktreeStore.setState({ createWorktree, listWorktrees })
      renderManager()

      fireEvent.click(screen.getByText('New Workspace'))

      const input = screen.getByPlaceholderText('Task name (e.g., fix-login-bug)')
      fireEvent.change(input, { target: { value: 'my-feature' } })

      fireEvent.click(screen.getByText('Create Workspace'))

      expect(createWorktree).toHaveBeenCalledWith('/tmp/repo', 'my-feature', 'main', undefined)
    })
  })

  // ── Presets panel ───────────────────────────────────────────────────

  describe('presets panel', () => {
    beforeEach(() => {
      useWorktreeStore.setState({
        isInitialized: true,
        projectInfo: MOCK_PROJECT_INFO,
        worktrees: MOCK_WORKTREES,
      })
    })

    it('shows the PresetPanel when Presets button is clicked', () => {
      renderManager()
      fireEvent.click(screen.getByTitle('Workspace presets'))

      expect(screen.getByTestId('preset-panel')).toBeInTheDocument()
    })

    it('hides PresetPanel when close is clicked', () => {
      renderManager()
      fireEvent.click(screen.getByTitle('Workspace presets'))
      expect(screen.getByTestId('preset-panel')).toBeInTheDocument()

      fireEvent.click(screen.getByTestId('preset-close'))
      expect(screen.queryByTestId('preset-panel')).not.toBeInTheDocument()
    })

    it('hides create panel when presets is clicked (and vice versa)', () => {
      renderManager()

      // Open create panel first
      fireEvent.click(screen.getByText('New Workspace'))
      expect(screen.getByPlaceholderText('Task name (e.g., fix-login-bug)')).toBeInTheDocument()

      // Click presets — create panel should close
      fireEvent.click(screen.getByTitle('Workspace presets'))
      expect(screen.queryByPlaceholderText('Task name (e.g., fix-login-bug)')).not.toBeInTheDocument()
      expect(screen.getByTestId('preset-panel')).toBeInTheDocument()
    })
  })

  // ── Component integration ────────────────────────────────────────────

  describe('component integration', () => {
    it('shows GitBranch icon in the header', () => {
      useWorktreeStore.setState({
        isInitialized: true,
        projectInfo: MOCK_PROJECT_INFO,
        worktrees: MOCK_WORKTREES,
      })
      renderManager()
      const branchIcons = document.querySelectorAll('.lucide-git-branch')
      expect(branchIcons.length).toBeGreaterThanOrEqual(1)
    })
  })
})
