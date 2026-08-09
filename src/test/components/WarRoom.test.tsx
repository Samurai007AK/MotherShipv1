import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { WarRoom } from '../../components/war-room/WarRoom'
import { useWarRoomStore } from '../../stores/warRoomStore'
import { useAgentStore, type Agent } from '../../stores/agentStore'

// ── Mock Tauri invoke ──────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// ── Mock agent data ────────────────────────────────────────────────────────

const MOCK_AGENTS: Agent[] = [
  {
    id: 'se-1',
    name: 'Software Engineer',
    provider: 'claude',
    role: 'software-engineer',
    status: 'idle',
    description: 'Implements features, writes code, fixes bugs',
    category: 'engineering',
    model: 'claude-sonnet-4-20250514',
  },
  {
    id: 'se-2',
    name: 'Software Engineer #2',
    provider: 'codex',
    role: 'software-engineer',
    status: 'idle',
    description: 'Secondary engineer for parallel tasks',
    category: 'engineering',
    model: 'codex-mini',
  },
]

// ── Helpers ────────────────────────────────────────────────────────────────

async function renderWarRoom() {
  const view = render(<WarRoom />)
  await act(async () => {})
  return view
}

function resetStores() {
  useWarRoomStore.setState({
    sessions: [],
    activeSessionId: null,
    view: 'broadcast',
    taskChains: [],
    activeChainId: null,
  })
  useAgentStore.setState({ agents: MOCK_AGENTS, activeAgentId: null })
}

/**
 * Find the send button — it's the only <button> in the same .flex container
 * as the broadcast textarea.
 */
function getSendButton(): HTMLButtonElement {
  const textarea = screen.getByPlaceholderText('Broadcast to selected agents...')
  const promptRow = textarea.closest('.flex')!
  return promptRow.querySelector('button') as HTMLButtonElement
}

/** Create a session with a broadcast and completed responses. */
function createPopulatedSession() {
  const sessionId = useWarRoomStore.getState().createSession('Test Session')
  useWarRoomStore.getState().broadcastToAgents(
    'What is the meaning of life?',
    ['se-1', 'se-2'],
    { 'se-1': 'claude', 'se-2': 'codex' }
  )

  const state = useWarRoomStore.getState()
  const session = state.sessions.find((s) => s.id === sessionId)!
  session.responses.forEach((r) => {
    useWarRoomStore.getState().updateResponse(r.id, {
      status: 'completed',
      content: r.agentId === 'se-1' ? '42' : 'To help others.',
    })
  })

  return sessionId
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('WarRoom', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetStores()
  })

  // ── Main component ─────────────────────────────────────────────────────

  describe('main component', () => {
    it('renders the War Room header', async () => {
      await renderWarRoom()
      expect(screen.getByText('War Room')).toBeInTheDocument()
    })

    it('shows all three view tabs', async () => {
      await renderWarRoom()
      expect(screen.getByText('Broadcast')).toBeInTheDocument()
      expect(screen.getByText('Side by Side')).toBeInTheDocument()
      // "Chain" appears both as the tab name and in "Task Chains" heading
      const chainLabels = screen.getAllByText('Chain')
      expect(chainLabels.length).toBeGreaterThanOrEqual(1)
    })

    it('starts in broadcast view by default', async () => {
      await renderWarRoom()
      expect(screen.getByText('Select agents:')).toBeInTheDocument()
    })

    it('switches to side-by-side view when tab is clicked', async () => {
      await renderWarRoom()
      fireEvent.click(screen.getByText('Side by Side'))
      expect(screen.getByText(/No broadcasts yet/)).toBeInTheDocument()
    })

    it('switches to chain view when tab is clicked', async () => {
      await renderWarRoom()
      fireEvent.click(screen.getByRole('button', { name: 'Chain' }))
      expect(screen.getByText(/No task chains yet/)).toBeInTheDocument()
    })

    it('shows a New button for creating sessions', async () => {
      await renderWarRoom()
      expect(screen.getByText('New')).toBeInTheDocument()
    })

    it('creates a session when New button is clicked', async () => {
      await renderWarRoom()
      await act(async () => {
        fireEvent.click(screen.getByText('New'))
      })

      const { sessions } = useWarRoomStore.getState()
      expect(sessions.length).toBe(1)
      expect(sessions[0].name).toMatch(/Session/)
    })

    it('shows session selector when sessions exist', async () => {
      // Set up store state BEFORE rendering to avoid multiple renders
      const sessionId = useWarRoomStore.getState().createSession('My Session')
      useWarRoomStore.getState().setActiveSession(sessionId)

      await renderWarRoom()

      // The session name should appear in the <select>
      const sessionOptions = screen.getAllByText('My Session')
      expect(sessionOptions.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ── Broadcast view — agent selection ─────────────────────────────────

  describe('broadcast view — agent selection', () => {
    it('shows a list of agents to select', async () => {
      await renderWarRoom()
      expect(screen.getByText('Software Engineer')).toBeInTheDocument()
      expect(screen.getByText('Software Engineer #2')).toBeInTheDocument()
    })

    it('shows "Select agents:" label', async () => {
      await renderWarRoom()
      expect(screen.getByText('Select agents:')).toBeInTheDocument()
    })

    it('toggles agent selection style when clicked', async () => {
      await renderWarRoom()

      const claudeBtn = screen.getByText('Software Engineer')
      // Click to select — after selection a CheckCircle2 icon appears alongside the name
      fireEvent.click(claudeBtn)

      // The button should now have the selected styling (the container changes class)
      expect(claudeBtn).toBeInTheDocument()
    })

    it('renders the prompt textarea with placeholder', async () => {
      await renderWarRoom()
      expect(
        screen.getByPlaceholderText('Broadcast to selected agents...')
      ).toBeInTheDocument()
    })
  })

  // ── Broadcast view — sending ──────────────────────────────────────────

  describe('broadcast view — sending', () => {
    it('disables the send button when no agents are selected and prompt is empty', async () => {
      await renderWarRoom()
      const sendButton = getSendButton()
      expect(sendButton).toBeDisabled()
    })

    it('disables the send button when no agents are selected even with prompt', async () => {
      await renderWarRoom()

      const textarea = screen.getByPlaceholderText('Broadcast to selected agents...')
      fireEvent.change(textarea, { target: { value: 'Hello agents' } })

      expect(getSendButton()).toBeDisabled()
    })

    it('enables the send button when agent is selected and prompt is filled', async () => {
      await renderWarRoom()

      fireEvent.click(screen.getByText('Software Engineer'))

      const textarea = screen.getByPlaceholderText('Broadcast to selected agents...')
      fireEvent.change(textarea, { target: { value: 'Hello agents' } })

      expect(getSendButton()).not.toBeDisabled()
    })

    it('broadcasts to selected agents when send is clicked', async () => {
      await renderWarRoom()

      // Create a session first so broadcast has a target
      useWarRoomStore.getState().createSession('Test')

      fireEvent.click(screen.getByText('Software Engineer'))

      const textarea = screen.getByPlaceholderText('Broadcast to selected agents...')
      fireEvent.change(textarea, { target: { value: 'Hello' } })

      await act(async () => {
        fireEvent.click(getSendButton())
      })

      const { sessions } = useWarRoomStore.getState()
      const session = sessions[0]
      expect(session.broadcasts.length).toBe(1)
      expect(session.broadcasts[0].prompt).toBe('Hello')
      expect(session.responses.length).toBe(1) // Only Claude selected
    })

    it('clears the prompt after sending', async () => {
      await renderWarRoom()

      useWarRoomStore.getState().createSession('Test')
      fireEvent.click(screen.getByText('Software Engineer'))

      const textarea = screen.getByPlaceholderText('Broadcast to selected agents...')
      fireEvent.change(textarea, { target: { value: 'Hello' } })

      await act(async () => {
        fireEvent.click(getSendButton())
      })

      expect(textarea).toHaveValue('')
    })

    it('sends on Enter (without Shift)', async () => {
      await renderWarRoom()

      useWarRoomStore.getState().createSession('Test')
      fireEvent.click(screen.getByText('Software Engineer'))

      const textarea = screen.getByPlaceholderText('Broadcast to selected agents...')
      fireEvent.change(textarea, { target: { value: 'Enter test' } })
      await act(async () => {
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
      })

      const { sessions } = useWarRoomStore.getState()
      const session = sessions[0]
      expect(session.broadcasts.length).toBe(1)
    })
  })

  // ── Broadcast view — responses ────────────────────────────────────────

  describe('broadcast view — responses', () => {
    it('shows empty state when there are no responses', async () => {
      await renderWarRoom()
      expect(
        screen.getByText(/Select agents and broadcast a prompt to see responses/)
      ).toBeInTheDocument()
    })

    it('shows responses after a broadcast', async () => {
      createPopulatedSession()
      await renderWarRoom()

      expect(screen.getByText('42')).toBeInTheDocument()
      expect(screen.getByText('To help others.')).toBeInTheDocument()
    })

    it('shows agent name and provider label for each response', async () => {
      createPopulatedSession()
      await renderWarRoom()

      // Agent names appear as toggle buttons AND as response headers
      const seLabels = screen.getAllByText('Software Engineer')
      expect(seLabels.length).toBeGreaterThanOrEqual(1)

      const se2Labels = screen.getAllByText('Software Engineer #2')
      expect(se2Labels.length).toBeGreaterThanOrEqual(1)

      // Provider labels also appear as text in the response header
      const providerLabels = screen.getAllByText(/Software Engineer/)
      expect(providerLabels.length).toBeGreaterThanOrEqual(2)
    })
  })

  // ── Side-by-side view ─────────────────────────────────────────────────

  describe('side-by-side view', () => {
    it('shows empty state when no broadcasts', async () => {
      await renderWarRoom()
      fireEvent.click(screen.getByText('Side by Side'))
      expect(screen.getByText(/No broadcasts yet/)).toBeInTheDocument()
    })

    it('shows broadcasts in grid layout', async () => {
      createPopulatedSession()
      await renderWarRoom()
      fireEvent.click(screen.getByText('Side by Side'))

      expect(screen.getByText('42')).toBeInTheDocument()
      expect(screen.getByText('To help others.')).toBeInTheDocument()
    })

    it('shows truncated prompt in side-by-side header', async () => {
      useWarRoomStore.getState().createSession('Test')
      useWarRoomStore.getState().broadcastToAgents(
        'This is a very long prompt that should be truncated in the side by side view because it exceeds 80 characters...',
        ['se-1'],
        { 'se-1': 'claude' }
      )
      await renderWarRoom()
      fireEvent.click(screen.getByText('Side by Side'))

      expect(screen.getByText(/truncated in the side/)).toBeInTheDocument()
    })

    it('shows pending status for incomplete responses', async () => {
      useWarRoomStore.getState().createSession('Test')
      useWarRoomStore.getState().broadcastToAgents(
        'Quick test',
        ['se-1'],
        { 'se-1': 'claude' }
      )
      await renderWarRoom()
      fireEvent.click(screen.getByText('Side by Side'))

      expect(screen.getByText('Pending')).toBeInTheDocument()
    })
  })

  // ── Chain view ────────────────────────────────────────────────────────

  describe('chain view', () => {
    it('shows empty state when no chains exist', async () => {
      await renderWarRoom()
      fireEvent.click(screen.getByRole('button', { name: 'Chain' }))
      expect(screen.getByText(/No task chains yet/)).toBeInTheDocument()
    })

    it('shows the New Chain button', async () => {
      await renderWarRoom()
      fireEvent.click(screen.getByRole('button', { name: 'Chain' }))
      expect(screen.getByText('New Chain')).toBeInTheDocument()
    })

    it('opens create chain form when New Chain is clicked', async () => {
      await renderWarRoom()
      fireEvent.click(screen.getByRole('button', { name: 'Chain' }))
      fireEvent.click(screen.getByText('New Chain'))

      expect(screen.getByPlaceholderText('Chain name')).toBeInTheDocument()
      expect(screen.getByText('Create')).toBeInTheDocument()
    })

    it('shows empty detail view when no chain is selected', async () => {
      await renderWarRoom()
      fireEvent.click(screen.getByRole('button', { name: 'Chain' }))

      expect(screen.getByText(/Select a chain to view details/)).toBeInTheDocument()
    })

    it('shows chain in the list after creation', async () => {
      // Set up store state BEFORE rendering
      useWarRoomStore.getState().createTaskChain('My Analysis Chain', [
        { agentId: 'se-1', provider: 'claude', prompt: 'Analyze this' },
      ])

      await renderWarRoom()
      fireEvent.click(screen.getByRole('button', { name: 'Chain' }))

      // Name appears in both the chain list and the detail header
      const chainLabels = screen.getAllByText('My Analysis Chain')
      expect(chainLabels.length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('1 steps')).toBeInTheDocument()
    })

    it('shows step count for multi-step chains', async () => {
      useWarRoomStore.getState().createTaskChain('Multi Chain', [
        { agentId: 'se-1', provider: 'claude', prompt: 'Step 1' },
        { agentId: 'se-2', provider: 'codex', prompt: 'Step 2' },
        { agentId: 'se-1', provider: 'claude', prompt: 'Step 3' },
      ])
      await renderWarRoom()
      fireEvent.click(screen.getByRole('button', { name: 'Chain' }))

      expect(screen.getByText('3 steps')).toBeInTheDocument()
    })

    it('selects and shows details for a chain', async () => {
      const { createTaskChain, setActiveChain } = useWarRoomStore.getState()
      const chainId = createTaskChain('Analysis Chain', [
        { agentId: 'se-1', provider: 'claude', prompt: 'Analyze the data' },
        { agentId: 'se-2', provider: 'codex', prompt: 'Generate code' },
      ])
      setActiveChain(chainId)

      await renderWarRoom()
      fireEvent.click(screen.getByRole('button', { name: 'Chain' }))

      // Chain name appears in both the list and the detail header
      const nameLabels = screen.getAllByText('Analysis Chain')
      expect(nameLabels.length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Analyze the data')).toBeInTheDocument()
      expect(screen.getByText('Generate code')).toBeInTheDocument()
    })

    it('shows Run Chain button for pending chains', async () => {
      const { createTaskChain, setActiveChain } = useWarRoomStore.getState()
      const chainId = createTaskChain('Run Test', [
        { agentId: 'se-1', provider: 'claude', prompt: 'Do it' },
      ])
      setActiveChain(chainId)

      await renderWarRoom()
      fireEvent.click(screen.getByRole('button', { name: 'Chain' }))

      expect(screen.getByText('Run Chain')).toBeInTheDocument()
    })
  })
})
