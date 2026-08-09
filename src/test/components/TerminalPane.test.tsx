import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TerminalPane } from '../../components/terminal/TerminalPane'
import { useAgentStore } from '../../stores/agentStore'
import { useTerminal } from '../../hooks/useTerminal'

// ── jsdom polyfills ────────────────────────────────────────────────────────

Element.prototype.scrollIntoView = vi.fn()
URL.createObjectURL = vi.fn(() => 'blob:test')
URL.revokeObjectURL = vi.fn()

// ── Mock useTerminal hook ──────────────────────────────────────────────────

const mockTerminal = {
  containerRef: { current: document.createElement('div') },
  sessionId: null,
  sessionInfo: null,
  isConnected: true,
  isPaused: false,
  hasError: false,
  errorMessage: null,
  isSearchOpen: false,
  setIsSearchOpen: vi.fn(),
  showHistory: false,
  setShowHistory: vi.fn(),
  conversationMessages: [],
  messageCount: 0,
  jumpToMessage: vi.fn(),
  isAiMode: false,
  isAiGenerating: false,
  spawn: vi.fn(),
  reconnect: vi.fn(),
  write: vi.fn(),
  resize: vi.fn(),
  close: vi.fn(),
  searchNext: vi.fn(),
  searchPrevious: vi.fn(),
  clearSearch: vi.fn(),
  copySelection: vi.fn(),
  pasteFromClipboard: vi.fn(),
  clearConversation: vi.fn(),
  exportConversationAsMarkdown: vi.fn(),
  exportConversationAsJson: vi.fn(),
}

vi.mock('../../hooks/useTerminal', () => ({
  useTerminal: vi.fn(() => mockTerminal),
}))

// ── Mock ConversationHistory ────────────────────────────────────────────────

vi.mock('../../components/terminal/ConversationHistory', () => ({
  ConversationHistory: ({
    isOpen,
    onClose,
  }: {
    isOpen: boolean
    onClose: () => void
  }) =>
    isOpen ? <div data-testid="conversation-history"><button data-testid="mock-history-close" onClick={onClose}>Close</button></div> : null,
}))

// ── Mock Tauri invoke (needed by agentStore imports) ────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// ── Mock agent ─────────────────────────────────────────────────────────────

const MOCK_AGENTS = [
  {
    id: 'claude',
    name: 'Claude',
    provider: 'claude' as const,
    role: 'software-engineer' as const,
    status: 'idle' as const,
    description: 'Anthropic Claude',
    category: 'engineering' as const,
    model: 'claude-sonnet-4-20250514',
  },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function renderTerminal(overrides: { model?: string; visible?: boolean } = {}) {
  return render(
    <TerminalPane
      agentId="claude"
      workingDir="/home/test"
      visible={overrides.visible ?? true}
      model={overrides.model}
      onExit={vi.fn()}
      onError={vi.fn()}
    />
  )
}

function resetStores() {
  useAgentStore.setState({
    agents: MOCK_AGENTS,
    activeAgentId: null,
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('TerminalPane', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetStores()
    // Re-apply the mock defaults after restoreAllMocks clears it
    vi.mocked(useTerminal).mockReturnValue({
      ...mockTerminal,
      isConnected: true,
      isPaused: false,
      hasError: false,
      errorMessage: null,
      isSearchOpen: false,
      showHistory: false,
      isAiMode: false,
      isAiGenerating: false,
      messageCount: 0,
      conversationMessages: [],
    })
  })

  // ── PTY mode ──────────────────────────────────────────────────────────

  describe('PTY mode', () => {
    it('shows the agent ID and mothership label', () => {
      renderTerminal()
      expect(screen.getByText('claude@mothership ~')).toBeInTheDocument()
    })

    it('shows toolbar buttons: Copy, Paste, Search, Fit', () => {
      renderTerminal()

      expect(screen.getByTitle('Copy selection (Ctrl+Shift+C)')).toBeInTheDocument()
      expect(screen.getByTitle('Paste (Ctrl+Shift+V)')).toBeInTheDocument()
      expect(screen.getByTitle('Search (Ctrl+F)')).toBeInTheDocument()
      expect(screen.getByText('Fit')).toBeInTheDocument()
    })

    it('shows DISCONNECTED badge when not connected and no error', () => {
      vi.mocked(useTerminal).mockReturnValue({
        ...mockTerminal,
        isConnected: false,
        hasError: false,
      })
      renderTerminal()

      expect(screen.getByText('DISCONNECTED')).toBeInTheDocument()
    })

    it('does not show DISCONNECTED badge in AI mode', () => {
      vi.mocked(useTerminal).mockReturnValue({
        ...mockTerminal,
        isConnected: false,
        isAiMode: true,
      })
      renderTerminal()

      expect(screen.queryByText('DISCONNECTED')).not.toBeInTheDocument()
    })

    it('shows PAUSED badge when paused', () => {
      vi.mocked(useTerminal).mockReturnValue({
        ...mockTerminal,
        isPaused: true,
      })
      renderTerminal()

      expect(screen.getByText('PAUSED')).toBeInTheDocument()
    })

    it('does not render ConversationHistory in PTY mode', () => {
      renderTerminal()

      expect(screen.queryByTestId('conversation-history')).not.toBeInTheDocument()
    })

    it('does not show AI-specific buttons in PTY mode', () => {
      renderTerminal()

      expect(screen.queryByTitle('Conversation history')).not.toBeInTheDocument()
      expect(screen.queryByTitle('Export as Markdown (.md)')).not.toBeInTheDocument()
      expect(screen.queryByTitle('Export as JSON (.json)')).not.toBeInTheDocument()
      expect(screen.queryByTitle('Clear conversation (Ctrl+L)')).not.toBeInTheDocument()
    })
  })

  // ── AI mode ───────────────────────────────────────────────────────────

  describe('AI mode', () => {
    beforeEach(() => {
      vi.mocked(useTerminal).mockReturnValue({
        ...mockTerminal,
        isAiMode: true,
        isConnected: true,
        messageCount: 4,
        conversationMessages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello!' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'How do I write tests?' },
          { role: 'assistant', content: 'Here is how...' },
        ],
      })
    })

    it('shows the Bot icon and agent@model label', () => {
      renderTerminal({ model: 'llama3.2:3b' })

      expect(screen.getByText('claude@llama3.2:3b')).toBeInTheDocument()
    })

    it('falls back to agent model when no model prop is given', () => {
      renderTerminal()

      expect(screen.getByText('claude@claude-sonnet-4-20250514')).toBeInTheDocument()
    })

    it('shows Generating badge when AI is generating', () => {
      vi.mocked(useTerminal).mockReturnValue({
        ...mockTerminal,
        isAiMode: true,
        isAiGenerating: true,
      })
      renderTerminal({ model: 'test-model' })

      expect(screen.getByText('Generating')).toBeInTheDocument()
    })

    it('shows message count in the history button', () => {
      renderTerminal({ model: 'test-model' })

      const historyBtn = screen.getByTitle(/Conversation history/)
      expect(historyBtn).toBeInTheDocument()
      // Message count (non-system messages)
      expect(screen.getByText('4')).toBeInTheDocument()
    })

    it('shows export buttons (MD and JSON) in AI mode', () => {
      renderTerminal({ model: 'test-model' })

      expect(screen.getByTitle('Export as Markdown (.md)')).toBeInTheDocument()
      expect(screen.getByTitle('Export as JSON (.json)')).toBeInTheDocument()
    })

    it('shows clear conversation button in AI mode', () => {
      renderTerminal({ model: 'test-model' })

      expect(screen.getByTitle('Clear conversation (Ctrl+L)')).toBeInTheDocument()
    })

    it('renders ConversationHistory panel when showHistory is true', () => {
      vi.mocked(useTerminal).mockReturnValue({
        ...mockTerminal,
        isAiMode: true,
        showHistory: true,
      })
      renderTerminal({ model: 'test-model' })

      expect(screen.getByTestId('conversation-history')).toBeInTheDocument()
    })

    it('toggles conversation history when history button is clicked', () => {
      const setShowHistory = vi.fn()
      vi.mocked(useTerminal).mockReturnValue({
        ...mockTerminal,
        isAiMode: true,
        showHistory: false,
        setShowHistory,
      })
      renderTerminal({ model: 'test-model' })

      fireEvent.click(screen.getByTitle(/Conversation history/))

      expect(setShowHistory).toHaveBeenCalledWith(true)
    })

    it('closes history when onClose is triggered from ConversationHistory', () => {
      const setShowHistory = vi.fn()
      vi.mocked(useTerminal).mockReturnValue({
        ...mockTerminal,
        isAiMode: true,
        showHistory: true,
        setShowHistory,
      })
      renderTerminal({ model: 'test-model' })

      fireEvent.click(screen.getByTestId('mock-history-close'))

      expect(setShowHistory).toHaveBeenCalledWith(false)
    })

    it('highlights history button when history is open', () => {
      vi.mocked(useTerminal).mockReturnValue({
        ...mockTerminal,
        isAiMode: true,
        showHistory: true,
      })
      renderTerminal({ model: 'test-model' })

      const historyBtn = screen.getByTitle(/Conversation history/)
      expect(historyBtn.className).toContain('mothership-600/10')
    })
  })

  // ── Toolbar actions ─────────────────────────────────────────────────

  describe('toolbar actions', () => {
    it('calls copySelection when Copy button is clicked', () => {
      const copySelection = vi.fn()
      vi.mocked(useTerminal).mockReturnValue({
        ...mockTerminal,
        copySelection,
      })
      renderTerminal()

      fireEvent.click(screen.getByTitle('Copy selection (Ctrl+Shift+C)'))

      expect(copySelection).toHaveBeenCalledOnce()
    })

    it('calls pasteFromClipboard when Paste button is clicked', () => {
      const pasteFromClipboard = vi.fn()
      vi.mocked(useTerminal).mockReturnValue({
        ...mockTerminal,
        pasteFromClipboard,
      })
      renderTerminal()

      fireEvent.click(screen.getByTitle('Paste (Ctrl+Shift+V)'))

      expect(pasteFromClipboard).toHaveBeenCalledOnce()
    })

    it('toggles search when Search button is clicked', () => {
      const setIsSearchOpen = vi.fn()
      vi.mocked(useTerminal).mockReturnValue({
        ...mockTerminal,
        isSearchOpen: false,
        setIsSearchOpen,
      })
      renderTerminal()

      fireEvent.click(screen.getByTitle('Search (Ctrl+F)'))

      expect(setIsSearchOpen).toHaveBeenCalledWith(true)
    })

    it('highlights search button when search is open', () => {
      vi.mocked(useTerminal).mockReturnValue({
        ...mockTerminal,
        isSearchOpen: true,
      })
      renderTerminal()

      const searchBtn = screen.getByTitle('Search (Ctrl+F)')
      expect(searchBtn.className).toContain('mothership-600/10')
    })

    it('calls resize(120, 30) when Fit button is clicked', () => {
      const resize = vi.fn()
      vi.mocked(useTerminal).mockReturnValue({
        ...mockTerminal,
        resize,
      })
      renderTerminal()

      fireEvent.click(screen.getByText('Fit'))

      expect(resize).toHaveBeenCalledWith(120, 30)
    })

    it('calls exportConversationAsMarkdown when MD export is clicked', () => {
      const exportMarkdown = vi.fn()
      vi.mocked(useTerminal).mockReturnValue({
        ...mockTerminal,
        isAiMode: true,
        exportConversationAsMarkdown: exportMarkdown,
      })
      renderTerminal({ model: 'test-model' })

      fireEvent.click(screen.getByTitle('Export as Markdown (.md)'))

      expect(exportMarkdown).toHaveBeenCalledOnce()
    })

    it('calls exportConversationAsJson when JSON export is clicked', () => {
      const exportJson = vi.fn()
      vi.mocked(useTerminal).mockReturnValue({
        ...mockTerminal,
        isAiMode: true,
        exportConversationAsJson: exportJson,
      })
      renderTerminal({ model: 'test-model' })

      fireEvent.click(screen.getByTitle('Export as JSON (.json)'))

      expect(exportJson).toHaveBeenCalledOnce()
    })

    it('calls clearConversation when clear button is clicked', () => {
      const clearConversation = vi.fn()
      vi.mocked(useTerminal).mockReturnValue({
        ...mockTerminal,
        isAiMode: true,
        clearConversation,
      })
      renderTerminal({ model: 'test-model' })

      fireEvent.click(screen.getByTitle('Clear conversation (Ctrl+L)'))

      expect(clearConversation).toHaveBeenCalledOnce()
    })
  })

  // ── Search bar ───────────────────────────────────────────────────────

  describe('search bar', () => {
    beforeEach(() => {
      vi.mocked(useTerminal).mockReturnValue({
        ...mockTerminal,
        isSearchOpen: true,
        searchNext: vi.fn(),
        searchPrevious: vi.fn(),
        setIsSearchOpen: vi.fn(),
      })
    })

    it('shows search input when isSearchOpen is true', () => {
      renderTerminal()

      expect(screen.getByPlaceholderText('Search in terminal…')).toBeInTheDocument()
    })

    it('calls searchNext when typing in the search field', () => {
      const searchNext = vi.fn()
      vi.mocked(useTerminal).mockReturnValue({
        ...mockTerminal,
        isSearchOpen: true,
        searchNext,
        setIsSearchOpen: vi.fn(),
      })
      renderTerminal()

      const input = screen.getByPlaceholderText('Search in terminal…')
      fireEvent.change(input, { target: { value: 'error' } })

      expect(searchNext).toHaveBeenCalledWith('error')
    })

    it('calls searchNext on Enter key', () => {
      const searchNext = vi.fn()
      vi.mocked(useTerminal).mockReturnValue({
        ...mockTerminal,
        isSearchOpen: true,
        searchNext,
        setIsSearchOpen: vi.fn(),
      })
      renderTerminal()

      const input = screen.getByPlaceholderText('Search in terminal…')
      fireEvent.change(input, { target: { value: 'test' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(searchNext).toHaveBeenCalledWith('test')
    })

    it('calls searchPrevious on Shift+Enter', () => {
      const searchPrevious = vi.fn()
      vi.mocked(useTerminal).mockReturnValue({
        ...mockTerminal,
        isSearchOpen: true,
        searchPrevious,
        setIsSearchOpen: vi.fn(),
      })
      renderTerminal()

      const input = screen.getByPlaceholderText('Search in terminal…')
      fireEvent.change(input, { target: { value: 'test' } })
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })

      expect(searchPrevious).toHaveBeenCalledWith('test')
    })

    it('closes search on Escape key', () => {
      const setIsSearchOpen = vi.fn()
      vi.mocked(useTerminal).mockReturnValue({
        ...mockTerminal,
        isSearchOpen: true,
        setIsSearchOpen,
      })
      renderTerminal()

      const input = screen.getByPlaceholderText('Search in terminal…')
      fireEvent.keyDown(input, { key: 'Escape' })

      expect(setIsSearchOpen).toHaveBeenCalledWith(false)
    })

    it('shows navigation buttons (previous, next, close)', () => {
      renderTerminal()

      expect(screen.getByTitle('Previous match (Shift+Enter)')).toBeInTheDocument()
      expect(screen.getByTitle('Next match (Enter)')).toBeInTheDocument()
      expect(screen.getByTitle('Close search (Esc)')).toBeInTheDocument()
    })

    it('does not show search bar when isSearchOpen is false', () => {
      vi.mocked(useTerminal).mockReturnValue({
        ...mockTerminal,
        isSearchOpen: false,
      })
      renderTerminal()

      expect(screen.queryByPlaceholderText('Search in terminal…')).not.toBeInTheDocument()
    })
  })

  // ── Error overlay ────────────────────────────────────────────────────

  describe('error overlay', () => {
    it('shows error overlay when hasError is true', () => {
      vi.mocked(useTerminal).mockReturnValue({
        ...mockTerminal,
        hasError: true,
        errorMessage: 'Session terminated unexpectedly',
      })
      renderTerminal()

      expect(screen.getByText('Connection Lost')).toBeInTheDocument()
      expect(screen.getByText('Session terminated unexpectedly')).toBeInTheDocument()
    })

    it('shows default error message when none provided', () => {
      vi.mocked(useTerminal).mockReturnValue({
        ...mockTerminal,
        hasError: true,
        errorMessage: null,
      })
      renderTerminal()

      expect(screen.getByText('The terminal session has been disconnected.')).toBeInTheDocument()
    })

    it('calls reconnect when Reconnect button is clicked', () => {
      const reconnect = vi.fn()
      vi.mocked(useTerminal).mockReturnValue({
        ...mockTerminal,
        hasError: true,
        reconnect,
      })
      renderTerminal()

      fireEvent.click(screen.getByText('Reconnect'))

      expect(reconnect).toHaveBeenCalledOnce()
    })
  })

  // ── Visibility ───────────────────────────────────────────────────────

  describe('visibility', () => {
    it('renders with visible=false without crashing', () => {
      renderTerminal({ visible: false })
      // Just verify no crash — toolbar still shows
      expect(screen.getByTitle('Copy selection (Ctrl+Shift+C)')).toBeInTheDocument()
    })
  })
})
