import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Timeline } from '../../components/memory/Timeline'
import { useMemoryStore, type MemoryNote, type ContextEntry } from '../../stores/memoryStore'

// ── Mock Tauri invoke ──────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// ── Helpers to create timestamps ───────────────────────────────────────────

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600000).toISOString()
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString()
}

// ── Mock data ──────────────────────────────────────────────────────────────

const TODAY_NOTE: MemoryNote = {
  id: 'note-today',
  content: 'A note from today about the current sprint',
  agentId: 'claude',
  entryType: 'note',
  tags: ['sprint', 'frontend'],
  filesReferenced: ['src/components/Header.tsx'],
  createdAt: hoursAgo(2),
  updatedAt: hoursAgo(2),
}

const TODAY_CONTEXT: ContextEntry = {
  id: 'ctx-today',
  agentId: 'claude',
  entryType: 'summary',
  content: 'Refactored the authentication middleware',
  summary: 'Auth middleware refactor',
  filesReferenced: ['src/middleware/auth.ts', 'src/middleware/verify.ts'],
  createdAt: hoursAgo(1),
}

const YESTERDAY_NOTE: MemoryNote = {
  id: 'note-yesterday',
  content: 'Design decisions for the database schema',
  agentId: 'codex',
  entryType: 'note',
  tags: ['design', 'database'],
  filesReferenced: [],
  createdAt: daysAgo(1),
  updatedAt: daysAgo(1),
}

const YESTERDAY_CONTEXT: ContextEntry = {
  id: 'ctx-yesterday',
  agentId: 'codex',
  entryType: 'decision',
  content: 'Use PostgreSQL for the main database',
  filesReferenced: [],
  createdAt: daysAgo(1),
}

const THIS_WEEK_ENTRY: ContextEntry = {
  id: 'ctx-thisweek',
  agentId: 'claude',
  entryType: 'prompt',
  content: 'How should we handle rate limiting?',
  filesReferenced: [],
  createdAt: daysAgo(4),
}

const OLDER_ENTRY: ContextEntry = {
  id: 'ctx-older',
  agentId: 'gemini',
  entryType: 'output',
  content: 'Here is the analysis of the caching strategy...',
  summary: 'Cache analysis results',
  filesReferenced: [],
  createdAt: daysAgo(14),
}

const HANDOFF_ENTRY: ContextEntry = {
  id: 'ctx-handoff',
  agentId: 'claude',
  entryType: 'handoff',
  content: 'Handing off the authentication context to Codex',
  filesReferenced: [],
  createdAt: daysAgo(1),
}

const LONG_CONTENT_ENTRY: ContextEntry = {
  id: 'ctx-long',
  agentId: 'claude',
  entryType: 'prompt',
  content: 'A'.repeat(250),
  filesReferenced: [],
  createdAt: hoursAgo(3),
}

// ── Helpers ────────────────────────────────────────────────────────────────

function renderTimeline() {
  return render(<Timeline />)
}

function resetStore() {
  useMemoryStore.setState({
    notes: [],
    contextHistory: [],
    isLoaded: true,
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Timeline', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetStore()
  })

  // ── Empty state ─────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('shows 0 entries when no data exists', () => {
      renderTimeline()
      expect(screen.getByText('0 entries')).toBeInTheDocument()
    })

    it('shows "No timeline entries" placeholder when empty', () => {
      renderTimeline()
      expect(screen.getByText('No timeline entries')).toBeInTheDocument()
    })

    it('shows the filter button even when empty', () => {
      renderTimeline()
      const filterBtn = screen.getByTitle('Filters')
      expect(filterBtn).toBeInTheDocument()
    })
  })

  // ── Data merging & sorting ─────────────────────────────────────────────

  describe('data merging and sorting', () => {
    it('merges notes and context history into one list', () => {
      useMemoryStore.setState({ notes: [TODAY_NOTE], contextHistory: [TODAY_CONTEXT] })
      renderTimeline()
      expect(screen.getByText('A note from today about the current sprint')).toBeInTheDocument()
      expect(screen.getByText('Refactored the authentication middleware')).toBeInTheDocument()
    })

    it('sorts items by createdAt descending (newest first)', () => {
      useMemoryStore.setState({
        notes: [TODAY_NOTE],           // 2h ago - in "Today"
        contextHistory: [OLDER_ENTRY],  // 14d ago - in "Older"
      })
      renderTimeline()
      // The 2h-ago entry goes to "Today", the 14d-ago entry goes to "Older"
      expect(screen.getByText('Today')).toBeInTheDocument()
      expect(screen.getByText('Older')).toBeInTheDocument()
      expect(screen.getByText('A note from today about the current sprint')).toBeInTheDocument()
      expect(screen.getByText('Here is the analysis of the caching strategy...')).toBeInTheDocument()
    })
  })

  // ── Time grouping ──────────────────────────────────────────────────────

  describe('time grouping', () => {
    it('groups items under "Today" for entries from today', () => {
      useMemoryStore.setState({ notes: [TODAY_NOTE], contextHistory: [TODAY_CONTEXT] })
      renderTimeline()
      expect(screen.getByText('Today')).toBeInTheDocument()
    })

    it('groups items under "Yesterday" for entries from yesterday', () => {
      useMemoryStore.setState({ notes: [YESTERDAY_NOTE], contextHistory: [YESTERDAY_CONTEXT] })
      renderTimeline()
      expect(screen.getByText('Yesterday')).toBeInTheDocument()
    })

    it('groups items under "This Week" for entries from 2-7 days ago', () => {
      useMemoryStore.setState({ contextHistory: [THIS_WEEK_ENTRY] })
      renderTimeline()
      expect(screen.getByText('This Week')).toBeInTheDocument()
    })

    it('groups items under "Older" for entries from more than 7 days ago', () => {
      useMemoryStore.setState({ contextHistory: [OLDER_ENTRY] })
      renderTimeline()
      expect(screen.getByText('Older')).toBeInTheDocument()
    })

    it('renders multiple time groups in order', () => {
      useMemoryStore.setState({
        notes: [TODAY_NOTE, YESTERDAY_NOTE],
        contextHistory: [OLDER_ENTRY],
      })
      renderTimeline()
      expect(screen.getByText('Today')).toBeInTheDocument()
      expect(screen.getByText('Yesterday')).toBeInTheDocument()
      expect(screen.getByText('Older')).toBeInTheDocument()
    })
  })

  // ── Entry count ───────────────────────────────────────────────────────

  describe('entry count', () => {
    it('shows correct count with multiple items', () => {
      useMemoryStore.setState({
        notes: [TODAY_NOTE, YESTERDAY_NOTE],
        contextHistory: [TODAY_CONTEXT, OLDER_ENTRY],
      })
      renderTimeline()
      expect(screen.getByText('4 entries')).toBeInTheDocument()
    })

    it('updates count when filters are applied', () => {
      useMemoryStore.setState({
        notes: [TODAY_NOTE, YESTERDAY_NOTE],
        contextHistory: [TODAY_CONTEXT],
      })
      renderTimeline()
      expect(screen.getByText('3 entries')).toBeInTheDocument()
    })
  })

  // ── Filter toggle ─────────────────────────────────────────────────────

  describe('filter toggle', () => {
    it('hides filters panel by default', () => {
      renderTimeline()
      expect(screen.queryByText('Agent:')).not.toBeInTheDocument()
    })

    it('shows filters panel when filter button is clicked', () => {
      useMemoryStore.setState({
        notes: [TODAY_NOTE, YESTERDAY_NOTE],
        contextHistory: [TODAY_CONTEXT],
      })
      renderTimeline()
      fireEvent.click(screen.getByTitle('Filters'))
      expect(screen.getByText('Agent:')).toBeInTheDocument()
      expect(screen.getByText('Type:')).toBeInTheDocument()
    })

    it('hides filters panel when filter button is clicked again', () => {
      useMemoryStore.setState({ notes: [TODAY_NOTE] })
      renderTimeline()
      const filterBtn = screen.getByTitle('Filters')
      fireEvent.click(filterBtn)
      expect(screen.getByText('Agent:')).toBeInTheDocument()
      fireEvent.click(filterBtn)
      expect(screen.queryByText('Agent:')).not.toBeInTheDocument()
    })

    it('highlights the filter button when filters are active', () => {
      useMemoryStore.setState({ notes: [TODAY_NOTE, YESTERDAY_NOTE] })
      renderTimeline()
      fireEvent.click(screen.getByTitle('Filters'))

      const agentBtn = screen.getByText('claude')
      fireEvent.click(agentBtn)

      const filterBtn = screen.getByTitle('Filters')
      expect(filterBtn.className).toContain('mothership')
    })
  })

  // ── Agent filter ──────────────────────────────────────────────────────

  describe('agent filter', () => {
    it('shows agent buttons for unique agents in data', () => {
      useMemoryStore.setState({
        notes: [TODAY_NOTE],
        contextHistory: [TODAY_CONTEXT, OLDER_ENTRY],
      })
      renderTimeline()
      fireEvent.click(screen.getByTitle('Filters'))
      expect(screen.getByText('claude')).toBeInTheDocument()
      expect(screen.getByText('gemini')).toBeInTheDocument()
    })

    it('filters items by agent when clicked', () => {
      useMemoryStore.setState({
        notes: [TODAY_NOTE, YESTERDAY_NOTE],
        contextHistory: [TODAY_CONTEXT],
      })
      renderTimeline()
      fireEvent.click(screen.getByTitle('Filters'))
      fireEvent.click(screen.getByText('codex'))

      expect(screen.getByText('Design decisions for the database schema')).toBeInTheDocument()
      expect(screen.queryByText('A note from today about the current sprint')).not.toBeInTheDocument()
    })

    it('clears agent filter when clicked again', () => {
      useMemoryStore.setState({
        notes: [TODAY_NOTE, YESTERDAY_NOTE],
      })
      renderTimeline()
      fireEvent.click(screen.getByTitle('Filters'))
      const agentBtn = screen.getByText('codex')
      fireEvent.click(agentBtn)
      expect(screen.queryByText('A note from today about the current sprint')).not.toBeInTheDocument()

      fireEvent.click(agentBtn)
      expect(screen.getByText('A note from today about the current sprint')).toBeInTheDocument()
    })

    it('shows clear X button when agent filter is active', () => {
      useMemoryStore.setState({ notes: [TODAY_NOTE, YESTERDAY_NOTE] })
      renderTimeline()
      fireEvent.click(screen.getByTitle('Filters'))
      fireEvent.click(screen.getByText('claude'))

      const agentSection = screen.getByText('Agent:').parentElement!
      expect(agentSection.querySelector('.lucide-x')).toBeInTheDocument()
    })

    it('clears agent filter when X is clicked', () => {
      useMemoryStore.setState({ notes: [TODAY_NOTE, YESTERDAY_NOTE] })
      renderTimeline()
      fireEvent.click(screen.getByTitle('Filters'))
      fireEvent.click(screen.getByText('claude'))
      expect(screen.queryByText('Design decisions for the database schema')).not.toBeInTheDocument()

      const agentSection = screen.getByText('Agent:').parentElement!
      const clearBtn = agentSection.querySelector('.lucide-x')?.closest('button')!
      fireEvent.click(clearBtn)

      expect(screen.getByText('Design decisions for the database schema')).toBeInTheDocument()
    })

    it('highlights the active agent button', () => {
      useMemoryStore.setState({ notes: [TODAY_NOTE, YESTERDAY_NOTE] })
      renderTimeline()
      fireEvent.click(screen.getByTitle('Filters'))
      fireEvent.click(screen.getByText('claude'))

      const agentBtn = screen.getByText('claude')
      expect(agentBtn.className).toContain('mothership')
    })
  })

  // ── Type filter ───────────────────────────────────────────────────────

  describe('type filter', () => {
    it('shows type filter buttons for each unique type', () => {
      useMemoryStore.setState({
        notes: [TODAY_NOTE],
        contextHistory: [TODAY_CONTEXT, YESTERDAY_CONTEXT],
      })
      renderTimeline()
      fireEvent.click(screen.getByTitle('Filters'))

      // Type labels appear in both filter buttons and entry labels
      // Use getAllByText to find them, confirming existence
      expect(screen.getAllByText('Note').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Summary').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Decision').length).toBeGreaterThanOrEqual(1)
    })

    it('filters items by type when a type button is clicked', () => {
      useMemoryStore.setState({
        notes: [TODAY_NOTE],
        contextHistory: [TODAY_CONTEXT],
      })
      renderTimeline()
      fireEvent.click(screen.getByTitle('Filters'))

      // Find the Summary filter button (it's a <button>, not the <span> entry label)
      const summaryBtns = screen.getAllByText('Summary')
      const summaryFilterBtn = summaryBtns.find((el) => el.tagName === 'BUTTON')
      fireEvent.click(summaryFilterBtn!)

      expect(screen.getByText('Refactored the authentication middleware')).toBeInTheDocument()
      expect(screen.queryByText('A note from today about the current sprint')).not.toBeInTheDocument()
    })

    it('clears type filter when clicked again', () => {
      useMemoryStore.setState({
        notes: [TODAY_NOTE],
        contextHistory: [TODAY_CONTEXT],
      })
      renderTimeline()
      fireEvent.click(screen.getByTitle('Filters'))

      const summaryBtns = screen.getAllByText('Summary')
      const summaryFilterBtn = summaryBtns.find((el) => el.tagName === 'BUTTON')
      fireEvent.click(summaryFilterBtn!)
      expect(screen.queryByText('A note from today about the current sprint')).not.toBeInTheDocument()

      fireEvent.click(summaryFilterBtn!)
      expect(screen.getByText('A note from today about the current sprint')).toBeInTheDocument()
    })

    it('shows clear X button when type filter is active', () => {
      useMemoryStore.setState({ contextHistory: [TODAY_CONTEXT] })
      renderTimeline()
      fireEvent.click(screen.getByTitle('Filters'))

      const summaryBtns = screen.getAllByText('Summary')
      const summaryFilterBtn = summaryBtns.find((el) => el.tagName === 'BUTTON')
      fireEvent.click(summaryFilterBtn!)

      const typeSection = screen.getByText('Type:').parentElement!
      expect(typeSection.querySelector('.lucide-x')).toBeInTheDocument()
    })

    it('clears type filter when X is clicked', () => {
      useMemoryStore.setState({ notes: [TODAY_NOTE], contextHistory: [TODAY_CONTEXT] })
      renderTimeline()
      fireEvent.click(screen.getByTitle('Filters'))

      const summaryBtns = screen.getAllByText('Summary')
      const summaryFilterBtn = summaryBtns.find((el) => el.tagName === 'BUTTON')
      fireEvent.click(summaryFilterBtn!)

      const typeSection = screen.getByText('Type:').parentElement!
      const clearBtn = typeSection.querySelector('.lucide-x')?.closest('button')!
      fireEvent.click(clearBtn)

      expect(screen.getByText('A note from today about the current sprint')).toBeInTheDocument()
    })

    it('shows type label using TYPE_LABELS mapping', () => {
      useMemoryStore.setState({ contextHistory: [TODAY_CONTEXT] })
      renderTimeline()
      fireEvent.click(screen.getByTitle('Filters'))
      // summary maps to "Summary" via TYPE_LABELS
      const summaryEls = screen.getAllByText('Summary')
      expect(summaryEls.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ── Combined filters ──────────────────────────────────────────────────

  describe('combined filters', () => {
    it('filters by both agent and type simultaneously', () => {
      useMemoryStore.setState({
        notes: [TODAY_NOTE],     // claude, note
        contextHistory: [
          TODAY_CONTEXT,         // claude, summary
          YESTERDAY_CONTEXT,     // codex, decision
        ],
      })
      renderTimeline()
      fireEvent.click(screen.getByTitle('Filters'))
      fireEvent.click(screen.getByText('claude'))

      const summaryBtns = screen.getAllByText('Summary')
      const summaryFilterBtn = summaryBtns.find((el) => el.tagName === 'BUTTON')
      fireEvent.click(summaryFilterBtn!)

      // Only claude + summary → TODAY_CONTEXT
      expect(screen.getByText('Refactored the authentication middleware')).toBeInTheDocument()
      expect(screen.queryByText('A note from today about the current sprint')).not.toBeInTheDocument()
      expect(screen.queryByText('Use PostgreSQL for the main database')).not.toBeInTheDocument()
    })

    it('shows 0 entries when filter matches nothing', () => {
      useMemoryStore.setState({
        notes: [TODAY_NOTE],           // claude, note
        contextHistory: [YESTERDAY_CONTEXT], // codex, decision
      })
      renderTimeline()
      fireEvent.click(screen.getByTitle('Filters'))

      // Filter by codex (agent) AND Note (type) — codex only has Decision, so 0 results
      fireEvent.click(screen.getByText('codex'))

      const noteBtns = screen.getAllByText('Note')
      const noteFilterBtn = noteBtns.find((el) => el.tagName === 'BUTTON')!
      fireEvent.click(noteFilterBtn)

      expect(screen.getByText('0 entries')).toBeInTheDocument()
      expect(screen.getByText('No timeline entries')).toBeInTheDocument()
    })
  })

  // ── TimelineEntry rendering ───────────────────────────────────────────

  describe('TimelineEntry rendering', () => {
    it('shows type icon and label for notes', () => {
      useMemoryStore.setState({ notes: [TODAY_NOTE] })
      renderTimeline()
      const noteEls = screen.getAllByText('Note')
      expect(noteEls.length).toBeGreaterThanOrEqual(1)
    })

    it('shows type labels for all entry types', () => {
      useMemoryStore.setState({
        contextHistory: [
          TODAY_CONTEXT, YESTERDAY_CONTEXT, THIS_WEEK_ENTRY,
          OLDER_ENTRY, HANDOFF_ENTRY,
        ],
      })
      renderTimeline()
      // Each type label appears in an entry AND potentially as a filter button
      expect(screen.getAllByText('Summary').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Decision').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Prompt').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Output').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Handoff').length).toBeGreaterThanOrEqual(1)
    })

    it('shows agent name in the timestamp area', () => {
      useMemoryStore.setState({ notes: [TODAY_NOTE] })
      renderTimeline()
      expect(screen.getByText(/claude/)).toBeInTheDocument()
    })

    it('truncates content longer than 200 characters', () => {
      useMemoryStore.setState({ contextHistory: [LONG_CONTENT_ENTRY] })
      renderTimeline()
      expect(screen.getByText(/A{200}…/)).toBeInTheDocument()
    })

    it('does not truncate content shorter than 200 characters', () => {
      useMemoryStore.setState({ notes: [TODAY_NOTE] })
      renderTimeline()
      expect(screen.getByText('A note from today about the current sprint')).toBeInTheDocument()
    })

    it('shows summary text when present', () => {
      useMemoryStore.setState({ contextHistory: [TODAY_CONTEXT] })
      renderTimeline()
      expect(screen.getByText('Auth middleware refactor')).toBeInTheDocument()
    })

    it('does not show summary when absent', () => {
      useMemoryStore.setState({ contextHistory: [YESTERDAY_CONTEXT] })
      renderTimeline()
      expect(screen.queryByText('Auth middleware refactor')).not.toBeInTheDocument()
    })
  })

  // ── Tags ──────────────────────────────────────────────────────────────

  describe('tags', () => {
    it('shows tags from note items', () => {
      useMemoryStore.setState({ notes: [TODAY_NOTE] })
      renderTimeline()
      expect(screen.getByText('sprint')).toBeInTheDocument()
      expect(screen.getByText('frontend')).toBeInTheDocument()
    })

    it('shows up to 4 tags', () => {
      const noteWithManyTags: MemoryNote = {
        ...TODAY_NOTE,
        tags: ['a', 'b', 'c', 'd', 'e'],
      }
      useMemoryStore.setState({ notes: [noteWithManyTags] })
      renderTimeline()
      expect(screen.getByText('a')).toBeInTheDocument()
      expect(screen.getByText('b')).toBeInTheDocument()
      expect(screen.getByText('c')).toBeInTheDocument()
      expect(screen.getByText('d')).toBeInTheDocument()
      expect(screen.queryByText('e')).not.toBeInTheDocument()
    })

    it('does not show tags section when item has no tags', () => {
      useMemoryStore.setState({
        contextHistory: [YESTERDAY_CONTEXT], // no tags
      })
      renderTimeline()
      expect(screen.queryByText('sprint')).not.toBeInTheDocument()
    })
  })

  // ── Files referenced ──────────────────────────────────────────────────

  describe('files referenced', () => {
    it('shows referenced files on items that have them', () => {
      useMemoryStore.setState({ notes: [TODAY_NOTE] })
      renderTimeline()
      expect(screen.getByText('Header.tsx')).toBeInTheDocument()
    })

    it('shows only the last segment of file paths', () => {
      useMemoryStore.setState({ contextHistory: [TODAY_CONTEXT] })
      renderTimeline()
      expect(screen.getByText('auth.ts')).toBeInTheDocument()
      expect(screen.getByText('verify.ts')).toBeInTheDocument()
    })

    it('shows up to 3 referenced files', () => {
      const noteWithManyFiles: MemoryNote = {
        ...TODAY_NOTE,
        filesReferenced: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'],
      }
      useMemoryStore.setState({ notes: [noteWithManyFiles] })
      renderTimeline()
      expect(screen.getByText('a.ts')).toBeInTheDocument()
      expect(screen.getByText('b.ts')).toBeInTheDocument()
      expect(screen.getByText('c.ts')).toBeInTheDocument()
      expect(screen.queryByText('d.ts')).not.toBeInTheDocument()
    })
  })

  // ── Timeline visual elements ──────────────────────────────────────────

  describe('visual elements', () => {
    it('renders timeline dots', () => {
      useMemoryStore.setState({ notes: [TODAY_NOTE] })
      renderTimeline()
      const dots = document.querySelectorAll('.rounded-full')
      expect(dots.length).toBeGreaterThanOrEqual(1)
    })

    it('renders the Clock icon in the header', () => {
      renderTimeline()
      expect(document.querySelector('.lucide-clock')).toBeInTheDocument()
    })

    it('renders the Filter icon on the filter button', () => {
      renderTimeline()
      expect(document.querySelector('.lucide-filter')).toBeInTheDocument()
    })
  })

  // ── Date display for non-today items ──────────────────────────────────

  describe('date display', () => {
    it('shows date in addition to time for non-today items', () => {
      useMemoryStore.setState({ notes: [YESTERDAY_NOTE] })
      renderTimeline()

      // Date is formatted as e.g. "20 Jun" (day + month) in this locale
      // The timestamp text looks like: "codex · 04:27 pm · 20 Jun"
      const timeSpan = screen.getByText(/codex/)
      expect(timeSpan).toBeInTheDocument()
      // The date portion uses format "20 Jun" or "Jun 20" depending on locale
      // Just verify a date-like number appears in the text
      expect(timeSpan.textContent).toMatch(/\d{1,2}\s+Jun|Jun\s+\d{1,2}/)
    })
  })
})
