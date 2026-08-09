import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { WorktreeCard } from '../../components/workspace/WorktreeManager'
import { useWorktreeStore, type WorktreeInfo } from '../../stores/worktreeStore'

// ── Mock Tauri invoke ──────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'
const mockInvoke = vi.mocked(invoke)

// ── Mock data ──────────────────────────────────────────────────────────────

const BASE_WORKTREE: WorktreeInfo = {
  id: 'wt-feature',
  branchName: 'feature/user-auth',
  worktreePath: '/tmp/repo/.mothership/worktrees/feature-user-auth',
  projectRoot: '/tmp/repo',
  status: 'active',
  agentId: null,
  createdAt: '2026-06-21T10:00:00Z',
  aheadBehind: null,
  hasUncommitted: false,
  commitsAhead: 0,
  commitsBehind: 0,
}

// ── Helpers ────────────────────────────────────────────────────────────────

function renderCard(overrides?: {
  editors?: { vsCode: boolean; cursor: boolean }
  worktree?: WorktreeInfo
  isExpanded?: boolean
  isActive?: boolean
  showDeleteConfirm?: boolean
  onOpenTerminal?: () => void
  onSync?: () => void
  onCommit?: (msg: string) => void
  onPush?: () => void
}) {
  const {
    editors = { vsCode: true, cursor: true },
    worktree = BASE_WORKTREE,
    isExpanded = false,
    isActive = false,
    showDeleteConfirm = false,
    onOpenTerminal = vi.fn(),
    onSync = vi.fn(),
    onCommit = vi.fn(),
    onPush = vi.fn(),
  } = overrides ?? {}

  return render(
    <WorktreeCard
      worktree={worktree}
      isActive={isActive}
      isExpanded={isExpanded}
      showDeleteConfirm={showDeleteConfirm}
      editors={editors}
      onToggleExpand={vi.fn()}
      onSelect={vi.fn()}
      onOpenTerminal={onOpenTerminal}
      onDelete={vi.fn()}
      onCancelDelete={vi.fn()}
      onConfirmDelete={vi.fn()}
      onSync={onSync}
      onCommit={onCommit}
      onPush={onPush}
    />
  )
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('WorktreeCard editor buttons', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useWorktreeStore.setState({
      worktrees: [],
      worktreePorts: new Map(),
    })
  })

  // ── Collapsed state: quick-action buttons (detected by title) ──────────

  describe('collapsed state (quick-action icons)', () => {
    it('shows VS Code button in quick-action row when vsCode detected', () => {
      renderCard({ editors: { vsCode: true, cursor: false } })

      expect(screen.getByTitle('Open in VS Code')).toBeInTheDocument()
    })

    it('shows Cursor button in quick-action row when cursor detected', () => {
      renderCard({ editors: { vsCode: false, cursor: true } })

      expect(screen.getByTitle('Open in Cursor')).toBeInTheDocument()
    })

    it('shows both editor quick-action buttons when both detected', () => {
      renderCard({ editors: { vsCode: true, cursor: true } })

      expect(screen.getByTitle('Open in VS Code')).toBeInTheDocument()
      expect(screen.getByTitle('Open in Cursor')).toBeInTheDocument()
    })

    it('hides VS Code quick-action button when not detected', () => {
      renderCard({ editors: { vsCode: false, cursor: true } })

      expect(screen.queryByTitle('Open in VS Code')).not.toBeInTheDocument()
    })

    it('hides Cursor quick-action button when not detected', () => {
      renderCard({ editors: { vsCode: true, cursor: false } })

      expect(screen.queryByTitle('Open in Cursor')).not.toBeInTheDocument()
    })

    it('hides both editor quick-action buttons when neither detected', () => {
      renderCard({ editors: { vsCode: false, cursor: false } })

      expect(screen.queryByTitle('Open in VS Code')).not.toBeInTheDocument()
      expect(screen.queryByTitle('Open in Cursor')).not.toBeInTheDocument()
    })
  })

  // ── Expanded state: ActionButton labels ────────────────────────────────

  describe('expanded state (action buttons)', () => {
    it('shows VS Code button in expanded content when vsCode detected', () => {
      renderCard({ editors: { vsCode: true, cursor: false }, isExpanded: true })

      expect(screen.getByText('VS Code')).toBeInTheDocument()
    })

    it('shows Cursor button in expanded content when cursor detected', () => {
      renderCard({ editors: { vsCode: false, cursor: true }, isExpanded: true })

      expect(screen.getByText('Cursor')).toBeInTheDocument()
    })

    it('shows both editor buttons in expanded content when both detected', () => {
      renderCard({ editors: { vsCode: true, cursor: true }, isExpanded: true })

      expect(screen.getByText('VS Code')).toBeInTheDocument()
      expect(screen.getByText('Cursor')).toBeInTheDocument()
    })

    it('hides VS Code button in expanded content when not detected', () => {
      renderCard({ editors: { vsCode: false, cursor: true }, isExpanded: true })

      expect(screen.queryByText('VS Code')).not.toBeInTheDocument()
    })

    it('hides Cursor button in expanded content when not detected', () => {
      renderCard({ editors: { vsCode: true, cursor: false }, isExpanded: true })

      expect(screen.queryByText('Cursor')).not.toBeInTheDocument()
    })

    it('hides both editor buttons in expanded content when neither detected', () => {
      renderCard({ editors: { vsCode: false, cursor: false }, isExpanded: true })

      expect(screen.queryByText('VS Code')).not.toBeInTheDocument()
      expect(screen.queryByText('Cursor')).not.toBeInTheDocument()
    })

    it('shows non-editor action buttons regardless of editor availability', () => {
      renderCard({ editors: { vsCode: false, cursor: false }, isExpanded: true })

      // Non-editor buttons should always be present
      expect(screen.getByText('Open Terminal')).toBeInTheDocument()
      expect(screen.getByText('Sync')).toBeInTheDocument()
      expect(screen.getByText('View Diff')).toBeInTheDocument()
      expect(screen.getByText('Commit')).toBeInTheDocument()
      expect(screen.getByText('Push')).toBeInTheDocument()
      expect(screen.getByText('Allocate Port')).toBeInTheDocument()
    })
  })

  // ── openInEditor behavior ──────────────────────────────────────────────

  describe('openInEditor interaction', () => {
    it('calls invoke with "code" when VS Code quick-action button is clicked', async () => {
      mockInvoke.mockResolvedValue(undefined)
      renderCard({ editors: { vsCode: true, cursor: false } })

      await act(async () => {
        fireEvent.click(screen.getByTitle('Open in VS Code'))
      })

      expect(mockInvoke).toHaveBeenCalledWith('open_in_editor', {
        path: BASE_WORKTREE.worktreePath,
        editor: 'code',
      })
    })

    it('calls invoke with "cursor" when Cursor quick-action button is clicked', async () => {
      mockInvoke.mockResolvedValue(undefined)
      renderCard({ editors: { vsCode: false, cursor: true } })

      await act(async () => {
        fireEvent.click(screen.getByTitle('Open in Cursor'))
      })

      expect(mockInvoke).toHaveBeenCalledWith('open_in_editor', {
        path: BASE_WORKTREE.worktreePath,
        editor: 'cursor',
      })
    })

    it('calls invoke with "code" when VS Code expanded button is clicked', async () => {
      mockInvoke.mockResolvedValue(undefined)
      renderCard({ editors: { vsCode: true, cursor: false }, isExpanded: true })

      await act(async () => {
        fireEvent.click(screen.getByText('VS Code'))
      })

      expect(mockInvoke).toHaveBeenCalledWith('open_in_editor', {
        path: BASE_WORKTREE.worktreePath,
        editor: 'code',
      })
    })

    it('calls invoke with "cursor" when Cursor expanded button is clicked', async () => {
      mockInvoke.mockResolvedValue(undefined)
      renderCard({ editors: { vsCode: false, cursor: true }, isExpanded: true })

      await act(async () => {
        fireEvent.click(screen.getByText('Cursor'))
      })

      expect(mockInvoke).toHaveBeenCalledWith('open_in_editor', {
        path: BASE_WORKTREE.worktreePath,
        editor: 'cursor',
      })
    })

    it('handles invoke failure gracefully', async () => {
      // Should not throw — the component catches and logs errors
      mockInvoke.mockRejectedValue(new Error('Editor not found'))
      renderCard({ editors: { vsCode: true, cursor: true } })

      await act(async () => {
        expect(() => {
          fireEvent.click(screen.getByTitle('Open in VS Code'))
        }).not.toThrow()
      })
    })
  })


})
