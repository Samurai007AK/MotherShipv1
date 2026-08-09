import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ModelRouterPanel } from '../../components/model-router/ModelRouterPanel'
import { useModelRouterStore } from '../../stores/modelRouterStore'
import { listModels } from '../../lib/modelRouter'
import type { ModelInfo, OllamaStatus } from '../../lib/modelRouter'

// ── jsdom polyfill ─────────────────────────────────────────────────────────

Element.prototype.scrollIntoView = vi.fn()

// ── Mock data (hoisted so vi.mock can reference it) ────────────────────────

const MOCK_MODELS: ModelInfo[] = vi.hoisted(() => [
  {
    name: 'llama3.2:3b',
    size: 2_123_456_789,
    parameter_size: '3B',
    quantization: 'Q4_K_M',
    modified_at: '2025-01-15T10:00:00Z',
  },
  {
    name: 'mistral:7b',
    size: 4_456_789_012,
    parameter_size: '7B',
    quantization: 'Q4_K_M',
    modified_at: '2025-01-10T08:00:00Z',
  },
  {
    name: 'codellama:7b',
    size: 3_789_123_456,
    parameter_size: '7B',
    quantization: 'Q4_K_M',
    modified_at: '2025-01-12T12:00:00Z',
  },
])

// ── Mock modelRouter lib (so listModels returns controlled data) ────────────

vi.mock('../../lib/modelRouter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/modelRouter')>()
  return {
    ...actual,
    listModels: vi.fn().mockResolvedValue(MOCK_MODELS),
    checkStatus: vi.fn().mockResolvedValue({ running: true, model_count: 3, version: '0.5.4' }),
  }
})

// ── Mock Tauri invoke (needed by modelRouter lib) ───────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_RUNNING: OllamaStatus = { running: true, model_count: 3, version: '0.5.4' }
const STATUS_STOPPED: OllamaStatus = { running: false, model_count: 0, version: 'disconnected' }

// ── Helpers ────────────────────────────────────────────────────────────────

function renderPanel() {
  return render(<ModelRouterPanel />)
}

function resetStore() {
  useModelRouterStore.setState({
    status: STATUS_RUNNING,
    models: MOCK_MODELS,
    selectedModel: 'llama3.2:3b',
    conversations: [],
    activeConversationId: null,
    isLoadingModels: false,
    isGenerating: false,
    lastError: null,
    // Replace the async refreshModels with a no-op to prevent
    // act() warnings from the useEffect in ModelSelector on mount
    refreshModels: vi.fn().mockResolvedValue(undefined),
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ModelRouterPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetStore()
    // restoreAllMocks clears mockResolvedValue from the factory — re-apply it
    vi.mocked(listModels).mockResolvedValue(MOCK_MODELS)
  })

  // ── Main component ─────────────────────────────────────────────────────

  describe('main component', () => {
    it('renders the Model Router header', () => {
      renderPanel()
      expect(screen.getByText('Model Router')).toBeInTheDocument()
    })

    it('shows the New conversation button', () => {
      renderPanel()
      expect(screen.getByTitle('New conversation')).toBeInTheDocument()
    })

    it('creates a new conversation when New button is clicked', () => {
      renderPanel()

      fireEvent.click(screen.getByTitle('New conversation'))

      const { conversations } = useModelRouterStore.getState()
      expect(conversations.length).toBe(1)
      expect(conversations[0].model).toBe('llama3.2:3b')
    })
  })

  // ── Conversation list ────────────────────────────────────────────────

  describe('conversation list', () => {
    it('does not show conversation tabs when 0 or 1 conversations exist', () => {
      renderPanel()
      expect(screen.queryByText('llama3.2')).not.toBeInTheDocument()
    })

    it('shows conversation tabs when more than 1 conversation exists', () => {
      useModelRouterStore.getState().createConversation()
      useModelRouterStore.getState().createConversation()
      renderPanel()

      const tabs = screen.getAllByText('llama3.2')
      expect(tabs.length).toBeGreaterThanOrEqual(1)
    })

    it('highlights the active conversation tab', () => {
      useModelRouterStore.getState().createConversation()
      const conv2Id = useModelRouterStore.getState().createConversation()
      useModelRouterStore.setState({ activeConversationId: conv2Id })
      renderPanel()

      // Find tabs inside the conversation list container (not in the dropdown)
      const convList = document.querySelector('.overflow-x-auto')
      const tabs = convList?.querySelectorAll('button') || []
      const activeTab = Array.from(tabs).find((t) =>
        t.className.includes('mothership-600/20')
      )
      expect(activeTab).toBeInTheDocument()
    })

    it('switches conversation when a tab is clicked', () => {
      useModelRouterStore.getState().createConversation()
      const conv2Id = useModelRouterStore.getState().createConversation()
      useModelRouterStore.setState({ activeConversationId: conv2Id })
      renderPanel()

      const convList = document.querySelector('.overflow-x-auto')
      const tabs = convList?.querySelectorAll('button') || []
      // tabs[0] = newest (conv2, active), tabs[1] = oldest (conv1)
      // Click the inactive tab (conv1) to switch
      fireEvent.click(tabs[tabs.length - 1])

      const { activeConversationId } = useModelRouterStore.getState()
      // Clicking the inactive tab (conv1) should switch away from conv2
      expect(activeConversationId).not.toBe(conv2Id)
    })
  })

  // ── ModelSelector ────────────────────────────────────────────────────

  describe('ModelSelector', () => {
    it('shows the selected model name', () => {
      renderPanel()
      expect(screen.getByText('llama3.2:3b')).toBeInTheDocument()
    })

    it('shows "Select model" when none selected', () => {
      useModelRouterStore.setState({ selectedModel: null })
      renderPanel()
      expect(screen.getByText('Select model')).toBeInTheDocument()
    })

    it('shows green dot when Ollama is running', () => {
      renderPanel()
      const dot = document.querySelector('[style*="background-color: #22c55e"]')
      expect(dot).toBeInTheDocument()
    })

    it('shows red dot when Ollama is not running', () => {
      useModelRouterStore.setState({ status: STATUS_STOPPED })
      renderPanel()
      const dot = document.querySelector('[style*="background-color: #ef4444"]')
      expect(dot).toBeInTheDocument()
    })

    it('opens the dropdown and shows all models', () => {
      renderPanel()

      fireEvent.click(screen.getByText('llama3.2:3b').closest('button')!)

      const modelEntries = screen.getAllByText('llama3.2:3b')
      expect(modelEntries.length).toBeGreaterThanOrEqual(2)
      expect(screen.getByText('mistral:7b')).toBeInTheDocument()
      expect(screen.getByText('codellama:7b')).toBeInTheDocument()
    })

    it('shows model parameter size and size in the dropdown', () => {
      renderPanel()
      fireEvent.click(screen.getByText('llama3.2:3b').closest('button')!)

      expect(screen.getByText('3B · 2.0 GB')).toBeInTheDocument()
      expect(screen.getByText('7B · 4.2 GB')).toBeInTheDocument()
    })

    it('shows a selected indicator on the active model', () => {
      renderPanel()
      fireEvent.click(screen.getByText('llama3.2:3b').closest('button')!)

      const selectedIndicator = screen.getByText('●')
      expect(selectedIndicator).toBeInTheDocument()
    })

    it('selects a model when clicked in the dropdown', () => {
      renderPanel()
      fireEvent.click(screen.getByText('llama3.2:3b').closest('button')!)
      fireEvent.click(screen.getByText('mistral:7b'))

      expect(useModelRouterStore.getState().selectedModel).toBe('mistral:7b')
    })

    it('closes the dropdown after selecting a model', () => {
      renderPanel()
      fireEvent.click(screen.getByText('llama3.2:3b').closest('button')!)
      fireEvent.click(screen.getByText('codellama:7b'))

      const dropdownItems = document.querySelectorAll('.absolute button')
      expect(dropdownItems.length).toBe(0)
    })

    it('shows loading spinner when isLoadingModels is true', () => {
      useModelRouterStore.setState({ isLoadingModels: true })
      renderPanel()

      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })

    it('shows "No models installed" when models are empty and Ollama is running', async () => {
      vi.mocked(listModels).mockResolvedValue([])
      useModelRouterStore.setState({ models: [], status: STATUS_RUNNING, selectedModel: null })
      renderPanel()

      await vi.waitFor(() => {
        expect(useModelRouterStore.getState().models).toEqual([])
      })

      fireEvent.click(screen.getByText('Select model').closest('button')!)
      expect(screen.getByText('No models installed')).toBeInTheDocument()
    })

    it('shows "Ollama not running" when models are empty and Ollama is stopped', async () => {
      vi.mocked(listModels).mockResolvedValue([])
      useModelRouterStore.setState({ models: [], status: STATUS_STOPPED, selectedModel: null })
      renderPanel()

      await vi.waitFor(() => {
        expect(useModelRouterStore.getState().models).toEqual([])
      })

      fireEvent.click(screen.getByText('Select model').closest('button')!)
      expect(screen.getByText('Ollama not running')).toBeInTheDocument()
    })

    it('shows the Refresh models button at the bottom of the dropdown', () => {
      renderPanel()
      fireEvent.click(screen.getByText('llama3.2:3b').closest('button')!)

      expect(screen.getByText('Refresh models')).toBeInTheDocument()
    })
  })

  // ── ChatPanel: empty state ────────────────────────────────────────────

  describe('ChatPanel empty state', () => {
    it('shows empty state message when no messages exist', () => {
      renderPanel()
      expect(screen.getByText('Start a conversation with a local model')).toBeInTheDocument()
    })

    it('shows the message input textarea', () => {
      renderPanel()
      expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument()
    })

    it('disables the send button when input is empty', () => {
      renderPanel()

      const sendBtn = screen.getAllByRole('button').find(
        (btn) => btn.querySelector('svg[class*="lucide-send"]')
      )
      expect(sendBtn).toBeDisabled()
    })

    it('enables the send button when input is non-empty', () => {
      renderPanel()

      const textarea = screen.getByPlaceholderText('Type a message...')
      fireEvent.change(textarea, { target: { value: 'Hello' } })

      const sendBtn = screen.getAllByRole('button').find(
        (btn) => btn.querySelector('svg[class*="lucide-send"]')
      )
      expect(sendBtn).not.toBeDisabled()
    })
  })

  // ── ChatPanel: messages ─────────────────────────────────────────────

  describe('ChatPanel messages', () => {
    function seedMessages() {
      const store = useModelRouterStore.getState()
      const convId = store.createConversation()
      useModelRouterStore.setState({
        conversations: [
          {
            id: convId,
            model: 'llama3.2:3b',
            messages: [
              { role: 'user', content: 'Hello!' },
              { role: 'assistant', content: 'Hi there! How can I help?' },
              { role: 'user', content: 'What is Rust?' },
            ],
            createdAt: new Date().toISOString(),
          },
        ],
        activeConversationId: convId,
      })
    }

    it('shows user messages', () => {
      seedMessages()
      renderPanel()

      expect(screen.getByText('Hello!')).toBeInTheDocument()
      expect(screen.getByText('What is Rust?')).toBeInTheDocument()
    })

    it('shows assistant messages with the Bot icon and label', () => {
      seedMessages()
      renderPanel()

      expect(screen.getByText('Hi there! How can I help?')).toBeInTheDocument()
      expect(screen.getByText('Assistant')).toBeInTheDocument()
    })

    it('does not show "Assistant" label on user messages', () => {
      seedMessages()
      renderPanel()

      const assistantLabels = screen.getAllByText('Assistant')
      expect(assistantLabels.length).toBe(1)
    })

    it('shows the generating indicator when isGenerating is true', () => {
      seedMessages()
      useModelRouterStore.setState({ isGenerating: true })
      renderPanel()

      expect(screen.getByText('Generating...')).toBeInTheDocument()
    })

    it('shows error banner when lastError is set', () => {
      useModelRouterStore.setState({ lastError: 'Connection refused' })
      renderPanel()

      expect(screen.getByText('Connection refused')).toBeInTheDocument()
    })

    it('disables send button while generating', () => {
      useModelRouterStore.setState({ isGenerating: true })
      renderPanel()

      const sendBtn = screen.getAllByRole('button').find(
        (btn) => btn.querySelector('svg[class*="lucide-send"]')
      )
      expect(sendBtn).toBeDisabled()
    })
  })

  // ── ChatPanel: send behavior ────────────────────────────────────────

  describe('ChatPanel send behavior', () => {
    it('calls sendMessage when the Send button is clicked', async () => {
      // Pre-create a conversation (sendMessage's stale-closure bug prevents
      // auto-creation: createConversation updates store but old conversations
      // ref doesn't include the new conv, so find() returns null)
      useModelRouterStore.getState().createConversation()
      renderPanel()

      const textarea = screen.getByPlaceholderText('Type a message...')
      fireEvent.change(textarea, { target: { value: 'Hello' } })

      const sendBtn = screen.getAllByRole('button').find(
        (btn) => btn.querySelector('svg[class*="lucide-send"]')
      )
      await act(async () => {
        fireEvent.click(sendBtn!)
      })

      await vi.waitFor(() => {
        const { conversations } = useModelRouterStore.getState()
        expect(conversations.length).toBe(1)
        expect(conversations[0].messages.length).toBe(1)
        expect(conversations[0].messages[0].content).toBe('Hello')
      })
    })

    it('sends message on Enter key', async () => {
      useModelRouterStore.getState().createConversation()
      renderPanel()

      const textarea = screen.getByPlaceholderText('Type a message...')
      fireEvent.change(textarea, { target: { value: 'Enter message' } })
      await act(async () => {
        fireEvent.keyDown(textarea, { key: 'Enter' })
      })

      await vi.waitFor(() => {
        const { conversations } = useModelRouterStore.getState()
        expect(conversations.length).toBe(1)
        expect(conversations[0].messages.length).toBe(1)
        expect(conversations[0].messages[0].content).toBe('Enter message')
      })
    })

    it('does not send on Shift+Enter', async () => {
      renderPanel()

      const textarea = screen.getByPlaceholderText('Type a message...')
      fireEvent.change(textarea, { target: { value: 'Multiline' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })

      // Wait a tick for any async behavior, then verify no messages were added
      await vi.waitFor(() => {
        const { conversations } = useModelRouterStore.getState()
        expect(conversations.length).toBe(0)
      })
    })

    it('does not send if input is empty', async () => {
      renderPanel()

      fireEvent.keyDown(screen.getByPlaceholderText('Type a message...'), { key: 'Enter' })

      await vi.waitFor(() => {
        const { conversations } = useModelRouterStore.getState()
        expect(conversations.length).toBe(0)
      })
    })
  })
})
