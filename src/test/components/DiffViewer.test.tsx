import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DiffViewer } from '../../components/workspace/DiffViewer'
import { useWorktreeStore, type WorktreeInfo, type FileContentPair } from '../../stores/worktreeStore'

// ── Mock Tauri invoke ──────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// ── Mock shiki (syntax highlighter) ────────────────────────────────────────
// vi.mock factories are hoisted above imports, so define the mock inline.
// Tests can import and access the mock via dynamic import if needed.

vi.mock('shiki', () => ({
  codeToHtml: vi.fn().mockResolvedValue('<pre><code>highlighted code</code></pre>'),
}))

// ── Mock react-diff-viewer-continued ───────────────────────────────────────
// Complex component with many SVG dependencies — mock to focus on our logic.

vi.mock('react-diff-viewer-continued', () => ({
  default: ({
    oldValue,
    newValue,
    splitView,
    showDiffOnly,
    leftTitle,
    rightTitle,
    renderContent,
  }: {
    oldValue: string
    newValue: string
    splitView: boolean
    showDiffOnly: boolean
    leftTitle?: React.ReactNode
    rightTitle?: React.ReactNode
    renderContent?: (source: string) => React.ReactNode
  }) => {
    return (
      <div data-testid="react-diff-viewer">
        <div data-testid="diff-mode">{splitView ? 'split' : 'inline'}</div>
        <div data-testid="diff-show-only">{showDiffOnly ? 'changes-only' : 'all-lines'}</div>
        {leftTitle && <div data-testid="diff-left-title">{leftTitle}</div>}
        {rightTitle && <div data-testid="diff-right-title">{rightTitle}</div>}
        <div data-testid="diff-old-value">{oldValue}</div>
        <div data-testid="diff-new-value">{newValue}</div>
        {renderContent && (
          <div data-testid="diff-render-content">
            {renderContent('test content')}
          </div>
        )}
      </div>
    )
  },
}))

// ── Mock globals (run once at module level) ────────────────────────────────

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

globalThis.MutationObserver = class {
  constructor(_callback: MutationCallback) {}
  observe(_target: Node, _options?: MutationObserverInit) {}
  disconnect() {}
  takeRecords(): MutationRecord[] { return [] }
} as unknown as typeof MutationObserver

// ── Mock data ──────────────────────────────────────────────────────────────

const MOCK_WORKTREE: WorktreeInfo = {
  id: 'wt-feature-user-auth',
  branchName: 'feature/user-auth',
  worktreePath: '/tmp/repo/.mothership/worktrees/feature-user-auth',
  projectRoot: '/tmp/repo',
  status: 'active',
  agentId: 'claude',
  createdAt: '2026-06-21T10:00:00Z',
  aheadBehind: null,
  hasUncommitted: true,
  commitsAhead: 0,
  commitsBehind: 0,
}

const MOCK_FILE_DIFFS: FileContentPair[] = [
  {
    path: 'src/auth.ts',
    status: 'M',
    old_content: 'export function login() {\n  // TODO\n}\n',
    new_content: 'import { User } from "./types"\n\nexport function login() {\n  // TODO\n}\n',
    insertions: 3,
    deletions: 0,
    language: 'typescript',
  },
  {
    path: 'src/utils.ts',
    status: 'A',
    old_content: '',
    new_content: 'export function format() {\n  return true\n}\n',
    insertions: 4,
    deletions: 0,
    language: 'typescript',
  },
  {
    path: 'src/old-file.ts',
    status: 'D',
    old_content: 'export const OLD = true\n',
    new_content: '',
    insertions: 0,
    deletions: 1,
    language: 'typescript',
  },
]

const MOCK_EMPTY_DIFFS: FileContentPair[] = []

// ── Never-resolving promise for loading tests ──────────────────────────────

const NEVER_RESOLVE = new Promise<FileContentPair[]>(() => {})

// ── Helpers ────────────────────────────────────────────────────────────────

function renderDiffViewer(
  worktree: WorktreeInfo = MOCK_WORKTREE,
  onClose: () => void = vi.fn()
) {
  return render(<DiffViewer worktree={worktree} onClose={onClose} />)
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('DiffViewer', () => {
  beforeEach(() => {
    vi.restoreAllMocks()

    // Reset store state
    useWorktreeStore.setState({
      worktrees: [],
    })
  })

  // ── Loading state ───────────────────────────────────────────────────────

  describe('loading state', () => {
    it('shows loading spinner while fetching diffs', () => {
      vi.spyOn(useWorktreeStore.getState(), 'getWorktreeFileDiffs')
        .mockReturnValue(NEVER_RESOLVE as never)

      renderDiffViewer()

      expect(screen.getByText(/loading diffs/i)).toBeInTheDocument()
    })
  })

  // ── Error state ─────────────────────────────────────────────────────────

  describe('error state', () => {
    it('shows error message when diff fetch fails', async () => {
      const errorMessage = 'Git error'
      vi.spyOn(useWorktreeStore.getState(), 'getWorktreeFileDiffs')
        .mockRejectedValue(new Error(errorMessage))

      renderDiffViewer()

      await waitFor(() => {
        expect(screen.queryByText(/loading diffs/i)).not.toBeInTheDocument()
      })

      // String(new Error(msg)) returns "Error: <msg>" in the component
      expect(screen.getByText(/Git error/i)).toBeInTheDocument()
    })

    it('shows close button on error state', async () => {
      vi.spyOn(useWorktreeStore.getState(), 'getWorktreeFileDiffs')
        .mockRejectedValue(new Error('Error'))

      const onClose = vi.fn()
      renderDiffViewer(MOCK_WORKTREE, onClose)

      await waitFor(() => {
        expect(screen.queryByText(/loading diffs/i)).not.toBeInTheDocument()
      })

      // Click the Close link in the error state
      const closeBtn = screen.getByText('Close')
      fireEvent.click(closeBtn)
      expect(onClose).toHaveBeenCalledOnce()
    })
  })

  // ── Empty state ─────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('shows empty state when there are no changes', async () => {
      vi.spyOn(useWorktreeStore.getState(), 'getWorktreeFileDiffs')
        .mockResolvedValue(MOCK_EMPTY_DIFFS)

      renderDiffViewer()

      await waitFor(() => {
        expect(screen.queryByText(/loading diffs/i)).not.toBeInTheDocument()
      })

      expect(screen.getByText(/no changes to display/i)).toBeInTheDocument()
      expect(screen.getByText(/working tree is clean/i)).toBeInTheDocument()
    })
  })

  // ── Loaded state ────────────────────────────────────────────────────────

  describe('loaded state', () => {
    it('renders branch name in the header', async () => {
      vi.spyOn(useWorktreeStore.getState(), 'getWorktreeFileDiffs')
        .mockResolvedValue(MOCK_FILE_DIFFS)

      renderDiffViewer()

      await waitFor(() => {
        expect(screen.queryByText(/loading diffs/i)).not.toBeInTheDocument()
      })

      expect(screen.getByText('feature/user-auth')).toBeInTheDocument()
    })

    it('shows file count in the header', async () => {
      vi.spyOn(useWorktreeStore.getState(), 'getWorktreeFileDiffs')
        .mockResolvedValue(MOCK_FILE_DIFFS)

      renderDiffViewer()

      await waitFor(() => {
        expect(screen.queryByText(/loading diffs/i)).not.toBeInTheDocument()
      })

      // "3 files" appears in both header and footer
      const fileCounts = screen.getAllByText(/3 files/i)
      expect(fileCounts.length).toBeGreaterThanOrEqual(1)
    })

    it('renders file sidebar with changed files', async () => {
      vi.spyOn(useWorktreeStore.getState(), 'getWorktreeFileDiffs')
        .mockResolvedValue(MOCK_FILE_DIFFS)

      renderDiffViewer()

      await waitFor(() => {
        expect(screen.queryByText(/loading diffs/i)).not.toBeInTheDocument()
      })

      expect(screen.getByText('src/auth.ts')).toBeInTheDocument()
      expect(screen.getByText('src/utils.ts')).toBeInTheDocument()
      expect(screen.getByText('src/old-file.ts')).toBeInTheDocument()
      expect(screen.getByText('Changed Files')).toBeInTheDocument()
    })

    it('shows insertions/deletions in the sidebar', async () => {
      vi.spyOn(useWorktreeStore.getState(), 'getWorktreeFileDiffs')
        .mockResolvedValue(MOCK_FILE_DIFFS)

      renderDiffViewer()

      await waitFor(() => {
        expect(screen.queryByText(/loading diffs/i)).not.toBeInTheDocument()
      })

      // +3 for src/auth.ts — use getAllByText since it may also appear in header
      const plus3 = screen.getAllByText('+3')
      expect(plus3.length).toBeGreaterThanOrEqual(1)
    })

    it('shows status badges for each file (M, A, D)', async () => {
      vi.spyOn(useWorktreeStore.getState(), 'getWorktreeFileDiffs')
        .mockResolvedValue(MOCK_FILE_DIFFS)

      renderDiffViewer()

      await waitFor(() => {
        expect(screen.queryByText(/loading diffs/i)).not.toBeInTheDocument()
      })

      expect(screen.getByText('M')).toBeInTheDocument()
      expect(screen.getByText('A')).toBeInTheDocument()
      expect(screen.getByText('D')).toBeInTheDocument()
    })

    it('selects the first file by default', async () => {
      vi.spyOn(useWorktreeStore.getState(), 'getWorktreeFileDiffs')
        .mockResolvedValue(MOCK_FILE_DIFFS)

      renderDiffViewer()

      await waitFor(() => {
        expect(screen.queryByText(/loading diffs/i)).not.toBeInTheDocument()
      })

      // The ReactDiffViewer mock renders with the first file's data
      expect(screen.getByTestId('diff-old-value')).toBeInTheDocument()
    })

    it('switches displayed diff when clicking a different file', async () => {
      vi.spyOn(useWorktreeStore.getState(), 'getWorktreeFileDiffs')
        .mockResolvedValue(MOCK_FILE_DIFFS)

      renderDiffViewer()

      await waitFor(() => {
        expect(screen.queryByText(/loading diffs/i)).not.toBeInTheDocument()
      })

      // Click on the second file
      fireEvent.click(screen.getByText('src/utils.ts'))

      // old_value should be empty for added files
      const oldValue = screen.getByTestId('diff-old-value')
      expect(oldValue.textContent).toBe('')
    })

    it('shows footer with total insertions and deletions', async () => {
      vi.spyOn(useWorktreeStore.getState(), 'getWorktreeFileDiffs')
        .mockResolvedValue(MOCK_FILE_DIFFS)

      renderDiffViewer()

      await waitFor(() => {
        expect(screen.queryByText(/loading diffs/i)).not.toBeInTheDocument()
      })

      // Total: 3+4+0 = 7 insertions, 0+0+1 = 1 deletion
      expect(screen.getByText('7')).toBeInTheDocument()
      expect(screen.getByText('1')).toBeInTheDocument()
    })
  })

  // ── View toggles ────────────────────────────────────────────────────────

  describe('view toggles', () => {
    it('starts in split view by default', async () => {
      vi.spyOn(useWorktreeStore.getState(), 'getWorktreeFileDiffs')
        .mockResolvedValue(MOCK_FILE_DIFFS)

      renderDiffViewer()

      await waitFor(() => {
        expect(screen.queryByText(/loading diffs/i)).not.toBeInTheDocument()
      })

      expect(screen.getByTestId('diff-mode').textContent).toBe('split')
    })

    it('toggles to inline view', async () => {
      vi.spyOn(useWorktreeStore.getState(), 'getWorktreeFileDiffs')
        .mockResolvedValue(MOCK_FILE_DIFFS)

      renderDiffViewer()

      await waitFor(() => {
        expect(screen.queryByText(/loading diffs/i)).not.toBeInTheDocument()
      })

      fireEvent.click(screen.getByTitle('Switch to unified view'))
      expect(screen.getByTestId('diff-mode').textContent).toBe('inline')
    })

    it('toggles show-only-changes', async () => {
      vi.spyOn(useWorktreeStore.getState(), 'getWorktreeFileDiffs')
        .mockResolvedValue(MOCK_FILE_DIFFS)

      renderDiffViewer()

      await waitFor(() => {
        expect(screen.queryByText(/loading diffs/i)).not.toBeInTheDocument()
      })

      expect(screen.getByTestId('diff-show-only').textContent).toBe('changes-only')

      fireEvent.click(screen.getByTitle('Show all lines'))
      expect(screen.getByTestId('diff-show-only').textContent).toBe('all-lines')
    })
  })

  // ── Close functionality ─────────────────────────────────────────────────

  describe('close functionality', () => {
    it('calls onClose when close button is clicked', async () => {
      vi.spyOn(useWorktreeStore.getState(), 'getWorktreeFileDiffs')
        .mockResolvedValue(MOCK_FILE_DIFFS)

      const onClose = vi.fn()
      renderDiffViewer(MOCK_WORKTREE, onClose)

      await waitFor(() => {
        expect(screen.queryByText(/loading diffs/i)).not.toBeInTheDocument()
      })

      fireEvent.click(screen.getByTitle('Close diff viewer'))
      expect(onClose).toHaveBeenCalledOnce()
    })
  })

  // ── File sidebar interaction ────────────────────────────────────────────

  describe('file sidebar interaction', () => {
    it('shows different file details when selected file changes', async () => {
      vi.spyOn(useWorktreeStore.getState(), 'getWorktreeFileDiffs')
        .mockResolvedValue(MOCK_FILE_DIFFS)

      renderDiffViewer()

      await waitFor(() => {
        expect(screen.queryByText(/loading diffs/i)).not.toBeInTheDocument()
      })

      // Click the deleted file
      fireEvent.click(screen.getByText('src/old-file.ts'))

      // Old value should show the deleted file's content
      const oldValue = screen.getByTestId('diff-old-value')
      expect(oldValue.textContent).toContain('OLD')
    })
  })
})
