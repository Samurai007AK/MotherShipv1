import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { ColdStoragePanel } from '../../components/memory/ColdStoragePanel'
import { useMemoryStore, type ArchivedSessionInfo } from '../../stores/memoryStore'

// ── Mock Tauri invoke ──────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}))

// ── Mock data ──────────────────────────────────────────────────────────────

const MOCK_SESSIONS: ArchivedSessionInfo[] = [
  {
    session_id: 'session-001',
    agent_id: 'claude',
    file_path: '/appdata/mothership/cold/claude/session-001.json',
    size_bytes: 4096,
  },
  {
    session_id: 'session-002',
    agent_id: 'codex',
    file_path: '/appdata/mothership/cold/codex/session-002.json',
    size_bytes: 1024 * 1024, // 1 MB
  },
  {
    session_id: 'session-003',
    agent_id: 'gemini',
    file_path: '/appdata/mothership/cold/gemini/session-003.json',
    size_bytes: 150, // 150 B
  },
]

// ── Helpers ────────────────────────────────────────────────────────────────

async function renderColdStoragePanel() {
  const view = render(<ColdStoragePanel />)
  // Wait for the mount useEffect to settle (it awaits loadArchivedSessions)
  // This ensures all async state updates are flushed within act()
  await waitFor(() => {
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })
  return view
}

function resetStore() {
  useMemoryStore.setState({
    archivedSessions: [],
    // Provide no-op implementations for cold storage actions
    loadArchivedSessions: vi.fn().mockResolvedValue(undefined),
    archiveOldSessions: vi.fn().mockResolvedValue(0),
    pruneOldSnapshots: vi.fn().mockResolvedValue(0),
    restoreArchivedSession: vi.fn().mockResolvedValue(0),
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ColdStoragePanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetStore()
  })

  // ── Main component ─────────────────────────────────────────────────────

  describe('main component', () => {
    it('renders the Cold Storage header', async () => {
      await renderColdStoragePanel()
      expect(screen.getByText('Cold Storage')).toBeInTheDocument()
    })

    it('renders the description text', async () => {
      await renderColdStoragePanel()
      expect(screen.getByText(/Manage archived memory entries/)).toBeInTheDocument()
    })

    it('renders archive and prune sections', async () => {
      await renderColdStoragePanel()
      expect(screen.getByText('Archive Old Sessions')).toBeInTheDocument()
      expect(screen.getByText('Prune Old Snapshots')).toBeInTheDocument()
    })

    it('renders archive preset buttons', async () => {
      await renderColdStoragePanel()
      expect(screen.getByText('24 hours')).toBeInTheDocument()
      expect(screen.getByText('48 hours')).toBeInTheDocument()
      expect(screen.getByText('72 hours')).toBeInTheDocument()
      expect(screen.getByText('1 week')).toBeInTheDocument()
      expect(screen.getByText('2 weeks')).toBeInTheDocument()
    })

    it('renders prune preset buttons', async () => {
      await renderColdStoragePanel()
      expect(screen.getByText('7 days, keep 10')).toBeInTheDocument()
      expect(screen.getByText('14 days, keep 20')).toBeInTheDocument()
      expect(screen.getByText('30 days, keep 50')).toBeInTheDocument()
      expect(screen.getByText('60 days, keep 100')).toBeInTheDocument()
    })

    it('renders Custom... button for both sections', async () => {
      await renderColdStoragePanel()
      const customButtons = screen.getAllByText('Custom...')
      expect(customButtons.length).toBe(2)
    })
  })

  // ── Stats ──────────────────────────────────────────────────────────────

  describe('stats', () => {
    it('shows 0 archived and 0 total when no sessions exist', async () => {
      await renderColdStoragePanel()
      await waitFor(() => {
        expect(screen.getByText('0 archived')).toBeInTheDocument()
        expect(screen.getByText('0 B total')).toBeInTheDocument()
      })
    })

    it('shows correct count and total size with sessions', async () => {
      useMemoryStore.setState({ archivedSessions: MOCK_SESSIONS })
      await renderColdStoragePanel()

      await waitFor(() => {
        expect(screen.getByText('3 archived')).toBeInTheDocument()
        // 4096 + 1048576 + 150 = 1052822 bytes ≈ 1.0 MB
        expect(screen.getByText('1.0 MB total')).toBeInTheDocument()
      })
    })
  })

  // ── Archived sessions list ─────────────────────────────────────────────

  describe('archived sessions list', () => {
    it('shows empty state when no sessions exist', async () => {
      await renderColdStoragePanel()
      await waitFor(() => {
        expect(screen.getByText('No archived sessions')).toBeInTheDocument()
        expect(screen.getByText(/Archive old sessions above/)).toBeInTheDocument()
      })
    })

    it('shows archive section heading', async () => {
      await renderColdStoragePanel()
      expect(screen.getByText('Archived Sessions')).toBeInTheDocument()
    })

    it('shows session agent IDs when sessions exist', async () => {
      useMemoryStore.setState({ archivedSessions: MOCK_SESSIONS })
      await renderColdStoragePanel()

      await waitFor(() => {
        expect(screen.getByText('claude')).toBeInTheDocument()
        expect(screen.getByText('codex')).toBeInTheDocument()
        expect(screen.getByText('gemini')).toBeInTheDocument()
      })
    })

    it('shows formatted file sizes', async () => {
      useMemoryStore.setState({ archivedSessions: MOCK_SESSIONS })
      await renderColdStoragePanel()

      await waitFor(() => {
        // claude: 4096 B → 4.0 KB, codex: 1048576 → 1.0 MB, gemini: 150 → 150 B
        expect(screen.getByText('4.0 KB')).toBeInTheDocument()
        expect(screen.getByText('1.0 MB')).toBeInTheDocument()
        expect(screen.getByText('150 B')).toBeInTheDocument()
      })
    })

    it('expands a session row to show details on click', async () => {
      useMemoryStore.setState({ archivedSessions: [MOCK_SESSIONS[0]] })
      await renderColdStoragePanel()

      // Wait for loading to complete, then click session row
      await waitFor(() => {
        expect(screen.getByText('claude')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('claude'))

      // Expanded details should be visible
      await waitFor(() => {
        expect(screen.getByText(/Session: session-001/)).toBeInTheDocument()
        expect(screen.getByText(/appdata.*claude.*session-001/)).toBeInTheDocument()
        expect(screen.getByText(/Size: 4.0 KB/)).toBeInTheDocument()
        expect(screen.getByText('Restore')).toBeInTheDocument()
      })
    })

    it('collapses a session row when clicked again', async () => {
      useMemoryStore.setState({ archivedSessions: [MOCK_SESSIONS[0]] })
      await renderColdStoragePanel()

      // Wait for loading, click to expand
      await waitFor(() => {
        expect(screen.getByText('claude')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('claude'))
      await waitFor(() => {
        expect(screen.getByText('Restore')).toBeInTheDocument()
      })

      // Click again to collapse
      fireEvent.click(screen.getByText('claude'))
      await waitFor(() => {
        expect(screen.queryByText('Restore')).not.toBeInTheDocument()
      })
    })

    it('shows refresh button', async () => {
      await renderColdStoragePanel()
      const refreshBtn = screen.getByTitle('Refresh')
      expect(refreshBtn).toBeInTheDocument()
    })

    it('calls loadArchivedSessions on refresh click', async () => {
      const loadArchivedSessions = vi.fn().mockResolvedValue(undefined)
      useMemoryStore.setState({ archivedSessions: MOCK_SESSIONS, loadArchivedSessions })
      await renderColdStoragePanel()

      await waitFor(() => expect(screen.getByTitle('Refresh')).toBeInTheDocument())
      // Reset call count to ignore the mount call, then click
      loadArchivedSessions.mockClear()
      fireEvent.click(screen.getByTitle('Refresh'))
      expect(loadArchivedSessions).toHaveBeenCalledOnce()
    })
  })

  // ── Archive actions ───────────────────────────────────────────────────

  describe('archive actions', () => {
    it('calls archiveOldSessions with 24h when "24 hours" preset is clicked', async () => {
      const archiveOldSessions = vi.fn().mockResolvedValue(3)
      useMemoryStore.setState({ archiveOldSessions })
      await renderColdStoragePanel()

      await act(async () => {
        fireEvent.click(screen.getByText('24 hours'))
      })
      expect(archiveOldSessions).toHaveBeenCalledWith(24)
    })

    it('calls archiveOldSessions with 168h when "1 week" is clicked', async () => {
      const archiveOldSessions = vi.fn().mockResolvedValue(3)
      useMemoryStore.setState({ archiveOldSessions })
      await renderColdStoragePanel()

      await act(async () => {
        fireEvent.click(screen.getByText('1 week'))
      })
      expect(archiveOldSessions).toHaveBeenCalledWith(168)
    })

    it('shows success toast with count when archive returns > 0', async () => {
      const archiveOldSessions = vi.fn().mockResolvedValue(3)
      useMemoryStore.setState({ archiveOldSessions })
      await renderColdStoragePanel()

      fireEvent.click(screen.getByText('24 hours'))

      await waitFor(() => {
        expect(screen.getByText('Archived 3 sessions')).toBeInTheDocument()
      })
    })

    it('shows success toast "No sessions to archive" when count is 0', async () => {
      const archiveOldSessions = vi.fn().mockResolvedValue(0)
      useMemoryStore.setState({ archiveOldSessions })
      await renderColdStoragePanel()

      fireEvent.click(screen.getByText('24 hours'))

      await waitFor(() => {
        expect(screen.getByText('No sessions to archive')).toBeInTheDocument()
      })
    })

    it('disables archive buttons while archiving', async () => {
      const archiveOldSessions = vi.fn().mockReturnValue(new Promise(() => {}))
      useMemoryStore.setState({ archiveOldSessions })
      await renderColdStoragePanel()

      fireEvent.click(screen.getByText('24 hours'))

      await waitFor(() => {
        expect(screen.getByText('24 hours')).toBeDisabled()
      })
    })
  })

  // ── Custom archive input ──────────────────────────────────────────────

  describe('custom archive input', () => {
    it('shows custom input when Custom... is clicked', async () => {
      await renderColdStoragePanel()
      fireEvent.click(screen.getAllByText('Custom...')[0])

      expect(screen.getByPlaceholderText('Age in hours')).toBeInTheDocument()
    })

    it('calls archiveOldSessions with custom hours', async () => {
      const archiveOldSessions = vi.fn().mockResolvedValue(1)
      useMemoryStore.setState({ archiveOldSessions })
      await renderColdStoragePanel()

      // Open custom archive input
      fireEvent.click(screen.getAllByText('Custom...')[0])
      const input = screen.getByPlaceholderText('Age in hours')
      fireEvent.change(input, { target: { value: '12' } })

      await act(async () => {
        fireEvent.click(screen.getByText('Go'))
      })

      expect(archiveOldSessions).toHaveBeenCalledWith(12)
    })
  })

  // ── Prune actions ─────────────────────────────────────────────────────

  describe('prune actions', () => {
    it('calls pruneOldSnapshots with 7 and 10 when "7 days, keep 10" is clicked', async () => {
      const pruneOldSnapshots = vi.fn().mockResolvedValue(5)
      useMemoryStore.setState({ pruneOldSnapshots })
      await renderColdStoragePanel()

      await act(async () => {
        fireEvent.click(screen.getByText('7 days, keep 10'))
      })
      expect(pruneOldSnapshots).toHaveBeenCalledWith(7, 10)
    })

    it('calls pruneOldSnapshots with 30 and 50 when "30 days, keep 50" is clicked', async () => {
      const pruneOldSnapshots = vi.fn().mockResolvedValue(5)
      useMemoryStore.setState({ pruneOldSnapshots })
      await renderColdStoragePanel()

      await act(async () => {
        fireEvent.click(screen.getByText('30 days, keep 50'))
      })
      expect(pruneOldSnapshots).toHaveBeenCalledWith(30, 50)
    })

    it('shows success toast when prune returns > 0', async () => {
      const pruneOldSnapshots = vi.fn().mockResolvedValue(10)
      useMemoryStore.setState({ pruneOldSnapshots })
      await renderColdStoragePanel()

      fireEvent.click(screen.getByText('7 days, keep 10'))

      await waitFor(() => {
        expect(screen.getByText('Pruned 10 old snapshots')).toBeInTheDocument()
      })
    })

    it('shows success toast when prune returns 0', async () => {
      const pruneOldSnapshots = vi.fn().mockResolvedValue(0)
      useMemoryStore.setState({ pruneOldSnapshots })
      await renderColdStoragePanel()

      fireEvent.click(screen.getByText('7 days, keep 10'))

      await waitFor(() => {
        expect(screen.getByText('No snapshots to prune')).toBeInTheDocument()
      })
    })

    it('disables prune buttons while pruning', async () => {
      const pruneOldSnapshots = vi.fn().mockReturnValue(new Promise(() => {}))
      useMemoryStore.setState({ pruneOldSnapshots })
      await renderColdStoragePanel()

      fireEvent.click(screen.getByText('7 days, keep 10'))

      await waitFor(() => {
        expect(screen.getByText('7 days, keep 10')).toBeDisabled()
      })
    })
  })

  // ── Custom prune input ────────────────────────────────────────────────

  describe('custom prune input', () => {
    it('shows custom prune inputs when Custom... is clicked', async () => {
      await renderColdStoragePanel()
      // Second Custom... button is for prune section
      fireEvent.click(screen.getAllByText('Custom...')[1])

      expect(screen.getByPlaceholderText('Max age (days)')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('Min keep')).toBeInTheDocument()
    })

    it('calls pruneOldSnapshots with custom values', async () => {
      const pruneOldSnapshots = vi.fn().mockResolvedValue(3)
      useMemoryStore.setState({ pruneOldSnapshots })
      await renderColdStoragePanel()

      // Open custom prune input (second Custom... button is in prune section)
      fireEvent.click(screen.getAllByText('Custom...')[1])
      await waitFor(() => expect(screen.getByPlaceholderText('Max age (days)')).toBeInTheDocument())
      fireEvent.change(screen.getByPlaceholderText('Max age (days)'), { target: { value: '45' } })
      fireEvent.change(screen.getByPlaceholderText('Min keep'), { target: { value: '15' } })

      // Only the prune Go button is visible since archive custom is closed
      fireEvent.click(screen.getByText('Go'))

      await waitFor(() => {
        expect(pruneOldSnapshots).toHaveBeenCalledWith(45, 15)
      })
    })
  })

  // ── Restore actions ───────────────────────────────────────────────────

  describe('restore actions', () => {
    it('shows Restore button when session is expanded', async () => {
      useMemoryStore.setState({ archivedSessions: [MOCK_SESSIONS[0]] })
      await renderColdStoragePanel()

      await waitFor(() => expect(screen.getByText('claude')).toBeInTheDocument())
      fireEvent.click(screen.getByText('claude'))
      await waitFor(() => {
        expect(screen.getByText('Restore')).toBeInTheDocument()
      })
    })

    it('calls restoreArchivedSession when Restore is clicked', async () => {
      const restoreArchivedSession = vi.fn().mockResolvedValue(5)
      useMemoryStore.setState({ archivedSessions: [MOCK_SESSIONS[0]], restoreArchivedSession })
      await renderColdStoragePanel()

      await waitFor(() => expect(screen.getByText('claude')).toBeInTheDocument())
      fireEvent.click(screen.getByText('claude'))
      await waitFor(() => expect(screen.getByText('Restore')).toBeInTheDocument())
      fireEvent.click(screen.getByText('Restore'))

      await waitFor(() => {
        expect(restoreArchivedSession).toHaveBeenCalledWith('claude', 'session-001')
      })
    })

    it('shows success toast with count when restore returns > 0', async () => {
      const restoreArchivedSession = vi.fn().mockResolvedValue(5)
      useMemoryStore.setState({ archivedSessions: [MOCK_SESSIONS[0]], restoreArchivedSession })
      await renderColdStoragePanel()

      await waitFor(() => expect(screen.getByText('claude')).toBeInTheDocument())
      fireEvent.click(screen.getByText('claude'))
      await waitFor(() => expect(screen.getByText('Restore')).toBeInTheDocument())
      fireEvent.click(screen.getByText('Restore'))

      await waitFor(() => {
        expect(screen.getByText('Restored 5 entries')).toBeInTheDocument()
      })
    })

    it('shows error toast when restore returns 0', async () => {
      const restoreArchivedSession = vi.fn().mockResolvedValue(0)
      useMemoryStore.setState({ archivedSessions: [MOCK_SESSIONS[0]], restoreArchivedSession })
      await renderColdStoragePanel()

      await waitFor(() => expect(screen.getByText('claude')).toBeInTheDocument())
      fireEvent.click(screen.getByText('claude'))
      await waitFor(() => expect(screen.getByText('Restore')).toBeInTheDocument())
      fireEvent.click(screen.getByText('Restore'))

      await waitFor(() => {
        expect(screen.getByText('Nothing to restore')).toBeInTheDocument()
      })
    })

    it('shows Restoring... text while restoring', async () => {
      const restoreArchivedSession = vi.fn().mockReturnValue(new Promise(() => {}))
      useMemoryStore.setState({ archivedSessions: [MOCK_SESSIONS[0]], restoreArchivedSession })
      await renderColdStoragePanel()

      await waitFor(() => expect(screen.getByText('claude')).toBeInTheDocument())
      fireEvent.click(screen.getByText('claude'))
      await waitFor(() => expect(screen.getByText('Restore')).toBeInTheDocument())
      fireEvent.click(screen.getByText('Restore'))

      await waitFor(() => {
        expect(screen.getByText('Restoring...')).toBeInTheDocument()
      })
    })
  })

  // ── Result toast ──────────────────────────────────────────────────────

  describe('result toast', () => {
    it('shows success styling for success messages', async () => {
      const archiveOldSessions = vi.fn().mockResolvedValue(3)
      useMemoryStore.setState({ archiveOldSessions })
      await renderColdStoragePanel()

      fireEvent.click(screen.getByText('24 hours'))

      await waitFor(() => {
        const toast = screen.getByText('Archived 3 sessions')
        expect(toast.className).toContain('text-green-400')
      })
    })

    it('shows error styling for error messages', async () => {
      const restoreArchivedSession = vi.fn().mockResolvedValue(0)
      useMemoryStore.setState({ archivedSessions: [MOCK_SESSIONS[0]], restoreArchivedSession })
      await renderColdStoragePanel()

      await waitFor(() => expect(screen.getByText('claude')).toBeInTheDocument())
      fireEvent.click(screen.getByText('claude'))
      await waitFor(() => expect(screen.getByText('Restore')).toBeInTheDocument())
      fireEvent.click(screen.getByText('Restore'))

      await waitFor(() => {
        const toast = screen.getByText('Nothing to restore')
        expect(toast.className).toContain('text-red-400')
      })
    })
  })

  // ── Loading state ─────────────────────────────────────────────────────

  describe('loading state', () => {
    it('shows Loading... while loading archive list', async () => {
      const loadArchivedSessions = vi.fn().mockReturnValue(new Promise(() => {}))
      useMemoryStore.setState({ loadArchivedSessions })
      // Render directly (not via async helper) to avoid waitFor timeout
      render(<ColdStoragePanel />)

      await waitFor(() => {
        expect(screen.getByText('Loading...')).toBeInTheDocument()
      })
    })
  })

  // ── formatBytes ───────────────────────────────────────────────────────

  describe('formatBytes', () => {
    it('displays bytes for small sizes', async () => {
      useMemoryStore.setState({ archivedSessions: [MOCK_SESSIONS[2]] })
      await renderColdStoragePanel()

      await waitFor(() => {
        expect(screen.getByText('150 B')).toBeInTheDocument()
      })
    })

    it('displays KB for medium sizes', async () => {
      useMemoryStore.setState({ archivedSessions: [MOCK_SESSIONS[0]] })
      await renderColdStoragePanel()

      await waitFor(() => {
        expect(screen.getByText('4.0 KB')).toBeInTheDocument()
      })
    })

    it('displays MB for large sizes', async () => {
      useMemoryStore.setState({ archivedSessions: [MOCK_SESSIONS[1]] })
      await renderColdStoragePanel()

      await waitFor(() => {
        expect(screen.getByText('1.0 MB')).toBeInTheDocument()
      })
    })
  })
})
