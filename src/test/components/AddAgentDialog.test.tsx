import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AddAgentDialog } from '../../components/agents/AddAgentDialog'
import { useAgentStore } from '../../stores/agentStore'

// ── Mock Tauri invoke ──────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

// ── Helpers ────────────────────────────────────────────────────────────────

function renderDialog(open: boolean = true, onClose: () => void = vi.fn()) {
  return render(<AddAgentDialog open={open} onClose={onClose} />)
}

function resetStore() {
  useAgentStore.setState({
    agents: [],
    activeAgentId: null,
  })
}

/** Click the role selector to open the dropdown, then click a role by name. */
function selectRole(name: string) {
  fireEvent.click(screen.getByText(/Select a role/))
  fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }))
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('AddAgentDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetStore()
  })

  // ── Basic rendering ───────────────────────────────────────────────────

  describe('rendering', () => {
    it('returns null when open is false', () => {
      const { container } = renderDialog(false)
      expect(container.innerHTML).toBe('')
    })

    it('renders dialog elements when open is true', () => {
      renderDialog()

      expect(screen.getByText('Add Team Member')).toBeInTheDocument()
      expect(screen.getByText('Cancel')).toBeInTheDocument()
      const addBtn = screen.getByRole('button', { name: 'Add Team Member' })
      expect(addBtn).toBeInTheDocument()
    })

    it('shows the close (X) button in the header', () => {
      renderDialog()

      const headerButtons = screen.getAllByRole('button')
      const closeBtn = headerButtons.find(
        (btn) => btn.closest('.border-b') && btn.querySelector('svg')
      )
      expect(closeBtn).toBeInTheDocument()
    })

    it('shows the Role label', () => {
      renderDialog()
      expect(screen.getByText('Role')).toBeInTheDocument()
    })

    it('shows the Name field', () => {
      renderDialog()
      expect(screen.getByPlaceholderText('e.g., My Engineer')).toBeInTheDocument()
    })

    it('shows the Description field (optional)', () => {
      renderDialog()
      expect(screen.getByText(/Description/)).toBeInTheDocument()
    })

    it('shows the System Prompt field (optional)', () => {
      renderDialog()
      expect(screen.getByText(/System Prompt/)).toBeInTheDocument()
    })

    it('shows the AI Provider label with optional hint', () => {
      renderDialog()
      expect(screen.getByText(/AI Provider/)).toBeInTheDocument()
      expect(screen.getByText(/optional/)).toBeInTheDocument()
    })
  })

  // ── Role selection ────────────────────────────────────────────────────

  describe('role selection', () => {
    it('shows "Select a role..." when no role is selected', () => {
      renderDialog()
      expect(screen.getByText(/Select a role/)).toBeInTheDocument()
    })

    it('opens the role dropdown when clicked', () => {
      renderDialog()

      fireEvent.click(screen.getByText(/Select a role/))

      expect(screen.getByText('Software Engineer')).toBeInTheDocument()
      expect(screen.getByText('DevOps Engineer')).toBeInTheDocument()
      expect(screen.getByText('Security Engineer')).toBeInTheDocument()
      expect(screen.getByText('QA Engineer')).toBeInTheDocument()
      expect(screen.getByText('Data Engineer')).toBeInTheDocument()
      expect(screen.getByText('ML Engineer')).toBeInTheDocument()
      expect(screen.getByText('Tech Lead')).toBeInTheDocument()
    })

    it('selects a role and shows its name in the trigger', () => {
      renderDialog()

      selectRole('Software Engineer')

      // The trigger should now show the role
      expect(screen.getByText(/Software Engineer/)).toBeInTheDocument()
      expect(screen.queryByText(/Select a role/)).not.toBeInTheDocument()
    })

    it('auto-fills system prompt from role when selected', () => {
      renderDialog()

      selectRole('Software Engineer')

      // System prompt should be auto-filled with the role's default
      const textarea = screen.getByPlaceholderText(/Instructions that shape/)
      expect((textarea as HTMLTextAreaElement).value).toMatch(/You are a senior software engineer/)
    })

    it('closes the dropdown after selecting a role', () => {
      renderDialog()

      fireEvent.click(screen.getByText(/Select a role/))
      expect(screen.getByText('DevOps Engineer')).toBeInTheDocument()

      fireEvent.click(screen.getByText('DevOps Engineer'))

      expect(screen.getByText('DevOps Engineer')).toBeInTheDocument()
    })
  })

  // ── Model picker and API key (conditional fields) ─────────────────────

  describe('conditional fields', () => {
    it('hides the model picker when no provider is selected', () => {
      renderDialog()
      expect(screen.queryByText('Model')).not.toBeInTheDocument()
    })

    it('shows the model picker when a provider is selected', () => {
      renderDialog()

      // Open provider dropdown
      fireEvent.click(screen.getByText(/No provider/))
      fireEvent.click(screen.getByText('Claude'))

      expect(screen.getByText('Model')).toBeInTheDocument()
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })

    it('shows models for the selected provider in the dropdown', () => {
      renderDialog()

      fireEvent.click(screen.getByText(/No provider/))
      fireEvent.click(screen.getByText('Codex'))

      const modelSelect = screen.getByRole('combobox')
      expect(modelSelect).toHaveValue('codex-mini')

      const options = screen.getAllByRole('option')
      const modelNames = options.map((o) => o.textContent)
      expect(modelNames).toContain('codex-mini')
      expect(modelNames).toContain('gpt-4o')
      expect(modelNames).toContain('gpt-4o-mini')
      expect(modelNames).toContain('o3-mini')
    })

    it('hides the API key field when no provider is selected', () => {
      renderDialog()
      expect(screen.queryByText('API Key')).not.toBeInTheDocument()
    })

    it('shows the API key field for providers with API keys', () => {
      renderDialog()

      fireEvent.click(screen.getByText(/No provider/))
      fireEvent.click(screen.getByText('Claude'))

      expect(screen.getByText('API Key')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('sk-ant-...')).toBeInTheDocument()
      expect(screen.getByText('Get key')).toBeInTheDocument()
    })

    it('hides the API key field for OpenCode (no API key needed)', () => {
      renderDialog()

      fireEvent.click(screen.getByText(/No provider/))
      fireEvent.click(screen.getByText('OpenCode'))

      expect(screen.queryByText('API Key')).not.toBeInTheDocument()
      expect(screen.queryByText('Get key')).not.toBeInTheDocument()
    })

    it('shows different API key placeholder per provider', () => {
      renderDialog()

      fireEvent.click(screen.getByText(/No provider/))
      fireEvent.click(screen.getByText('Gemini'))
      expect(screen.getByPlaceholderText('AIza...')).toBeInTheDocument()

      fireEvent.click(screen.getByText(/Gemini/))
      fireEvent.click(screen.getByText('Codex'))
      expect(screen.getByPlaceholderText('sk-...')).toBeInTheDocument()
    })
  })

  // ── Form validation ──────────────────────────────────────────────────

  describe('form validation', () => {
    it('disables the Add Team Member button when no role is selected', () => {
      renderDialog()

      const addBtn = screen.getByRole('button', { name: 'Add Team Member' })
      expect(addBtn).toBeDisabled()
    })

    it('disables the Add Team Member button when name is empty', () => {
      renderDialog()
      selectRole('Software Engineer')

      const addBtn = screen.getByRole('button', { name: 'Add Team Member' })
      expect(addBtn).toBeDisabled()
    })

    it('enables the Add Team Member button when role is selected and name is filled', () => {
      renderDialog()
      selectRole('Software Engineer')

      const nameInput = screen.getByPlaceholderText(/e.g.,/)
      fireEvent.change(nameInput, { target: { value: 'My Engineer' } })

      const addBtn = screen.getByRole('button', { name: 'Add Team Member' })
      expect(addBtn).not.toBeDisabled()
    })
  })

  // ── Form submission ──────────────────────────────────────────────────

  describe('form submission', () => {
    beforeEach(() => {
      vi.spyOn(Date, 'now').mockReturnValue(1234567890)
    })

    it('calls registerAgent with the correct data', () => {
      const registerSpy = vi.spyOn(useAgentStore.getState(), 'registerAgent')
      const onClose = vi.fn()

      renderDialog(true, onClose)
      selectRole('Software Engineer')

      const nameInput = screen.getByPlaceholderText(/e.g.,/)
      fireEvent.change(nameInput, { target: { value: 'My Engineer' } })

      fireEvent.click(screen.getByRole('button', { name: 'Add Team Member' }))

      expect(registerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'My Engineer',
          role: 'software-engineer',
          status: 'idle',
          category: 'engineering',
        })
      )
    })

    it('uses role description as default when none provided', () => {
      const registerSpy = vi.spyOn(useAgentStore.getState(), 'registerAgent')
      const onClose = vi.fn()

      renderDialog(true, onClose)
      selectRole('Software Engineer')

      fireEvent.change(
        screen.getByPlaceholderText(/e.g.,/),
        { target: { value: 'My Agent' } }
      )

      fireEvent.click(screen.getByRole('button', { name: 'Add Team Member' }))

      expect(registerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Software Engineer',
        })
      )
    })

    it('includes model and systemPrompt when provided', () => {
      const registerSpy = vi.spyOn(useAgentStore.getState(), 'registerAgent')
      const onClose = vi.fn()

      renderDialog(true, onClose)
      selectRole('DevOps Engineer')

      fireEvent.change(
        screen.getByPlaceholderText(/e.g.,/),
        { target: { value: 'DevOps Agent' } }
      )

      fireEvent.click(screen.getByRole('button', { name: 'Add Team Member' }))

      expect(registerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'DevOps Agent',
          role: 'devops-engineer',
          category: 'operations',
        })
      )
    })

    it('calls onClose after successful submission', () => {
      const onClose = vi.fn()

      renderDialog(true, onClose)
      selectRole('Software Engineer')

      fireEvent.change(
        screen.getByPlaceholderText(/e.g.,/),
        { target: { value: 'My Agent' } }
      )

      fireEvent.click(screen.getByRole('button', { name: 'Add Team Member' }))

      expect(onClose).toHaveBeenCalledOnce()
    })

    it('does nothing when role is not selected', () => {
      const onClose = vi.fn()

      renderDialog(true, onClose)

      fireEvent.change(
        screen.getByPlaceholderText(/e.g.,/),
        { target: { value: 'My Agent' } }
      )

      fireEvent.click(screen.getByRole('button', { name: 'Add Team Member' }))

      expect(onClose).not.toHaveBeenCalled()
    })

    it('does nothing when name is empty', () => {
      const onClose = vi.fn()

      renderDialog(true, onClose)
      selectRole('Software Engineer')

      fireEvent.click(screen.getByRole('button', { name: 'Add Team Member' }))

      expect(onClose).not.toHaveBeenCalled()
    })
  })

  // ── Close behavior ──────────────────────────────────────────────────

  describe('close behavior', () => {
    it('calls onClose when Cancel is clicked', () => {
      const onClose = vi.fn()
      renderDialog(true, onClose)

      fireEvent.click(screen.getByText('Cancel'))

      expect(onClose).toHaveBeenCalledOnce()
    })

    it('calls onClose when the X button is clicked', () => {
      const onClose = vi.fn()
      renderDialog(true, onClose)

      const headerCloseBtn = screen.getAllByRole('button').find(
        (btn) => btn.closest('.border-b') && btn.querySelector('svg')
      )
      expect(headerCloseBtn).toBeInTheDocument()
      fireEvent.click(headerCloseBtn!)

      expect(onClose).toHaveBeenCalledOnce()
    })

    it('calls onClose when the backdrop is clicked', () => {
      const onClose = vi.fn()
      renderDialog(true, onClose)

      const backdrop = document.querySelector('.fixed.inset-0.z-50 > .absolute')
      expect(backdrop).not.toBeNull()
      fireEvent.click(backdrop!)

      expect(onClose).toHaveBeenCalledOnce()
    })
  })

  // ── Provider specific behavior ───────────────────────────────────────

  describe('provider selection', () => {
    it('shows OpenCode models in the model picker', () => {
      renderDialog()

      fireEvent.click(screen.getByText(/No provider/))
      fireEvent.click(screen.getByText('OpenCode'))

      expect(screen.getByText('Model')).toBeInTheDocument()
      const options = screen.getAllByRole('option')
      const modelNames = options.map((o) => o.textContent)
      expect(modelNames).toContain('codellama-34b')
      expect(modelNames).toContain('deepseek-coder-v2')
      expect(modelNames).toContain('qwen2.5-coder-32b')
    })

    it('selects None (Human) as provider', () => {
      renderDialog()

      fireEvent.click(screen.getByText(/No provider/))
      fireEvent.click(screen.getByText('None (Human)'))

      // Should show "No provider (human team member)"
      expect(screen.getByText(/No provider/)).toBeInTheDocument()
      // Model picker should be hidden
      expect(screen.queryByText('Model')).not.toBeInTheDocument()
    })
  })
})
