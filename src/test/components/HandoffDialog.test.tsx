import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { HandoffDialog } from '../../components/memory/HandoffDialog'
import { useAgentStore } from '../../stores/agentStore'
import { useMemoryStore, type MemoryNote } from '../../stores/memoryStore'
import { invoke } from '@tauri-apps/api/core'

// ── Mock Tauri invoke (must be before imports of the mocked module) ─────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// Mock summary engine to return template fallback (preserving compileHandoff's summary).
vi.mock('../../lib/summaryEngine', () => ({
  generateSummary: vi.fn().mockResolvedValue({
    summary: '',
    key_decisions: [],
    open_todos: [],
    files_touched: [],
    current_state: '',
    model_used: 'template',
  }),
}))

// ── Mock data ──────────────────────────────────────────────────────────────

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
  {
    id: 'codex',
    name: 'Codex',
    provider: 'codex' as const,
    role: 'software-engineer' as const,
    status: 'idle' as const,
    description: 'OpenAI Codex',
    category: 'engineering' as const,
    model: 'codex-mini',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    provider: 'gemini' as const,
    role: 'security-engineer' as const,
    status: 'offline' as const,
    description: 'Google Gemini',
    category: 'operations' as const,
    model: 'gemini-2.5-pro',
  },
]

const MOCK_NOTES: MemoryNote[] = [
  {
    id: 'note-1',
    content: 'Fixed login bug',
    agentId: 'claude',
    entryType: 'note',
    tags: ['bug'],
    filesReferenced: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function renderDialog(
  isOpen: boolean = true,
  sourceAgentId: string = 'claude',
  onClose: () => void = vi.fn(),
  onHandoffComplete?: () => void
) {
  return render(
    <HandoffDialog
      isOpen={isOpen}
      sourceAgentId={sourceAgentId}
      onClose={onClose}
      onHandoffComplete={onHandoffComplete}
    />
  )
}

function resetStores() {
  useAgentStore.setState({
    agents: MOCK_AGENTS,
    activeAgentId: 'claude',
  })
  useMemoryStore.setState({
    notes: MOCK_NOTES,
    handoffHistory: [],
  })
}

/** Click a target agent button in the grid by name. */
function selectTargetAgent(name: string) {
  const targetBtns = screen.getAllByRole('button').filter(
    (btn) => btn.querySelector('.truncate')?.textContent === name
  )
  fireEvent.click(targetBtns[0])
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('HandoffDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetStores()
  })

  // ── Rendering ─────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('returns null when isOpen is false', () => {
      const { container } = renderDialog(false)
      expect(container.innerHTML).toBe('')
    })

    it('renders dialog content when isOpen is true', () => {
      renderDialog()

      expect(screen.getByTestId('handoff-dialog-title')).toHaveTextContent('Context Handoff')
      expect(screen.getByText('From')).toBeInTheDocument()
      expect(screen.getByText('To')).toBeInTheDocument()
    })

    it('shows the source agent badge', () => {
      renderDialog()

      expect(screen.getByText('Claude')).toBeInTheDocument()
      expect(screen.getByText('Anthropic Claude')).toBeInTheDocument()
    })

    it('shows all target agents except the source agent', () => {
      renderDialog()

      const gridButtons = screen.getAllByRole('button').filter(
        (btn) => btn.closest('.grid')
      )
      const gridTexts = gridButtons.map((b) => b.textContent || '')
      expect(gridTexts.some((t) => t.includes('Codex'))).toBe(true)
      expect(gridTexts.some((t) => t.includes('Gemini'))).toBe(true)
      // Claude should not be in the target grid (only in the From badge)
      expect(gridTexts.some((t) => t.includes('Claude') && t.includes('Anthropic'))).toBe(false)
    })

    it('shows agent status under target agent names', () => {
      renderDialog()

      // 'idle' appears once in the target grid (Codex — Claude is source, not in grid)
      expect(screen.getByText('idle')).toBeInTheDocument()
      expect(screen.getByText('offline')).toBeInTheDocument()
    })

    it('shows the close (X) button in the header', () => {
      renderDialog()

      const headerButtons = screen.getAllByRole('button').filter(
        (btn) => btn.closest('.border-b')
      )
      const closeBtn = headerButtons.find((btn) => btn.querySelector('svg'))
      expect(closeBtn).toBeInTheDocument()
    })

    it('shows the CrewAI toggle button', () => {
      renderDialog()

      expect(screen.getByText('Manual Handoff')).toBeInTheDocument()
    })

    it('shows the Compile & Send button disabled initially', () => {
      renderDialog()

      const compileBtn = screen.getByText('Compile & Send Handoff').closest('button')
      expect(compileBtn).toBeDisabled()
    })
  })

  // ── Target agent selection ────────────────────────────────────────────

  describe('target selection', () => {
    it('selects a target agent when clicked', () => {
      renderDialog()

      fireEvent.click(screen.getByText('Codex'))

      const compileBtn = screen.getByText('Compile & Send Handoff').closest('button')
      expect(compileBtn).not.toBeDisabled()
    })

    it('highlights the selected target agent', () => {
      renderDialog()

      fireEvent.click(screen.getByText('Gemini'))

      const targetBtns = screen.getAllByRole('button').filter(
        (btn) => btn.closest('.grid')
      )
      const selectedBtn = targetBtns.find((btn) =>
        btn.textContent?.includes('Gemini')
      )
      expect(selectedBtn?.className).toContain('border-mothership-500')
    })
  })

  // ── CrewAI toggle ─────────────────────────────────────────────────────

  describe('CrewAI toggle', () => {
    it('switches to CrewAI mode when clicked', () => {
      renderDialog()

      fireEvent.click(screen.getByText('Manual Handoff'))

      expect(screen.getByText('CrewAI Orchestration')).toBeInTheDocument()
      expect(screen.getByText('AI-powered context analysis & routing')).toBeInTheDocument()
    })

    it('switches back to manual when clicked again', () => {
      renderDialog()

      fireEvent.click(screen.getByText('Manual Handoff'))
      fireEvent.click(screen.getByText('CrewAI Orchestration'))

      expect(screen.getByText('Manual Handoff')).toBeInTheDocument()
    })

    it('shows Orchestrate Handoff button text in CrewAI mode', () => {
      renderDialog()
      selectTargetAgent('Codex')

      fireEvent.click(screen.getByText('Manual Handoff'))

      expect(screen.getByText('Orchestrate Handoff')).toBeInTheDocument()
    })

    it('shows gradient button style in CrewAI mode', () => {
      renderDialog()

      fireEvent.click(screen.getByText('Manual Handoff'))

      const compileBtn = screen.getByText('Orchestrate Handoff').closest('button')
      expect(compileBtn?.className).toContain('from-mothership-600')
    })
  })

  // ── Compile (standard mode) ───────────────────────────────────────────

  describe('compile standard handoff', () => {
    beforeEach(() => {
      vi.spyOn(useMemoryStore.getState(), 'compileHandoff').mockResolvedValue({
        id: 'handoff-123',
        sourceAgentId: 'claude',
        targetAgentId: 'codex',
        entries: MOCK_NOTES,
        summary: 'Fixed login bug — added JWT validation.',
        createdAt: new Date().toISOString(),
      })
    })

    it('calls compileHandoff with source and target agent IDs', async () => {
      const compileSpy = vi.spyOn(useMemoryStore.getState(), 'compileHandoff')
      renderDialog()
      selectTargetAgent('Codex')

      await act(async () => {
        fireEvent.click(screen.getByText('Compile & Send Handoff').closest('button')!)
      })

      expect(compileSpy).toHaveBeenCalledWith('claude', 'codex')
    })

    it('shows loading state while compiling', async () => {
      vi.spyOn(useMemoryStore.getState(), 'compileHandoff').mockImplementation(
        () => new Promise(() => {})
      )
      renderDialog()
      selectTargetAgent('Codex')

      await act(async () => {
        fireEvent.click(screen.getByText('Compile & Send Handoff').closest('button')!)
      })

      expect(screen.getByText('Compiling context…')).toBeInTheDocument()
      expect(screen.getByText('Compiling context…').closest('button')).toBeDisabled()
    })

    it('shows success state after compile completes', async () => {
      renderDialog()
      selectTargetAgent('Codex')

      await act(async () => {
        fireEvent.click(screen.getByText('Compile & Send Handoff').closest('button')!)
      })

      await vi.waitFor(() => {
        expect(screen.getByText('Handoff Complete')).toBeInTheDocument()
      })
    })

    it('shows entry count and agent names in success state', async () => {
      renderDialog()
      selectTargetAgent('Codex')

      await act(async () => {
        fireEvent.click(screen.getByText('Compile & Send Handoff').closest('button')!)
      })

      await vi.waitFor(() => {
        // The description text: "1 context entries compiled from Claude → Codex"
        const entryCount = screen.getByText(/1 context entries compiled/)
        expect(entryCount).toBeInTheDocument()
        expect(entryCount.innerHTML).toContain('Claude')
        expect(entryCount.innerHTML).toContain('Codex')
      })
    })

    it('shows summary preview in success state', async () => {
      renderDialog()
      selectTargetAgent('Codex')

      await act(async () => {
        fireEvent.click(screen.getByText('Compile & Send Handoff').closest('button')!)
      })

      await vi.waitFor(() => {
        expect(screen.getByText('Summary')).toBeInTheDocument()
        expect(screen.getByText('Fixed login bug — added JWT validation.')).toBeInTheDocument()
      })
    })

    it('shows a Done button in success state', async () => {
      renderDialog()
      selectTargetAgent('Codex')

      await act(async () => {
        fireEvent.click(screen.getByText('Compile & Send Handoff').closest('button')!)
      })

      await vi.waitFor(() => {
        expect(screen.getByText('Done')).toBeInTheDocument()
      })
    })

    it('calls onHandoffComplete with the handoff pack', async () => {
      const onComplete = vi.fn()
      renderDialog(true, 'claude', vi.fn(), onComplete)
      selectTargetAgent('Codex')

      await act(async () => {
        fireEvent.click(screen.getByText('Compile & Send Handoff').closest('button')!)
      })

      await vi.waitFor(() => {
        expect(onComplete).toHaveBeenCalledWith(
          expect.objectContaining({
            sourceAgentId: 'claude',
            targetAgentId: 'codex',
          })
        )
      })
    })

    it('truncates summary longer than 300 chars', async () => {
      vi.spyOn(useMemoryStore.getState(), 'compileHandoff').mockResolvedValue({
        id: 'handoff-123',
        sourceAgentId: 'claude',
        targetAgentId: 'codex',
        entries: MOCK_NOTES,
        summary: 'A'.repeat(350),
        createdAt: new Date().toISOString(),
      })
      renderDialog()
      selectTargetAgent('Codex')

      await act(async () => {
        fireEvent.click(screen.getByText('Compile & Send Handoff').closest('button')!)
      })

      await vi.waitFor(() => {
        // Should show first 300 chars + ellipsis
        expect(screen.getByText(/AAA+…$/)).toBeInTheDocument()
      })
    })
  })

  // ── Compile (CrewAI mode) ─────────────────────────────────────────────

  describe('compile CrewAI handoff', () => {
    it('calls crewai_handoff invoke with entries', async () => {
      vi.mocked(invoke).mockResolvedValue({
        source_agent_id: 'claude',
        target_agent_id: 'codex',
        entry_count: 1,
        summary: 'CrewAI analysis complete',
        key_decisions: ['Refactor auth module'],
        open_todos: ['Write unit tests'],
        files_touched: ['src/auth/login.ts'],
        current_state: 'In progress',
        enriched: true,
        model_used: 'claude-sonnet-4-20250514',
      })

      renderDialog()
      selectTargetAgent('Codex')

      // Toggle CrewAI mode
      fireEvent.click(screen.getByText('Manual Handoff'))
      await act(async () => {
        fireEvent.click(screen.getByText('Orchestrate Handoff').closest('button')!)
      })

      expect(vi.mocked(invoke)).toHaveBeenCalledWith('crewai_handoff', {
        request: expect.objectContaining({
          source_agent_id: 'claude',
          target_agent_id: 'codex',
        }),
      })
    })

    it('shows success state after CrewAI handoff', async () => {
      vi.mocked(invoke).mockResolvedValue({
        source_agent_id: 'claude',
        target_agent_id: 'codex',
        entry_count: 1,
        summary: 'CrewAI analysis complete',
        key_decisions: [],
        open_todos: [],
        files_touched: [],
        current_state: 'Done',
        enriched: true,
        model_used: 'claude-sonnet-4-20250514',
      })

      renderDialog()
      selectTargetAgent('Codex')

      fireEvent.click(screen.getByText('Manual Handoff'))
      await act(async () => {
        fireEvent.click(screen.getByText('Orchestrate Handoff').closest('button')!)
      })

      await vi.waitFor(() => {
        expect(screen.getByText('Handoff Complete')).toBeInTheDocument()
      })
    })

    it('shows CrewAI failure error when invoke returns null', async () => {
      vi.mocked(invoke).mockResolvedValue(null)

      renderDialog()
      selectTargetAgent('Codex')

      fireEvent.click(screen.getByText('Manual Handoff'))
      await act(async () => {
        fireEvent.click(screen.getByText('Orchestrate Handoff').closest('button')!)
      })

      await vi.waitFor(() => {
        expect(
          screen.getByText('CrewAI handoff failed — try manual mode')
        ).toBeInTheDocument()
      })
    })
  })

  // ── Error state ───────────────────────────────────────────────────────

  describe('error state', () => {
    it('shows error message when compileHandoff fails', async () => {
      vi.spyOn(useMemoryStore.getState(), 'compileHandoff').mockRejectedValue(
        new Error('Backend unavailable')
      )

      renderDialog()
      selectTargetAgent('Codex')

      await act(async () => {
        fireEvent.click(screen.getByText('Compile & Send Handoff').closest('button')!)
      })

      await vi.waitFor(() => {
        expect(screen.getByText('Error: Backend unavailable')).toBeInTheDocument()
      })
    })

    it('shows error when compileHandoff returns null', async () => {
      vi.spyOn(useMemoryStore.getState(), 'compileHandoff').mockResolvedValue(null)

      renderDialog()
      selectTargetAgent('Codex')

      await act(async () => {
        fireEvent.click(screen.getByText('Compile & Send Handoff').closest('button')!)
      })

      await vi.waitFor(() => {
        expect(
          screen.getByText('Failed to compile handoff context')
        ).toBeInTheDocument()
      })
    })
  })

  // ── Close behavior ────────────────────────────────────────────────────

  describe('close behavior', () => {
    it('calls onClose when the X button is clicked', () => {
      const onClose = vi.fn()
      renderDialog(true, 'claude', onClose)

      const headerCloseBtn = screen.getAllByRole('button').find(
        (btn) => btn.closest('.border-b') && btn.querySelector('svg')
      )
      expect(headerCloseBtn).toBeInTheDocument()
      fireEvent.click(headerCloseBtn!)

      expect(onClose).toHaveBeenCalledOnce()
    })

    it('calls onClose when the backdrop is clicked', () => {
      const onClose = vi.fn()
      renderDialog(true, 'claude', onClose)

      const backdrop = document.querySelector('.fixed.inset-0 .absolute.inset-0')
      expect(backdrop).not.toBeNull()
      fireEvent.click(backdrop!)

      expect(onClose).toHaveBeenCalledOnce()
    })

    it('closes on Escape key', () => {
      const onClose = vi.fn()
      renderDialog(true, 'claude', onClose)

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(onClose).toHaveBeenCalledOnce()
    })

    it('does not close on Escape when dialog is closed', () => {
      const onClose = vi.fn()
      renderDialog(false, 'claude', onClose)

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(onClose).not.toHaveBeenCalled()
    })
  })

  // ── Close from success state ─────────────────────────────────────────

  describe('close from success state', () => {
    beforeEach(() => {
      vi.spyOn(useMemoryStore.getState(), 'compileHandoff').mockResolvedValue({
        id: 'handoff-123',
        sourceAgentId: 'claude',
        targetAgentId: 'codex',
        entries: MOCK_NOTES,
        summary: 'Done.',
        createdAt: new Date().toISOString(),
      })
    })

    it('calls onClose when Done is clicked', async () => {
      const onClose = vi.fn()
      renderDialog(true, 'claude', onClose)
      selectTargetAgent('Codex')

      await act(async () => {
        fireEvent.click(screen.getByText('Compile & Send Handoff').closest('button')!)
      })

      await vi.waitFor(() => {
        expect(screen.getByText('Done')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Done'))
      expect(onClose).toHaveBeenCalledOnce()
    })
  })
})
