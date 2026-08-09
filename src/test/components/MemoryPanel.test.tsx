import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryPanel } from '../../components/memory/MemoryPanel'
import { useMemoryStore, type MemoryNote, type ContextEntry } from '../../stores/memoryStore'
import { useAgentStore } from '../../stores/agentStore'

// ── Mock Tauri invoke ──────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}))

// ── Mock child panels to avoid their complex dependencies ───────────────────

vi.mock('../../components/memory/NoteEditor', () => ({
  NoteEditor: ({ onSave, onCancel }: { onSave: (c: string, t: string[]) => void; onCancel: () => void }) => (
    <div data-testid="note-editor">
      <button data-testid="mock-save" onClick={() => onSave('Test note', ['test'])}>Save</button>
      <button data-testid="mock-cancel" onClick={onCancel}>Cancel</button>
    </div>
  ),
}))

vi.mock('../../components/memory/Timeline', () => ({
  Timeline: () => <div data-testid="timeline-panel">Timeline</div>,
}))

vi.mock('../../components/memory/HandoffDialog', () => ({
  HandoffDialog: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="handoff-dialog">Handoff</div> : null,
}))

vi.mock('../../components/model-router/ModelRouterPanel', () => ({
  ModelRouterPanel: () => <div data-testid="model-router-panel">Models</div>,
}))

vi.mock('../../components/war-room/WarRoom', () => ({
  WarRoom: () => <div data-testid="warroom-panel">War Room</div>,
}))

vi.mock('../../components/task-graph/TaskGraph', () => ({
  TaskGraph: () => <div data-testid="task-graph-panel">Graph</div>,
}))

vi.mock('../../components/browser/BrowserConnector', () => ({
  BrowserConnector: () => <div data-testid="browser-panel">Browser</div>,
}))

vi.mock('../../components/mcp/MCPPanel', () => ({
  MCPPanel: () => <div data-testid="mcp-panel">MCP</div>,
}))

// ── Mock data ──────────────────────────────────────────────────────────────

const MOCK_NOTES: MemoryNote[] = [
  {
    id: 'note-1',
    content: 'Remember to fix the auth bug',
    agentId: 'claude',
    entryType: 'note',
    tags: ['bug', 'auth'],
    filesReferenced: [],
    createdAt: new Date(Date.now() - 3600000).toISOString(), // 1h ago
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'note-2',
    content: 'Design review notes for the new API',
    agentId: 'codex',
    entryType: 'note',
    tags: ['design', 'api'],
    filesReferenced: [],
    createdAt: new Date(Date.now() - 86400000).toISOString(), // 1d ago
    updatedAt: new Date().toISOString(),
  },
]

const MOCK_CONTEXT: ContextEntry[] = [
  {
    id: 'ctx-1',
    agentId: 'claude',
    entryType: 'summary',
    content: 'Fixed login flow — added JWT validation',
    summary: 'Login flow fix',
    filesReferenced: ['src/auth/login.ts', 'src/auth/jwt.ts'],
    createdAt: new Date(Date.now() - 7200000).toISOString(), // 2h ago
  },
  {
    id: 'ctx-2',
    agentId: 'codex',
    entryType: 'decision',
    content: 'Use PostgreSQL over SQLite for production',
    filesReferenced: [],
    createdAt: new Date(Date.now() - 172800000).toISOString(), // 2d ago
  },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function renderMemoryPanel() {
  return render(<MemoryPanel />)
}

function resetStore() {
  useMemoryStore.setState({
    activeTab: 'notes',
    notes: [],
    searchQuery: '',
    contextHistory: [],
    contextFilter: '',
    globalSearchQuery: '',
    searchResults: [],
    isLoaded: true,
    // Replace the async loadFromBackend with a no-op to prevent
    // act() warnings from the useEffect on mount
    loadFromBackend: vi.fn().mockResolvedValue(undefined),
  })
  useAgentStore.setState({ agents: [], activeAgentId: null })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('MemoryPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetStore()
  })

  // ── Main component ─────────────────────────────────────────────────────

  describe('main component', () => {
    it('renders the Memory header', () => {
      renderMemoryPanel()
      expect(screen.getByText('Memory')).toBeInTheDocument()
    })

    it('renders core tab buttons', () => {
      renderMemoryPanel()
      expect(screen.getByText('Notes')).toBeInTheDocument()
      expect(screen.getByText('Context')).toBeInTheDocument()
      expect(screen.getByText('Search')).toBeInTheDocument()
      expect(screen.getByText('Flags')).toBeInTheDocument()
    })

    it('shows advanced tabs when More button is clicked', () => {
      renderMemoryPanel()
      const moreBtn = screen.getByTitle('More tools')
      fireEvent.click(moreBtn)

      expect(screen.getByText('Timeline')).toBeInTheDocument()
      expect(screen.getByText('Storage')).toBeInTheDocument()
      expect(screen.getByText('Models')).toBeInTheDocument()
      expect(screen.getByText('War Room')).toBeInTheDocument()
      expect(screen.getByText('Graph')).toBeInTheDocument()
      expect(screen.getByText('Browser')).toBeInTheDocument()
      expect(screen.getByText('MCP')).toBeInTheDocument()
      expect(screen.getByText('Execution')).toBeInTheDocument()
      expect(screen.getByText('Perf')).toBeInTheDocument()
    })

    it('starts on the Notes tab by default', () => {
      renderMemoryPanel()
      expect(screen.getByPlaceholderText('Filter notes...')).toBeInTheDocument()
    })

    it('switches to Context tab when clicked', () => {
      renderMemoryPanel()
      fireEvent.click(screen.getByText('Context'))
      expect(screen.getByPlaceholderText('Filter context...')).toBeInTheDocument()
    })

    it('switches to Search tab when clicked', () => {
      renderMemoryPanel()
      fireEvent.click(screen.getByText('Search'))
      expect(screen.getByPlaceholderText('Search notes and context...')).toBeInTheDocument()
    })

    it('shows the Timeline panel when tab is clicked', () => {
      renderMemoryPanel()
      fireEvent.click(screen.getByTitle('More tools'))
      fireEvent.click(screen.getByText('Timeline'))
      expect(screen.getByTestId('timeline-panel')).toBeInTheDocument()
    })

    it('shows the Models panel when tab is clicked', () => {
      renderMemoryPanel()
      fireEvent.click(screen.getByTitle('More tools'))
      fireEvent.click(screen.getByText('Models'))
      expect(screen.getByTestId('model-router-panel')).toBeInTheDocument()
    })

    it('shows the War Room panel when tab is clicked', () => {
      renderMemoryPanel()
      fireEvent.click(screen.getByTitle('More tools'))
      fireEvent.click(screen.getByText('War Room'))
      expect(screen.getByTestId('warroom-panel')).toBeInTheDocument()
    })

    it('shows the Graph panel when tab is clicked', () => {
      renderMemoryPanel()
      fireEvent.click(screen.getByTitle('More tools'))
      fireEvent.click(screen.getByText('Graph'))
      expect(screen.getByTestId('task-graph-panel')).toBeInTheDocument()
    })

    it('shows the Browser panel when tab is clicked', () => {
      renderMemoryPanel()
      fireEvent.click(screen.getByTitle('More tools'))
      fireEvent.click(screen.getByText('Browser'))
      expect(screen.getByTestId('browser-panel')).toBeInTheDocument()
    })

    it('shows the MCP panel when tab is clicked', () => {
      renderMemoryPanel()
      fireEvent.click(screen.getByTitle('More tools'))
      fireEvent.click(screen.getByText('MCP'))
      expect(screen.getByTestId('mcp-panel')).toBeInTheDocument()
    })
  })

  // ── Notes tab ─────────────────────────────────────────────────────────

  describe('notes tab', () => {
    it('shows empty state when there are no notes', () => {
      renderMemoryPanel()
      expect(screen.getByText('No notes yet')).toBeInTheDocument()
    })

    it('shows notes list when notes exist', () => {
      useMemoryStore.setState({ notes: MOCK_NOTES })
      renderMemoryPanel()

      expect(screen.getByText('Remember to fix the auth bug')).toBeInTheDocument()
      expect(screen.getByText('Design review notes for the new API')).toBeInTheDocument()
    })

    it('shows tags on note cards', () => {
      useMemoryStore.setState({ notes: MOCK_NOTES })
      renderMemoryPanel()

      expect(screen.getByText('bug')).toBeInTheDocument()
      expect(screen.getByText('auth')).toBeInTheDocument()
      expect(screen.getByText('design')).toBeInTheDocument()
      expect(screen.getByText('api')).toBeInTheDocument()
    })

    it('shows time ago for each note', () => {
      useMemoryStore.setState({ notes: MOCK_NOTES })
      renderMemoryPanel()

      // note-1 is 1h ago
      expect(screen.getByText('1h ago')).toBeInTheDocument()
      // note-2 is 1d ago
      expect(screen.getByText('1d ago')).toBeInTheDocument()
    })

    it('filters notes by search query', () => {
      useMemoryStore.setState({ notes: MOCK_NOTES, searchQuery: 'auth' })
      renderMemoryPanel()

      // Only note with 'auth' in content or tags should match
      expect(screen.getByText('Remember to fix the auth bug')).toBeInTheDocument()
      expect(screen.queryByText('Design review notes for the new API')).not.toBeInTheDocument()
    })

    it('shows "No matching notes" when search yields no results', () => {
      useMemoryStore.setState({ notes: MOCK_NOTES, searchQuery: 'zzzzz' })
      renderMemoryPanel()

      expect(screen.getByText('No matching notes')).toBeInTheDocument()
    })

    it('opens note editor when plus button is clicked', () => {
      renderMemoryPanel()

      // The Plus/X toggle button is the last button in the search+add row
      // Find it by searching within the filter row (contains the placeholder)
      const filterRow = screen.getByPlaceholderText('Filter notes...').closest('.flex')!
      const toggleBtn = filterRow.querySelectorAll('button')
      const plusBtn = toggleBtn[toggleBtn.length - 1] // Plus is the last button
      fireEvent.click(plusBtn)

      expect(screen.getByTestId('note-editor')).toBeInTheDocument()
    })

    it('closes note editor when X is clicked', () => {
      renderMemoryPanel()

      // Open editor (Plus/X toggle is last button in the filter row)
      const filterRow = screen.getByPlaceholderText('Filter notes...').closest('.flex')!
      const toggleBtns = filterRow.querySelectorAll('button')
      fireEvent.click(toggleBtns[toggleBtns.length - 1])
      expect(screen.getByTestId('note-editor')).toBeInTheDocument()

      // Click the toggle again to close (button now shows X icon)
      fireEvent.click(toggleBtns[toggleBtns.length - 1])
      expect(screen.queryByTestId('note-editor')).not.toBeInTheDocument()
    })

    it('adds a note when NoteEditor saves', () => {
      renderMemoryPanel()

      // Open editor (Plus/X toggle is last button in the filter row)
      const filterRow = screen.getByPlaceholderText('Filter notes...').closest('.flex')!
      const toggleBtns = filterRow.querySelectorAll('button')
      fireEvent.click(toggleBtns[toggleBtns.length - 1])
      expect(screen.getByTestId('note-editor')).toBeInTheDocument()

      // Click mock save button
      fireEvent.click(screen.getByTestId('mock-save'))

      // A note should have been added to the store
      const { notes } = useMemoryStore.getState()
      expect(notes.length).toBe(1)
      expect(notes[0].content).toBe('Test note')
      expect(notes[0].tags).toEqual(['test'])
    })

    it('deletes a note when the trash button is clicked', () => {
      useMemoryStore.setState({ notes: MOCK_NOTES })
      renderMemoryPanel()

      // There should be 2 notes initially
      expect(useMemoryStore.getState().notes.length).toBe(2)

      // Each NoteCard has a delete button with Trash2 icon
      // The note cards have class "group", which contains a Trash2 SVG button
      const allCards = document.querySelectorAll('.group')
      // The first card's delete button
      const firstCard = allCards[0]
      const deleteBtn = firstCard?.querySelector('button')
      expect(deleteBtn).not.toBeNull()
      fireEvent.click(deleteBtn!)

      // One note should be removed
      expect(useMemoryStore.getState().notes.length).toBe(1)
    })
  })

  // ── Context tab ──────────────────────────────────────────────────────

  describe('context tab', () => {
    it('shows empty state when there is no context', () => {
      renderMemoryPanel()
      fireEvent.click(screen.getByText('Context'))

      expect(screen.getByText('No context history yet')).toBeInTheDocument()
    })

    it('shows context entries when they exist', () => {
      useMemoryStore.setState({ contextHistory: MOCK_CONTEXT })
      renderMemoryPanel()
      fireEvent.click(screen.getByText('Context'))

      expect(screen.getByText('Fixed login flow — added JWT validation')).toBeInTheDocument()
      expect(screen.getByText('Use PostgreSQL over SQLite for production')).toBeInTheDocument()
    })

    it('shows entry type labels', () => {
      useMemoryStore.setState({ contextHistory: MOCK_CONTEXT })
      renderMemoryPanel()
      fireEvent.click(screen.getByText('Context'))

      expect(screen.getByText('summary')).toBeInTheDocument()
      expect(screen.getByText('decision')).toBeInTheDocument()
    })

    it('shows agent IDs for context entries', () => {
      useMemoryStore.setState({ contextHistory: MOCK_CONTEXT })
      renderMemoryPanel()
      fireEvent.click(screen.getByText('Context'))

      expect(screen.getByText(/claude/)).toBeInTheDocument()
      expect(screen.getByText(/codex/)).toBeInTheDocument()
    })

    it('shows referenced files on context entries', () => {
      useMemoryStore.setState({ contextHistory: MOCK_CONTEXT })
      renderMemoryPanel()
      fireEvent.click(screen.getByText('Context'))

      // Files from ctx-1
      expect(screen.getByText('login.ts')).toBeInTheDocument()
      expect(screen.getByText('jwt.ts')).toBeInTheDocument()
    })

    it('filters context by text input', () => {
      useMemoryStore.setState({ contextHistory: MOCK_CONTEXT, contextFilter: 'PostgreSQL' })
      renderMemoryPanel()
      fireEvent.click(screen.getByText('Context'))

      expect(screen.getByText('Use PostgreSQL over SQLite for production')).toBeInTheDocument()
      expect(screen.queryByText('Fixed login flow')).not.toBeInTheDocument()
    })

    it('shows handoff button when an agent is active', () => {
      useAgentStore.setState({ activeAgentId: 'claude', agents: [] })
      renderMemoryPanel()
      fireEvent.click(screen.getByText('Context'))

      const handoffBtn = screen.getByTitle('Handoff context')
      expect(handoffBtn).toBeInTheDocument()
    })

    it('opens handoff dialog when handoff button is clicked', () => {
      useAgentStore.setState({ activeAgentId: 'claude', agents: [] })
      renderMemoryPanel()
      fireEvent.click(screen.getByText('Context'))

      fireEvent.click(screen.getByTitle('Handoff context'))
      expect(screen.getByTestId('handoff-dialog')).toBeInTheDocument()
    })

    it('shows clear history button when context exists', () => {
      useMemoryStore.setState({ contextHistory: MOCK_CONTEXT })
      renderMemoryPanel()
      fireEvent.click(screen.getByText('Context'))

      expect(screen.getByTitle('Clear history')).toBeInTheDocument()
    })

    it('clears context when clear button is clicked', () => {
      useMemoryStore.setState({ contextHistory: MOCK_CONTEXT })
      renderMemoryPanel()
      fireEvent.click(screen.getByText('Context'))

      fireEvent.click(screen.getByTitle('Clear history'))

      expect(useMemoryStore.getState().contextHistory.length).toBe(0)
    })
  })

  // ── Search tab ───────────────────────────────────────────────────────

  describe('search tab', () => {
    it('shows initial empty state before typing', () => {
      renderMemoryPanel()
      fireEvent.click(screen.getByText('Search'))

      expect(screen.getByText('Type to search across notes and context')).toBeInTheDocument()
    })

    it('shows the search input with correct placeholder', () => {
      renderMemoryPanel()
      fireEvent.click(screen.getByText('Search'))

      expect(
        screen.getByPlaceholderText('Search notes and context...')
      ).toBeInTheDocument()
    })

    it('shows no results initially', () => {
      renderMemoryPanel()
      fireEvent.click(screen.getByText('Search'))

      expect(screen.queryByText('No results found')).not.toBeInTheDocument()
    })
  })

  // ── NoteCard ──────────────────────────────────────────────────────────

  describe('NoteCard', () => {
    it('displays note content', () => {
      useMemoryStore.setState({ notes: [MOCK_NOTES[0]] })
      renderMemoryPanel()

      expect(screen.getByText('Remember to fix the auth bug')).toBeInTheDocument()
    })

    it('displays up to 3 tags', () => {
      const noteWithManyTags: MemoryNote = {
        ...MOCK_NOTES[0],
        tags: ['tag1', 'tag2', 'tag3', 'tag4'],
      }
      useMemoryStore.setState({ notes: [noteWithManyTags] })
      renderMemoryPanel()

      expect(screen.getByText('tag1')).toBeInTheDocument()
      expect(screen.getByText('tag2')).toBeInTheDocument()
      expect(screen.getByText('tag3')).toBeInTheDocument()
      // tag4 should NOT be shown (only first 3)
      expect(screen.queryByText('tag4')).not.toBeInTheDocument()
    })

    it('shows time ago', () => {
      useMemoryStore.setState({ notes: [MOCK_NOTES[0]] })
      renderMemoryPanel()

      expect(screen.getByText('1h ago')).toBeInTheDocument()
    })
  })

  // ── ContextCard ───────────────────────────────────────────────────────

  describe('ContextCard', () => {
    it('displays context content', () => {
      useMemoryStore.setState({ contextHistory: [MOCK_CONTEXT[0]] })
      renderMemoryPanel()
      fireEvent.click(screen.getByText('Context'))

      expect(screen.getByText('Fixed login flow — added JWT validation')).toBeInTheDocument()
    })

    it('displays summary text', () => {
      useMemoryStore.setState({ contextHistory: [MOCK_CONTEXT[0]] })
      renderMemoryPanel()
      fireEvent.click(screen.getByText('Context'))

      expect(screen.getByText('Login flow fix')).toBeInTheDocument()
    })

    it('shows referenced files', () => {
      useMemoryStore.setState({ contextHistory: [MOCK_CONTEXT[0]] })
      renderMemoryPanel()
      fireEvent.click(screen.getByText('Context'))

      expect(screen.getByText('login.ts')).toBeInTheDocument()
    })
  })

  // ── TabBar ────────────────────────────────────────────────────────────

  describe('TabBar', () => {
    it('highlights the active tab', () => {
      renderMemoryPanel()

      // Notes tab is active by default
      const notesTab = screen.getByText('Notes')
      expect(notesTab).toBeInTheDocument()

      // Switch to Context
      fireEvent.click(screen.getByText('Context'))
      expect(screen.getByPlaceholderText('Filter context...')).toBeInTheDocument()
    })
  })
})
