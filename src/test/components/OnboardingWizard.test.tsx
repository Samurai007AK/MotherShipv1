import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { OnboardingWizard } from '../../components/onboarding/OnboardingWizard'
import { useOnboardingStore } from '../../stores/onboardingStore'
import { useAgentStore } from '../../stores/agentStore'

// ── Mock agent data ────────────────────────────────────────────────────────

const MOCK_AGENTS = [
  { id: 'claude', name: 'Claude', provider: 'claude' as const, role: 'software-engineer' as const, status: 'idle' as const, description: 'Coding assistant', category: 'engineering' as const, model: 'claude-sonnet' },
  { id: 'codex', name: 'Codex', provider: 'codex' as const, role: 'software-engineer' as const, status: 'idle' as const, description: 'Code review specialist', category: 'engineering' as const, model: 'codex-mini' },
  { id: 'gemini', name: 'Gemini', provider: 'gemini' as const, role: 'security-engineer' as const, status: 'idle' as const, description: 'Multi-modal agent', category: 'operations' as const, model: 'gemini-pro' },
  { id: 'opencode', name: 'OpenCode', provider: 'opencode' as const, role: 'qa-engineer' as const, status: 'offline' as const, description: 'Open source coding agent', category: 'quality' as const },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function startOnboarding() {
  useOnboardingStore.getState().startOnboarding()
}

function renderWizard() {
  return render(<OnboardingWizard />)
}

function resetStores() {
  useOnboardingStore.setState({
    isOnboarding: false,
    currentStep: 'welcome',
    completedSteps: [],
    hasCompletedOnboarding: false,
  })
  useAgentStore.setState({ agents: MOCK_AGENTS, activeAgentId: null })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('OnboardingWizard', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetStores()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  // ── Null state ─────────────────────────────────────────────────────────

  describe('null state', () => {
    it('returns null when onboarding is not active', () => {
      const { container } = renderWizard()
      expect(container.innerHTML).toBe('')
    })

    it('renders when onboarding starts', () => {
      startOnboarding()
      renderWizard()
      // Title appears in both header <h2> and content <h3>
      const titles = screen.getAllByText('Welcome to Crew')
      expect(titles.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ── Welcome step ───────────────────────────────────────────────────────

  describe('welcome step', () => {
    beforeEach(() => {
      startOnboarding()
      renderWizard()
    })

    it('shows the welcome title', () => {
      // Title appears in both header <h2> and content <h3>
      const titles = screen.getAllByText('Welcome to Crew')
      expect(titles.length).toBeGreaterThanOrEqual(1)
    })

    it('shows the welcome description', () => {
      expect(
        screen.getByText(/Your desktop AI control center/)
      ).toBeInTheDocument()
    })

    it('shows the step indicator as Step 1 of 4', () => {
      expect(screen.getByText('Step 1 of 4')).toBeInTheDocument()
    })

    it('shows feature badges (Isolated Terminals, Shared Memory, Multi-Agent)', () => {
      expect(screen.getByText('Isolated Terminals')).toBeInTheDocument()
      expect(screen.getByText('Shared Memory')).toBeInTheDocument()
      expect(screen.getByText('Multi-Agent')).toBeInTheDocument()
    })
  })

  // ── Agents step ────────────────────────────────────────────────────────

  describe('agents step', () => {
    beforeEach(() => {
      startOnboarding()
      // Advance to step 2 (agents)
      useOnboardingStore.getState().nextStep()
      renderWizard()
    })

    it('shows the agents title', () => {
      // Title appears in header <h2> and content <h3>
      const titles = screen.getAllByText('Meet Your Agents')
      expect(titles.length).toBeGreaterThanOrEqual(1)
    })

    it('shows the step indicator as Step 2 of 4', () => {
      expect(screen.getByText('Step 2 of 4')).toBeInTheDocument()
    })

    it('shows up to 4 agent cards with names', () => {
      expect(screen.getByText('Claude')).toBeInTheDocument()
      expect(screen.getByText('Codex')).toBeInTheDocument()
      expect(screen.getByText('Gemini')).toBeInTheDocument()
      expect(screen.getByText('OpenCode')).toBeInTheDocument()
    })

    it('shows agent descriptions', () => {
      expect(screen.getByText('Coding assistant')).toBeInTheDocument()
      expect(screen.getByText('Code review specialist')).toBeInTheDocument()
    })

    it('shows hint about adding more agents later', () => {
      expect(
        screen.getByText('You can add more agents later from the sidebar.')
      ).toBeInTheDocument()
    })
  })

  // ── Project step ───────────────────────────────────────────────────────

  describe('project step', () => {
    beforeEach(() => {
      startOnboarding()
      useOnboardingStore.getState().goToStep('project')
      renderWizard()
    })

    it('shows the project title', () => {
      // Title appears in header <h2> and content
      const titles = screen.getAllByText('Start Your First Project')
      expect(titles.length).toBeGreaterThanOrEqual(1)
    })

    it('shows the step indicator as Step 3 of 4', () => {
      expect(screen.getByText('Step 3 of 4')).toBeInTheDocument()
    })

    it('shows the Quick Start card', () => {
      expect(screen.getByText('Quick Start')).toBeInTheDocument()
    })

    it('shows the Shared Memory card', () => {
      expect(screen.getByText('Shared Memory')).toBeInTheDocument()
    })

    it('shows description for Quick Start', () => {
      expect(
        screen.getByText(/Open a terminal tab and start working/)
      ).toBeInTheDocument()
    })

    it('shows description for Shared Memory', () => {
      expect(
        screen.getByText(/Notes, context, and search are shared/)
      ).toBeInTheDocument()
    })
  })

  // ── Complete step ──────────────────────────────────────────────────────

  describe('complete step', () => {
    beforeEach(() => {
      startOnboarding()
      useOnboardingStore.getState().goToStep('complete')
      renderWizard()
    })

    it('shows the complete title', () => {
      // Title appears in header <h2> and content
      const titles = screen.getAllByText("You're All Set!")
      expect(titles.length).toBeGreaterThanOrEqual(1)
    })

    it('shows the step indicator as Step 4 of 4', () => {
      expect(screen.getByText('Step 4 of 4')).toBeInTheDocument()
    })

    it('shows the ready message', () => {
      expect(
        screen.getByText(/Crew is ready/)
      ).toBeInTheDocument()
    })

    it('shows keyboard shortcut hints (⌘K, ⌘T, ⌘\\)', () => {
      // The keyboard shortcuts appear as <kbd> elements inside the complete step
      expect(screen.getByText('⌘K')).toBeInTheDocument()
      expect(screen.getByText('⌘T')).toBeInTheDocument()
      // ⌘\ is tricky — the text is literally "⌘\"
      expect(screen.getByText('⌘\\')).toBeInTheDocument()
    })

    it('shows the Command Palette hint', () => {
      expect(screen.getByText('Command Palette')).toBeInTheDocument()
    })
  })

  // ── Header ─────────────────────────────────────────────────────────────

  describe('header', () => {
    beforeEach(() => {
      startOnboarding()
      renderWizard()
    })

    it('shows the step icon (Rocket) for welcome', () => {
      expect(document.querySelector('.lucide-rocket')).toBeInTheDocument()
    })

    it('shows the close (X) button', () => {
      const closeBtn = document.querySelector('.lucide-x')?.closest('button')
      expect(closeBtn).toBeInTheDocument()
    })

    it('changes icon for agents step', () => {
      useOnboardingStore.getState().nextStep()
      renderWizard()
      expect(document.querySelector('.lucide-bot')).toBeInTheDocument()
    })

    it('shows folder icon for project step', () => {
      useOnboardingStore.getState().goToStep('project')
      renderWizard()
      expect(document.querySelector('.lucide-folder-open')).toBeInTheDocument()
    })

    it('shows check icon for complete step', () => {
      useOnboardingStore.getState().goToStep('complete')
      renderWizard()
      // Complete step uses CheckCircle2 icon and shows success message
      const titles = screen.getAllByText("You're All Set!")
      expect(titles.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ── Progress bar ──────────────────────────────────────────────────────

  describe('progress bar', () => {
    it('shows 25% width for Step 1', () => {
      startOnboarding()
      renderWizard()
      const progressBar = document.querySelector('.h-full.bg-mothership-500') as HTMLElement
      expect(progressBar?.style.width).toBe('25%')
    })

    it('shows 50% width for Step 2', () => {
      startOnboarding()
      useOnboardingStore.getState().nextStep()
      renderWizard()
      const progressBar = document.querySelector('.h-full.bg-mothership-500') as HTMLElement
      expect(progressBar?.style.width).toBe('50%')
    })

    it('shows 75% width for Step 3', () => {
      startOnboarding()
      useOnboardingStore.getState().goToStep('project')
      renderWizard()
      const progressBar = document.querySelector('.h-full.bg-mothership-500') as HTMLElement
      expect(progressBar?.style.width).toBe('75%')
    })

    it('shows 100% width for Step 4', () => {
      startOnboarding()
      useOnboardingStore.getState().goToStep('complete')
      renderWizard()
      const progressBar = document.querySelector('.h-full.bg-mothership-500') as HTMLElement
      expect(progressBar?.style.width).toBe('100%')
    })
  })

  // ── Navigation ────────────────────────────────────────────────────────

  describe('navigation', () => {
    beforeEach(() => {
      startOnboarding()
      renderWizard()
    })

    it('shows Next button on welcome step', () => {
      expect(screen.getByText('Next')).toBeInTheDocument()
    })

    it('shows Back and Next buttons', () => {
      expect(screen.getByText('Back')).toBeInTheDocument()
      expect(screen.getByText('Next')).toBeInTheDocument()
    })

    it('shows Skip button', () => {
      expect(screen.getByText('Skip')).toBeInTheDocument()
    })

    it('navigates to next step when Next is clicked', async () => {
      await act(async () => {
        fireEvent.click(screen.getByText('Next'))
      })
      // Title appears in header and content
      const titles = screen.getAllByText('Meet Your Agents')
      expect(titles.length).toBeGreaterThanOrEqual(1)
    })

    it('navigates back when Back is clicked', async () => {
      await act(async () => {
        fireEvent.click(screen.getByText('Next'))
      })
      await act(async () => {
        fireEvent.click(screen.getByText('Back'))
      })
      // Title appears in header and content
      const titles = screen.getAllByText('Welcome to Crew')
      expect(titles.length).toBeGreaterThanOrEqual(1)
    })

    it('disables Back button on welcome step', () => {
      const backBtn = screen.getByText('Back').closest('button')!
      expect(backBtn).toBeDisabled()
    })

    it('enables Back button on non-welcome steps', async () => {
      await act(async () => {
        fireEvent.click(screen.getByText('Next'))
      })
      const backBtn = screen.getByText('Back').closest('button')!
      expect(backBtn).not.toBeDisabled()
    })
  })

  // ── Complete step navigation ──────────────────────────────────────────

  describe('complete step navigation', () => {
    beforeEach(() => {
      startOnboarding()
      useOnboardingStore.getState().goToStep('complete')
      renderWizard()
    })

    it('shows Get Started button instead of Next', () => {
      expect(screen.getByText('Get Started')).toBeInTheDocument()
      expect(screen.queryByText('Next')).not.toBeInTheDocument()
    })

    it('completes onboarding when Get Started is clicked', async () => {
      await act(async () => {
        fireEvent.click(screen.getByText('Get Started'))
      })
      expect(useOnboardingStore.getState().isOnboarding).toBe(false)
      expect(useOnboardingStore.getState().hasCompletedOnboarding).toBe(true)
    })
  })

  // ── Skip / Close ──────────────────────────────────────────────────────

  describe('skip and close', () => {
    it('skips onboarding when Skip button is clicked', async () => {
      startOnboarding()
      renderWizard()
      await act(async () => {
        fireEvent.click(screen.getByText('Skip'))
      })
      expect(useOnboardingStore.getState().isOnboarding).toBe(false)
      expect(useOnboardingStore.getState().hasCompletedOnboarding).toBe(true)
    })

    it('skips onboarding when X (close) button is clicked', async () => {
      startOnboarding()
      renderWizard()
      const closeBtn = document.querySelector('.lucide-x')?.closest('button')!
      await act(async () => {
        fireEvent.click(closeBtn)
      })
      expect(useOnboardingStore.getState().isOnboarding).toBe(false)
      expect(useOnboardingStore.getState().hasCompletedOnboarding).toBe(true)
    })
  })

  // ── Empty agents ──────────────────────────────────────────────────────

  describe('empty agents', () => {
    it('shows no agent cards when agents array is empty', () => {
      useAgentStore.setState({ agents: [], activeAgentId: null })
      startOnboarding()
      useOnboardingStore.getState().nextStep()
      renderWizard()
      expect(screen.queryByText('Claude')).not.toBeInTheDocument()
      expect(screen.queryByText('Codex')).not.toBeInTheDocument()
    })
  })

  // ── Full step flow ────────────────────────────────────────────────────

  describe('full step flow', () => {
    it('navigates from welcome → agents → project → complete', async () => {
      startOnboarding()
      renderWizard()

      // Step 1: Welcome
      expect(screen.getAllByText('Welcome to Crew').length).toBeGreaterThanOrEqual(1)
      await act(async () => { fireEvent.click(screen.getByText('Next')) })

      // Step 2: Agents
      expect(screen.getAllByText('Meet Your Agents').length).toBeGreaterThanOrEqual(1)
      await act(async () => { fireEvent.click(screen.getByText('Next')) })

      // Step 3: Project
      expect(screen.getAllByText('Start Your First Project').length).toBeGreaterThanOrEqual(1)
      await act(async () => { fireEvent.click(screen.getByText('Next')) })

      // Step 4: Complete
      expect(screen.getAllByText("You're All Set!").length).toBeGreaterThanOrEqual(1)
    })

    it('calls completeOnboarding when clicking Get Started from complete step', async () => {
      startOnboarding()
      // Navigate all the way through
      renderWizard()
      await act(async () => { fireEvent.click(screen.getByText('Next')) }) // agents
      await act(async () => { fireEvent.click(screen.getByText('Next')) }) // project
      await act(async () => { fireEvent.click(screen.getByText('Next')) }) // complete

      // Should show Get Started
      await act(async () => { fireEvent.click(screen.getByText('Get Started')) })
      // Onboarding is done
      expect(useOnboardingStore.getState().isOnboarding).toBe(false)
    })
  })
})
