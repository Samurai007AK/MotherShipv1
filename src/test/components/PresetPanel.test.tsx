import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PresetPanel } from '../../components/workspace/PresetPanel'
import { useWorktreeStore, type WorkspacePresetConfig, type WorktreeInfo } from '../../stores/worktreeStore'

// ── Mock the Tauri invoke ──────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// ── Mock data ──────────────────────────────────────────────────────────────

const MOCK_CONFIG: WorkspacePresetConfig = {
  setup: ['echo "global pre"'],
  teardown: ['echo "global post"'],
  presets: [
    {
      name: 'Node.js API',
      description: 'API workspace with Node.js',
      base_branch: 'develop',
      setup: ['npm install', 'cp .env.example .env'],
      teardown: ['docker compose down'],
      run: ['npm run dev'],
      env: { PORT: '3000', NODE_ENV: 'development' },
      agent_id: 'codex',
    },
    {
      name: 'Rust CLI',
      description: 'CLI workspace with Rust',
      base_branch: 'main',
      setup: ['cargo build'],
      teardown: [],
      run: ['cargo run'],
      env: { RUST_LOG: 'debug' },
      agent_id: 'claude',
    },
  ],
}

const MOCK_EMPTY_CONFIG: WorkspacePresetConfig = {
  setup: [],
  teardown: [],
  presets: [],
}

const MOCK_WORKTREES: WorktreeInfo[] = [
  {
    id: 'wt-1',
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
  },
]

// ── Never-resolving promise for loading-state tests ──────────────────────

const NEVER_RESOLVE = new Promise<WorkspacePresetConfig>(() => {})

// ── Helpers ────────────────────────────────────────────────────────────────

function renderPresetPanel(props: { projectPath?: string; worktrees?: WorktreeInfo[]; onClose?: () => void } = {}) {
  return render(
    <PresetPanel
      projectPath={props.projectPath || '/tmp/repo'}
      worktrees={props.worktrees || []}
      onClose={props.onClose}
    />
  )
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('PresetPanel', () => {
  beforeEach(() => {
    // Clear any lingering spies from previous tests
    vi.restoreAllMocks()

    // Reset store to clean state
    useWorktreeStore.setState({
      presetConfig: { setup: [], teardown: [], presets: [] },
    })
  })

  // ── Loading state ──────────────────────────────────────────────────────

  describe('loading state', () => {
    it('shows loading spinner initially', () => {
      vi.spyOn(useWorktreeStore.getState(), 'readPresetConfig')
        .mockReturnValue(NEVER_RESOLVE as never)

      renderPresetPanel()

      expect(screen.getByText(/loading preset config/i)).toBeInTheDocument()
    })
  })

  // ── Empty state ─────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('shows empty state when no presets are configured', async () => {
      vi.spyOn(useWorktreeStore.getState(), 'readPresetConfig')
        .mockResolvedValue(MOCK_EMPTY_CONFIG)

      renderPresetPanel()

      await waitFor(() => {
        expect(screen.queryByText(/loading preset config/i)).not.toBeInTheDocument()
      })

      // Empty state message should be visible
      expect(screen.getByText(/no named presets yet/i)).toBeInTheDocument()
      // The "Add Preset" button should exist (use getAllByText since it may appear once or in multiple contexts)
      const addPresetButtons = screen.getAllByText(/Add Preset/i)
      expect(addPresetButtons.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ── Loaded state ────────────────────────────────────────────────────────

  describe('loaded state', () => {
    it('renders global setup and teardown sections', async () => {
      vi.spyOn(useWorktreeStore.getState(), 'readPresetConfig')
        .mockResolvedValue(MOCK_CONFIG)

      renderPresetPanel()

      await waitFor(() => {
        expect(screen.queryByText(/loading preset config/i)).not.toBeInTheDocument()
      })

      // Global sections should be visible
      expect(screen.getByText(/Global Setup Commands/i)).toBeInTheDocument()
      expect(screen.getByText(/Global Teardown Commands/i)).toBeInTheDocument()

      // The preset names should be visible
      expect(screen.getByDisplayValue('Node.js API')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Rust CLI')).toBeInTheDocument()

      // Footer should show preset count
      expect(screen.getByText(/2 presets/i)).toBeInTheDocument()
    })

    it('shows save success indicator after saving', async () => {
      vi.spyOn(useWorktreeStore.getState(), 'readPresetConfig')
        .mockResolvedValue(MOCK_CONFIG)
      vi.spyOn(useWorktreeStore.getState(), 'savePresetConfig')
        .mockResolvedValue(undefined)

      renderPresetPanel()

      await waitFor(() => {
        expect(screen.queryByText(/loading preset config/i)).not.toBeInTheDocument()
      })

      // Click Save button
      const saveBtn = screen.getByText('Save').closest('button')
      expect(saveBtn).toBeInTheDocument()
      fireEvent.click(saveBtn!)

      // Should show success indicator
      await waitFor(() => {
        expect(screen.getByText(/saved/i)).toBeInTheDocument()
      })
    })

    it('calls savePresetConfig with the correct config', async () => {
      vi.spyOn(useWorktreeStore.getState(), 'readPresetConfig')
        .mockResolvedValue(MOCK_CONFIG)
      const saveSpy = vi.spyOn(useWorktreeStore.getState(), 'savePresetConfig')
        .mockResolvedValue(undefined)

      renderPresetPanel()

      await waitFor(() => {
        expect(screen.queryByText(/loading preset config/i)).not.toBeInTheDocument()
      })

      // Click Save
      const saveBtn = screen.getByText('Save').closest('button')
      fireEvent.click(saveBtn!)

      await waitFor(() => {
        expect(saveSpy).toHaveBeenCalledWith('/tmp/repo', expect.objectContaining({
          setup: expect.arrayContaining(['echo "global pre"']),
          presets: expect.arrayContaining([
            expect.objectContaining({ name: 'Node.js API' }),
          ]),
        }))
      })
    })
  })

  // ── Add and remove presets ─────────────────────────────────────────────

  describe('add and remove presets', () => {
    it('adds a new preset when clicking Add Preset', async () => {
      vi.spyOn(useWorktreeStore.getState(), 'readPresetConfig')
        .mockResolvedValue(MOCK_EMPTY_CONFIG)

      renderPresetPanel()

      await waitFor(() => {
        expect(screen.queryByText(/loading preset config/i)).not.toBeInTheDocument()
      })

      // Click Add Preset — use role selector to find the actual button
      // (there's also text "Add presets..." in the empty state paragraph)
      const addBtn = screen.getByRole('button', { name: /Add Preset/i })
      expect(addBtn).toBeInTheDocument()
      fireEvent.click(addBtn)

      // A new preset input should appear (named preset-1)
      expect(screen.getByDisplayValue('preset-1')).toBeInTheDocument()
    })

    it('removes a preset when clicking the remove button', async () => {
      vi.spyOn(useWorktreeStore.getState(), 'readPresetConfig')
        .mockResolvedValue(MOCK_CONFIG)

      renderPresetPanel()

      await waitFor(() => {
        expect(screen.queryByText(/loading preset config/i)).not.toBeInTheDocument()
      })

      // Both preset names should be visible
      expect(screen.getByDisplayValue('Node.js API')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Rust CLI')).toBeInTheDocument()

      // Click the remove button on the first preset
      const removeButtons = screen.getAllByTitle('Remove preset')
      expect(removeButtons.length).toBe(2)
      fireEvent.click(removeButtons[0])

      // After removal, only one preset should remain
      expect(screen.queryByDisplayValue('Node.js API')).not.toBeInTheDocument()
      expect(screen.getByDisplayValue('Rust CLI')).toBeInTheDocument()

      // Footer should update count
      expect(screen.getByText(/1 preset/i)).toBeInTheDocument()
    })
  })

  // ── Preset expansion and editing ────────────────────────────────────────

  describe('preset expansion and editing', () => {
    it('expands a preset to show its commands', async () => {
      vi.spyOn(useWorktreeStore.getState(), 'readPresetConfig')
        .mockResolvedValue(MOCK_CONFIG)

      renderPresetPanel()

      await waitFor(() => {
        expect(screen.queryByText(/loading preset config/i)).not.toBeInTheDocument()
      })

      // Click on the preset header to expand it
      const presetHeader = screen.getByDisplayValue('Node.js API').closest('div')
      fireEvent.click(presetHeader!)

      // Expanded preset should show command labels — use getAllByText since
      // the same label text might match multiple DOM elements
      const setupLabels = screen.getAllByText(/Setup commands/i)
      expect(setupLabels.length).toBeGreaterThanOrEqual(1)

      const teardownLabels = screen.getAllByText(/Teardown commands/i)
      expect(teardownLabels.length).toBeGreaterThanOrEqual(1)

      const runLabels = screen.getAllByText(/Run commands/i)
      expect(runLabels.length).toBeGreaterThanOrEqual(1)

      // Environment variables should be visible
      expect(screen.getByText('PORT')).toBeInTheDocument()
      expect(screen.getByText('NODE_ENV')).toBeInTheDocument()
    })

    it('shows quick-run buttons when worktrees exist', async () => {
      vi.spyOn(useWorktreeStore.getState(), 'readPresetConfig')
        .mockResolvedValue(MOCK_CONFIG)

      renderPresetPanel({ worktrees: MOCK_WORKTREES })

      await waitFor(() => {
        expect(screen.queryByText(/loading preset config/i)).not.toBeInTheDocument()
      })

      // Expand the preset
      const presetHeader = screen.getByDisplayValue('Node.js API').closest('div')
      fireEvent.click(presetHeader!)

      // Quick Run section should be visible
      expect(screen.getByText(/Quick Run on Workspace/i)).toBeInTheDocument()

      // Worktree branch should appear as a run button
      expect(screen.getByText('feature/user-auth')).toBeInTheDocument()
    })
  })

  // ── Error handling ─────────────────────────────────────────────────────

  describe('error handling', () => {
    it('shows validation error when saving with empty preset name', async () => {
      // Config with empty preset name
      const emptyNameConfig: WorkspacePresetConfig = {
        setup: [],
        teardown: [],
        presets: [{
          name: '',
          description: '',
          base_branch: 'main',
          setup: [],
          teardown: [],
          run: [],
          env: {},
          agent_id: '',
        }],
      }

      vi.spyOn(useWorktreeStore.getState(), 'readPresetConfig')
        .mockResolvedValue(emptyNameConfig)

      const saveSpy = vi.spyOn(useWorktreeStore.getState(), 'savePresetConfig')

      renderPresetPanel()

      await waitFor(() => {
        expect(screen.queryByText(/loading preset config/i)).not.toBeInTheDocument()
      })

      // Click Save
      const saveBtn = screen.getByText('Save').closest('button')
      fireEvent.click(saveBtn!)

      // Validation error should appear
      await waitFor(() => {
        expect(screen.getByText(/All presets must have a name/i)).toBeInTheDocument()
      })

      // savePresetConfig should NOT have been called (blocked by validation)
      expect(saveSpy).not.toHaveBeenCalled()
    })
  })

  // ── onClose prop ────────────────────────────────────────────────────────

  describe('onClose prop', () => {
    it('calls onClose when close button is clicked', async () => {
      vi.spyOn(useWorktreeStore.getState(), 'readPresetConfig')
        .mockResolvedValue(MOCK_EMPTY_CONFIG)

      const onClose = vi.fn()
      renderPresetPanel({ onClose })

      await waitFor(() => {
        expect(screen.queryByText(/loading preset config/i)).not.toBeInTheDocument()
      })

      // Close button now has a title attribute
      const closeBtn = screen.getByTitle('Close preset panel')
      fireEvent.click(closeBtn)
      expect(onClose).toHaveBeenCalledOnce()
    })
  })
})
