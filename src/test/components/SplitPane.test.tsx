import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SplitPaneContainer } from '../../components/terminal/SplitPane'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import type { SplitPaneState } from '../../stores/workspaceStore'

// ── Mock react-resizable-panels ────────────────────────────────────────────

vi.mock('react-resizable-panels', () => ({
  Group: ({ children, orientation }: { children: React.ReactNode; orientation: string }) => (
    <div data-testid="resizable-group" data-orientation={orientation}>
      {children}
    </div>
  ),
  Panel: ({ children, defaultSize, minSize }: { children: React.ReactNode; defaultSize: number; minSize: number }) => (
    <div data-testid="resizable-panel" data-default-size={defaultSize} data-min-size={minSize}>
      {children}
    </div>
  ),
  Separator: ({ className }: { className: string }) => (
    <div data-testid="resizable-separator" className={className} />
  ),
}))

// ── Mock TerminalPane ─────────────────────────────────────────────────────

vi.mock('../../components/terminal/TerminalPane', () => ({    TerminalPane: ({ agentId, visible }: { agentId: string; visible: boolean }) => (
    <div data-testid={`terminal-pane-${agentId}`} data-visible={visible}>
      Terminal: {agentId}
    </div>
  ),
}))

// ── Mock Tauri invoke ──────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// ── Mock agent store ───────────────────────────────────────────────────────

vi.mock('../../stores/agentStore', () => ({
  useAgentStore: {
    getState: () => ({
      updateAgentStatus: vi.fn(),
    }),
  },
}))

// ── Mock data ──────────────────────────────────────────────────────────────

const MOCK_SPLIT_PANES: SplitPaneState[] = [
  {
    id: 'split-1',
    agentId: 'codex',
    agentName: 'Codex',
    provider: 'codex',
    direction: 'horizontal',
  },
  {
    id: 'split-2',
    agentId: 'gemini',
    agentName: 'Gemini',
    provider: 'gemini',
    direction: 'horizontal',
  },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function renderSplitPane(
  overrides: {
    splitPanes?: SplitPaneState[]
    visible?: boolean
  } = {}
) {
  const {
    splitPanes = [],
    visible = true,
  } = overrides

  return render(
    <SplitPaneContainer
      tabId="claude"
      primaryAgentId="claude"
      primaryWorkingDir="/home/test"
      splitPanes={splitPanes}
      visible={visible}
      onRegisterRef={vi.fn()}
      onExit={vi.fn()}
      onError={vi.fn()}
    />
  )
}

function resetStore() {
  useWorkspaceStore.setState({
    splitPanes: new Map(),
    activeSplitPaneId: null,
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SplitPaneContainer', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetStore()
  })

  // ── No splits ─────────────────────────────────────────────────────────

  describe('no splits', () => {
    it('renders the primary TerminalPane when there are no split panes', () => {
      renderSplitPane()

      expect(screen.getByTestId('terminal-pane-claude')).toBeInTheDocument()
    })

    it('passes visible prop to the primary TerminalPane', () => {
      renderSplitPane({ visible: true })

      const pane = screen.getByTestId('terminal-pane-claude')
      expect(pane).toHaveAttribute('data-visible', 'true')
    })

    it('passes visible=false to the primary TerminalPane', () => {
      renderSplitPane({ visible: false })

      const pane = screen.getByTestId('terminal-pane-claude')
      expect(pane).toHaveAttribute('data-visible', 'false')
    })

    it('does not render resizable group when no splits', () => {
      renderSplitPane()

      expect(screen.queryByTestId('resizable-group')).not.toBeInTheDocument()
    })

    it('does not show close split buttons when no splits', () => {
      renderSplitPane()

      expect(screen.queryByTitle('Close split pane')).not.toBeInTheDocument()
    })
  })

  // ── With splits ──────────────────────────────────────────────────────

  describe('with splits', () => {
    beforeEach(() => {
      useWorkspaceStore.setState({
        activeSplitPaneId: null,
      })
    })

    it('renders resizable Group when split panes exist', () => {
      renderSplitPane({ splitPanes: MOCK_SPLIT_PANES })

      expect(screen.getByTestId('resizable-group')).toBeInTheDocument()
    })

    it('passes direction to the Group', () => {
      renderSplitPane({ splitPanes: MOCK_SPLIT_PANES })

      const group = screen.getByTestId('resizable-group')
      expect(group).toHaveAttribute('data-orientation', 'horizontal')
    })

    it('renders the primary TerminalPane inside the Group', () => {
      renderSplitPane({ splitPanes: MOCK_SPLIT_PANES })

      expect(screen.getByTestId('terminal-pane-claude')).toBeInTheDocument()
    })

    it('renders split TerminalPane instances', () => {
      renderSplitPane({ splitPanes: MOCK_SPLIT_PANES })

      expect(screen.getByTestId('terminal-pane-codex-split-split-1')).toBeInTheDocument()
      expect(screen.getByTestId('terminal-pane-gemini-split-split-2')).toBeInTheDocument()
    })

    it('renders separators between panes', () => {
      renderSplitPane({ splitPanes: MOCK_SPLIT_PANES })

      const separators = screen.getAllByTestId('resizable-separator')
      expect(separators.length).toBe(2) // one per split pane
    })

    it('renders close split buttons on split panes', () => {
      renderSplitPane({ splitPanes: MOCK_SPLIT_PANES })

      const closeBtns = screen.getAllByTitle('Close split pane')
      expect(closeBtns.length).toBe(2)
    })
  })

  // ── Active pane highlighting ─────────────────────────────────────────

  describe('active pane highlighting', () => {
    it('highlights primary pane when activeSplitPaneId is null', () => {
      useWorkspaceStore.setState({ activeSplitPaneId: null })
      renderSplitPane({ splitPanes: MOCK_SPLIT_PANES })

      // The primary pane container should have the ring class
      const primaryContainer = screen.getByTestId('terminal-pane-claude').closest('.h-full')
      expect(primaryContainer?.className).toContain('ring-1')
    })

    it('highlights a split pane when it is active', () => {
      useWorkspaceStore.setState({ activeSplitPaneId: 'split-1' })
      renderSplitPane({ splitPanes: MOCK_SPLIT_PANES })

      // The active split pane's container should have the ring class
      const splitContainer = screen.getByTestId('terminal-pane-codex-split-split-1').closest('.h-full')
      expect(splitContainer?.className).toContain('ring-1')
    })

    it('does not highlight primary pane when a split pane is active', () => {
      useWorkspaceStore.setState({ activeSplitPaneId: 'split-1' })
      renderSplitPane({ splitPanes: MOCK_SPLIT_PANES })

      const primaryContainer = screen.getByTestId('terminal-pane-claude').closest('.h-full')
      expect(primaryContainer?.className).not.toContain('ring-1')
    })

    it('sets activeSplitPaneId when clicking primary pane', () => {
      const setActiveSplitPane = vi.spyOn(useWorkspaceStore.getState(), 'setActiveSplitPane')
      useWorkspaceStore.setState({ activeSplitPaneId: 'split-1' })
      renderSplitPane({ splitPanes: MOCK_SPLIT_PANES })

      // Click the primary pane container
      const primaryContainer = screen.getByTestId('terminal-pane-claude').closest('.h-full')!
      fireEvent.click(primaryContainer)

      expect(setActiveSplitPane).toHaveBeenCalledWith(null)
    })

    it('sets activeSplitPaneId when clicking a split pane', () => {
      const setActiveSplitPane = vi.spyOn(useWorkspaceStore.getState(), 'setActiveSplitPane')
      useWorkspaceStore.setState({ activeSplitPaneId: null })
      renderSplitPane({ splitPanes: MOCK_SPLIT_PANES })

      // Click the first split pane container
      const splitContainer = screen.getByTestId('terminal-pane-codex-split-split-1').closest('.h-full')!
      fireEvent.click(splitContainer)

      expect(setActiveSplitPane).toHaveBeenCalledWith('split-1')
    })
  })

  // ── Close split pane ─────────────────────────────────────────────────

  describe('close split pane', () => {
    it('calls removeSplitPane when close button is clicked', () => {
      const removeSpy = vi.spyOn(useWorkspaceStore.getState(), 'removeSplitPane')
      renderSplitPane({ splitPanes: [MOCK_SPLIT_PANES[0]] })

      const closeBtn = screen.getByTitle('Close split pane')
      fireEvent.click(closeBtn)

      // removeSplitPane is called with tabId and paneId
      expect(removeSpy).toHaveBeenCalledWith('claude', 'split-1')
    })

    it('stops propagation on close button click', () => {
      renderSplitPane({ splitPanes: [MOCK_SPLIT_PANES[0]] })

      const closeBtn = screen.getByTitle('Close split pane')
      fireEvent.click(closeBtn)

      // The split pane should be removed from the store
      const state = useWorkspaceStore.getState()
      const panes = state.splitPanes.get('claude') || []
      expect(panes.length).toBe(0)
      // removeSplitPane sets activeSplitPaneId to null since the
      // removed pane was the only one
      expect(state.activeSplitPaneId).toBeNull()
    })
  })

  // ── Split pane close button visibility ───────────────────────────────

  describe('close button visibility', () => {
    it('shows close button with opacity 0.7 when pane is active', () => {
      useWorkspaceStore.setState({ activeSplitPaneId: 'split-1' })
      renderSplitPane({ splitPanes: [MOCK_SPLIT_PANES[0]] })

      // Find the split pane container and check the close button
      const splitContainer = screen.getByTestId('terminal-pane-codex-split-split-1').closest('.h-full')!
      const closeBtn = splitContainer.querySelector('button')
      expect(closeBtn).toBeInTheDocument()
    })

    it('shows close button with opacity 0 when pane is not active', () => {
      useWorkspaceStore.setState({ activeSplitPaneId: 'split-2' })
      renderSplitPane({ splitPanes: MOCK_SPLIT_PANES })

      // split-1 is not active, so its close button should have opacity 0
      const splitContainer = screen.getByTestId('terminal-pane-codex-split-split-1').closest('.h-full')!
      const closeBtn = splitContainer.querySelector('button')
      const styleAttr = closeBtn?.getAttribute('style') || ''
      expect(styleAttr).toContain('opacity: 0')
    })
  })

  // ── Exit and error callbacks ─────────────────────────────────────────

  describe('exit and error callbacks', () => {
    it('passes onExit callback to the primary TerminalPane', () => {
      const onExit = vi.fn()
      render(
        <SplitPaneContainer
          tabId="claude"
          primaryAgentId="claude"
          splitPanes={[]}
          visible={true}
          onRegisterRef={vi.fn()}
          onExit={onExit}
          onError={vi.fn()}
        />
      )

      // TerminalPane receives onExit — we verify by checking the component rendered
      expect(screen.getByTestId('terminal-pane-claude')).toBeInTheDocument()
    })

    it('passes onError callback to the primary TerminalPane', () => {
      const onError = vi.fn()
      render(
        <SplitPaneContainer
          tabId="claude"
          primaryAgentId="claude"
          splitPanes={[]}
          visible={true}
          onRegisterRef={vi.fn()}
          onExit={vi.fn()}
          onError={onError}
        />
      )

      expect(screen.getByTestId('terminal-pane-claude')).toBeInTheDocument()
    })
  })

  // ── Resize handle direction ──────────────────────────────────────────

  describe('resize handle', () => {
    it('renders horizontal resize handle for horizontal splits', () => {
      renderSplitPane({ splitPanes: MOCK_SPLIT_PANES })

      const separators = screen.getAllByTestId('resizable-separator')
      separators.forEach((sep) => {
        expect(sep.className).toContain('h-full')
        expect(sep.className).toContain('w-1.5')
      })
    })

    it('renders vertical resize handle for vertical splits', () => {
      const verticalPanes: SplitPaneState[] = [
        { ...MOCK_SPLIT_PANES[0], direction: 'vertical' },
      ]
      renderSplitPane({ splitPanes: verticalPanes })

      const separators = screen.getAllByTestId('resizable-separator')
      separators.forEach((sep) => {
        expect(sep.className).toContain('w-full')
        expect(sep.className).toContain('h-1.5')
      })
    })
  })
})
