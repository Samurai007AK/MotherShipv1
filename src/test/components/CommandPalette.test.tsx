import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CommandPalette } from '../../components/command-palette/CommandPalette'
import { useAgentStore, type Agent } from '../../stores/agentStore'
import { useMemoryStore, type MemoryNote, type ContextEntry } from '../../stores/memoryStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useFileStore, type FileEntry } from '../../stores/fileStore'

// ── jsdom polyfills ────────────────────────────────────────────────────────

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

// ── Mock Tauri invoke ──────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// ── Mock data ──────────────────────────────────────────────────────────────

const MOCK_AGENTS: Agent[] = [
  { id: 'se-1', name: 'Software Engineer', provider: 'claude', role: 'software-engineer', status: 'idle', description: 'Implements features, writes code, fixes bugs', category: 'engineering', model: 'claude-sonnet-4-20250514' },
  { id: 'se-2', name: 'Software Engineer #2', provider: 'codex', role: 'software-engineer', status: 'idle', description: 'Secondary engineer for parallel tasks', category: 'engineering', model: 'codex-mini' },
  { id: 'tl-1', name: 'Tech Lead', provider: 'claude', role: 'tech-lead', status: 'idle', description: 'Architecture review, code quality', category: 'engineering', model: 'claude-sonnet-4-20250514' },
]

const MOCK_NOTES: MemoryNote[] = [
  { id: 'note-1', content: 'Fix the authentication bug in login flow', agentId: 'claude', entryType: 'note', tags: ['bug', 'auth'], filesReferenced: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'note-2', content: 'Review database schema design', agentId: 'codex', entryType: 'note', tags: ['design', 'database'], filesReferenced: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
]

const MOCK_CONTEXT: ContextEntry[] = [
  { id: 'ctx-1', agentId: 'claude', entryType: 'summary', content: 'Refactored authentication middleware into separate service', filesReferenced: [], createdAt: new Date().toISOString() },
  { id: 'ctx-2', agentId: 'codex', entryType: 'decision', content: 'Use PostgreSQL for main database in production', filesReferenced: [], createdAt: new Date().toISOString() },
]

const MOCK_FILES: FileEntry[] = [
  { path: 'src/auth/login.ts', name: 'login.ts', ext: '.ts', isDir: false, size: 1024 },
  { path: 'src/auth/jwt.ts', name: 'jwt.ts', ext: '.ts', isDir: false, size: 2048 },
  { path: 'src/components', name: 'components', ext: '', isDir: true, size: 0 },
  { path: 'src/config.ts', name: 'config.ts', ext: '.ts', isDir: false, size: 512 },
]

// ── Store fixture helpers ─────────────────────────────────────────────────

function clearStores() {
  useAgentStore.setState({
    agents: [],
    activeAgentId: null,
    recentAgentIds: [],
  })
  useMemoryStore.setState({
    notes: [],
    contextHistory: [],
    activeTab: 'notes',
  })
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    splitPanes: new Map(),
    activeSplitPaneId: null,
  })
  useFileStore.setState({
    files: [],
    isLoading: false,
    lastFetch: Date.now(),
  })
}

function renderPalette(isOpen = true) {
  const onClose = vi.fn()
  const result = render(<CommandPalette isOpen={isOpen} onClose={onClose} />)
  return { onClose, ...result }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CommandPalette', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    clearStores()
  })

  // ── Null state ─────────────────────────────────────────────────────────

  describe('null state', () => {
    it('returns null when isOpen is false', () => {
      const { container } = renderPalette(false)
      expect(container.innerHTML).toBe('')
    })

    it('renders when isOpen is true', () => {
      renderPalette(true)
      expect(screen.getByPlaceholderText('Search agents, notes, files…')).toBeInTheDocument()
    })
  })

  // ── Empty state ────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('shows "No results found" when there are no results', () => {
      renderPalette(true)
      expect(screen.getByText('No results found')).toBeInTheDocument()
    })

    it('shows "Try a different search term" hint', () => {
      renderPalette(true)
      expect(screen.getByText('Try a different search term')).toBeInTheDocument()
    })
  })

  // ── Search input (always fresh render) ─────────────────────────────────

  describe('search input', () => {
    it('shows the Search icon', () => {
      useAgentStore.setState({ agents: MOCK_AGENTS })
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      expect(document.querySelector('.lucide-search')).toBeInTheDocument()
    })

    it('shows the ⌘K keyboard shortcut badge', () => {
      useAgentStore.setState({ agents: MOCK_AGENTS })
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      expect(screen.getByText('⌘')).toBeInTheDocument()
      expect(screen.getByText('K')).toBeInTheDocument()
    })

    it('renders the input element', () => {
      renderPalette(true)
      expect(screen.getByPlaceholderText('Search agents, notes, files…')).toBeInTheDocument()
    })

    it('updates query as user types', () => {
      useAgentStore.setState({ agents: MOCK_AGENTS })
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      const input = screen.getByPlaceholderText('Search agents, notes, files…')
      fireEvent.change(input, { target: { value: 'claude' } })
      expect(input).toHaveValue('claude')
    })
  })

  // ── Agents section ────────────────────────────────────────────────────

  describe('agents section', () => {
    it('shows the Agents section header', () => {
      useAgentStore.setState({ agents: MOCK_AGENTS })
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      expect(screen.getByText('Agents')).toBeInTheDocument()
    })

    it('lists all agents', () => {
      useAgentStore.setState({ agents: MOCK_AGENTS })
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      expect(screen.getByText('Software Engineer')).toBeInTheDocument()
      expect(screen.getByText('Software Engineer #2')).toBeInTheDocument()
      expect(screen.getByText('Tech Lead')).toBeInTheDocument()
    })

    it('shows agent model as subtitle', () => {
      useAgentStore.setState({ agents: MOCK_AGENTS })
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      expect(screen.getByText('claude-sonnet-4-20250514')).toBeInTheDocument()
    })

    it('shows "active" badge for the currently active agent', () => {
      useAgentStore.setState({ agents: MOCK_AGENTS, activeAgentId: 'se-1' })
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      expect(screen.getByText('active')).toBeInTheDocument()
    })

    it('shows Recent section with recent agents first', () => {
      useAgentStore.setState({ agents: MOCK_AGENTS, recentAgentIds: ['se-2'] })
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      expect(screen.getByText('Recent')).toBeInTheDocument()
    })
  })

  // ── Notes section ─────────────────────────────────────────────────────

  describe('notes section', () => {
    it('shows the Notes section header', () => {
      useMemoryStore.setState({ notes: MOCK_NOTES })
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      expect(screen.getByText('Notes')).toBeInTheDocument()
    })

    it('shows note content as title', () => {
      useMemoryStore.setState({ notes: MOCK_NOTES })
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      expect(screen.getByText('Fix the authentication bug in login flow')).toBeInTheDocument()
    })

    it('shows tags as subtitle', () => {
      useMemoryStore.setState({ notes: MOCK_NOTES })
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      expect(screen.getByText('bug, auth')).toBeInTheDocument()
    })

    it('shows "No tags" when note has no tags', () => {
      useMemoryStore.setState({ notes: [{ ...MOCK_NOTES[0], tags: [] }] })
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      expect(screen.getByText('No tags')).toBeInTheDocument()
    })
  })

  // ── Context section ──────────────────────────────────────────────────

  describe('context section', () => {
    it('shows the Context section header', () => {
      useMemoryStore.setState({ contextHistory: MOCK_CONTEXT })
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      expect(screen.getByText('Context')).toBeInTheDocument()
    })

    it('shows context content as title', () => {
      useMemoryStore.setState({ contextHistory: MOCK_CONTEXT })
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      expect(screen.getByText('Refactored authentication middleware into separate service')).toBeInTheDocument()
    })

    it('shows entry type and agent as subtitle', () => {
      useMemoryStore.setState({ contextHistory: MOCK_CONTEXT })
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      expect(screen.getByText('summary · claude')).toBeInTheDocument()
    })
  })

  // ── Files section ────────────────────────────────────────────────────

  describe('files section', () => {
    it('shows the Files section header', () => {
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      expect(screen.getByText('Files')).toBeInTheDocument()
    })

    it('shows file name as title', () => {
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      expect(screen.getByText('login.ts')).toBeInTheDocument()
    })

    it('shows file path as subtitle', () => {
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      expect(screen.getByText('src/auth/login.ts')).toBeInTheDocument()
    })

    it('shows FileText icon for regular files', () => {
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      const fileIcons = document.querySelectorAll('.lucide-file-text')
      expect(fileIcons.length).toBeGreaterThanOrEqual(1)
    })

    it('does not show directories in file results', () => {
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      expect(screen.queryByText('components')).not.toBeInTheDocument()
    })
  })

  // ── Footer ────────────────────────────────────────────────────────────

  describe('footer', () => {
    it('shows navigation hints (↑↓ navigate, ↵ select, esc close)', () => {
      useAgentStore.setState({ agents: MOCK_AGENTS })
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      expect(screen.getByText('navigate')).toBeInTheDocument()
      expect(screen.getByText('select')).toBeInTheDocument()
      expect(screen.getByText('close')).toBeInTheDocument()
    })

    it('shows result count', () => {
      useAgentStore.setState({ agents: MOCK_AGENTS })
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      expect(screen.getByText('6 results')).toBeInTheDocument()
    })

    it('shows "1 result" for singular', () => {
      useAgentStore.setState({ agents: [MOCK_AGENTS[0]] })
      useFileStore.setState({ files: [] })
      renderPalette(true)
      expect(screen.getByText('1 result')).toBeInTheDocument()
    })
  })

  // ── Backdrop ──────────────────────────────────────────────────────────

  describe('backdrop', () => {
    it('closes when backdrop is clicked', () => {
      const { onClose } = renderPalette(true)
      // Backdrop has classes: absolute inset-0 bg-c-bg/80 backdrop-blur-sm
      const backdrop = document.querySelector('.absolute.inset-0.bg-c-bg\\/80')
      expect(backdrop).not.toBeNull()
      fireEvent.click(backdrop!)
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  // ── Search filtering ──────────────────────────────────────────────────

  describe('search filtering', () => {
    it('filters agents by name', () => {
      useAgentStore.setState({ agents: MOCK_AGENTS })
      useMemoryStore.setState({ notes: MOCK_NOTES, contextHistory: MOCK_CONTEXT })
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      const input = screen.getByPlaceholderText('Search agents, notes, files…')
      fireEvent.change(input, { target: { value: 'software' } })
      expect(screen.getByText('Software Engineer')).toBeInTheDocument()
      expect(screen.queryByText('Tech Lead')).not.toBeInTheDocument()
    })

    it('filters notes by content', () => {
      useAgentStore.setState({ agents: MOCK_AGENTS })
      useMemoryStore.setState({ notes: MOCK_NOTES, contextHistory: MOCK_CONTEXT })
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      const input = screen.getByPlaceholderText('Search agents, notes, files…')
      fireEvent.change(input, { target: { value: 'authentication' } })
      expect(screen.getByText('Fix the authentication bug in login flow')).toBeInTheDocument()
      expect(screen.queryByText('Review database schema design')).not.toBeInTheDocument()
    })

    it('filters context by content', () => {
      useAgentStore.setState({ agents: MOCK_AGENTS })
      useMemoryStore.setState({ notes: MOCK_NOTES, contextHistory: MOCK_CONTEXT })
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      const input = screen.getByPlaceholderText('Search agents, notes, files…')
      fireEvent.change(input, { target: { value: 'PostgreSQL' } })
      expect(screen.getByText('Use PostgreSQL for main database in production')).toBeInTheDocument()
      expect(screen.queryByText('Refactored authentication middleware')).not.toBeInTheDocument()
    })

    it('filters files by name', () => {
      useAgentStore.setState({ agents: MOCK_AGENTS })
      useMemoryStore.setState({ notes: MOCK_NOTES, contextHistory: MOCK_CONTEXT })
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      const input = screen.getByPlaceholderText('Search agents, notes, files…')
      fireEvent.change(input, { target: { value: 'login' } })
      expect(screen.getByText('login.ts')).toBeInTheDocument()
      expect(screen.queryByText('config.ts')).not.toBeInTheDocument()
    })

    it('resets selected index when query changes', () => {
      useAgentStore.setState({ agents: MOCK_AGENTS })
      useMemoryStore.setState({ notes: MOCK_NOTES, contextHistory: MOCK_CONTEXT })
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      const input = screen.getByPlaceholderText('Search agents, notes, files…')
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.change(input, { target: { value: 'tech lead' } })
      expect(screen.getByText('Tech Lead')).toBeInTheDocument()
    })

    it('shows empty state instead of section headers when search yields no matches', () => {
      renderPalette(true)
      const input = screen.getByPlaceholderText('Search agents, notes, files…')
      fireEvent.change(input, { target: { value: 'zzzzz' } })
      // Empty state replaces section headers when there are no matches
      expect(screen.getByText('No results found')).toBeInTheDocument()
      expect(screen.queryByText('Agents')).not.toBeInTheDocument()
    })
  })

  // ── Keyboard navigation ──────────────────────────────────────────────

  describe('keyboard navigation', () => {
    it('moves selection down on ArrowDown', () => {
      useAgentStore.setState({ agents: MOCK_AGENTS })
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      const input = screen.getByPlaceholderText('Search agents, notes, files…')
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      const items = document.querySelectorAll('[class*=\"w-full flex items-center gap-3 px-3 py-2\"]')
      expect(items.length).toBeGreaterThan(0)
    })

    it('moves selection up on ArrowUp', () => {
      useAgentStore.setState({ agents: MOCK_AGENTS })
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      const input = screen.getByPlaceholderText('Search agents, notes, files…')
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.keyDown(input, { key: 'ArrowUp' })
    })

    it('closes on Escape', () => {
      useAgentStore.setState({ agents: MOCK_AGENTS })
      useFileStore.setState({ files: MOCK_FILES })
      const { onClose } = renderPalette(true)
      const input = screen.getByPlaceholderText('Search agents, notes, files…')
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('selects the current item on Enter', () => {
      useAgentStore.setState({ agents: MOCK_AGENTS })
      useFileStore.setState({ files: MOCK_FILES })
      const { onClose } = renderPalette(true)
      const input = screen.getByPlaceholderText('Search agents, notes, files…')
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onClose).toHaveBeenCalledTimes(1)
      expect(useAgentStore.getState().activeAgentId).toBe('se-1')
    })

    it('does nothing on Enter when there are no results', () => {
      const { onClose } = renderPalette(true)
      const input = screen.getByPlaceholderText('Search agents, notes, files…')
      fireEvent.change(input, { target: { value: 'zzzzzz' } })
      expect(screen.getByText('No results found')).toBeInTheDocument()
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  // ── Mouse interaction ────────────────────────────────────────────────

  describe('mouse interaction', () => {
    it('selects an agent when clicked', () => {
      useAgentStore.setState({ agents: MOCK_AGENTS })
      useFileStore.setState({ files: MOCK_FILES })
      const { onClose } = renderPalette(true)
      fireEvent.click(screen.getByText('Software Engineer #2'))
      expect(useAgentStore.getState().activeAgentId).toBe('se-2')
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('selects a note when clicked', () => {
      useMemoryStore.setState({ notes: MOCK_NOTES })
      useFileStore.setState({ files: MOCK_FILES })
      const { onClose } = renderPalette(true)
      fireEvent.click(screen.getByText('Fix the authentication bug in login flow'))
      expect(useMemoryStore.getState().activeTab).toBe('notes')
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('selects a context entry when clicked', () => {
      useMemoryStore.setState({ contextHistory: MOCK_CONTEXT })
      useFileStore.setState({ files: MOCK_FILES })
      const { onClose } = renderPalette(true)
      fireEvent.click(screen.getByText('Refactored authentication middleware into separate service'))
      expect(useMemoryStore.getState().activeTab).toBe('context')
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('selects a file when clicked', () => {
      useFileStore.setState({ files: MOCK_FILES })
      const { onClose } = renderPalette(true)
      fireEvent.click(screen.getByText('login.ts'))
      expect(useWorkspaceStore.getState().tabs.length).toBe(1)
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  // ── Result count update ──────────────────────────────────────────────

  describe('result count', () => {
    it('updates count when search filters results', () => {
      useAgentStore.setState({ agents: MOCK_AGENTS })
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      expect(screen.getByText('6 results')).toBeInTheDocument()
      const input = screen.getByPlaceholderText('Search agents, notes, files…')
      fireEvent.change(input, { target: { value: 'tech lead' } })
      expect(screen.getByText('1 result')).toBeInTheDocument()
    })
  })

  // ── Active agent highlight ───────────────────────────────────────────

  describe('active agent highlight', () => {
    it('shows active badge for current agent', () => {
      useAgentStore.setState({ agents: MOCK_AGENTS, activeAgentId: 'se-2' })
      useFileStore.setState({ files: MOCK_FILES })
      renderPalette(true)
      expect(screen.getByText('active')).toBeInTheDocument()
    })
  })
})
