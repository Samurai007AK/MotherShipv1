import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConversationHistory } from '../../components/terminal/ConversationHistory'
import type { ChatMessage } from '../../lib/modelRouter'

// ── jsdom polyfills ────────────────────────────────────────────────────────

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

// ── Mock Tauri invoke (required by setup pattern) ──────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// ── Mock data ──────────────────────────────────────────────────────────────

const SYS: ChatMessage = { role: 'system', content: 'You are a helpful assistant.' }
const U1: ChatMessage = { role: 'user', content: 'How do I parse JSON in Rust?' }
const A1: ChatMessage = { role: 'assistant', content: 'Use serde_json::from_str.' }
const U2: ChatMessage = { role: 'user', content: 'Show me an example.' }
const A2: ChatMessage = { role: 'assistant', content: 'let v: Value = serde_json::from_str(s)?;' }
const U3: ChatMessage = { role: 'user', content: 'Thanks!' } // orphan, no reply

const LONG_USER: ChatMessage = {
  role: 'user',
  content: 'x'.repeat(200),
}

// ── Helpers ────────────────────────────────────────────────────────────────

interface RenderOpts {
  messages?: ChatMessage[]
  isOpen?: boolean
  onJumpToExchange?: (i: number) => void
  onClose?: () => void
}

function renderHistory(opts: RenderOpts = {}) {
  const onJumpToExchange = opts.onJumpToExchange ?? vi.fn()
  const onClose = opts.onClose ?? vi.fn()
  const result = render(
    <ConversationHistory
      messages={opts.messages ?? []}
      agentId="claude"
      isOpen={opts.isOpen ?? true}
      onClose={onClose}
      onJumpToExchange={onJumpToExchange}
    />
  )
  return { onJumpToExchange, onClose, ...result }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ConversationHistory', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // ── Open / closed ────────────────────────────────────────────────────────

  describe('open and closed state', () => {
    it('returns null when isOpen is false', () => {
      const { container } = renderHistory({ isOpen: false })
      expect(container.innerHTML).toBe('')
    })

    it('renders the panel when isOpen is true', () => {
      renderHistory({ isOpen: true })
      expect(screen.getByText('History')).toBeInTheDocument()
    })
  })

  // ── Header ───────────────────────────────────────────────────────────────

  describe('header', () => {
    it('shows the message count badge for non-system messages', () => {
      renderHistory({ messages: [SYS, U1, A1, U2, A2] })
      // 5 messages, 1 system → 4 non-system.
      expect(screen.getByText('4')).toBeInTheDocument()
    })

    it('calls onClose when the close button is clicked', () => {
      const { onClose } = renderHistory()
      fireEvent.click(screen.getByTitle('Close history panel'))
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  // ── Empty state ──────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('shows the empty-state message when there are no messages', () => {
      renderHistory({ messages: [] })
      expect(screen.getByText('No conversation history yet.')).toBeInTheDocument()
    })

    it('shows the empty-state message when there are only system messages', () => {
      renderHistory({ messages: [SYS] })
      expect(screen.getByText('No conversation history yet.')).toBeInTheDocument()
    })

    it('does not show the empty-state message when exchanges exist', () => {
      renderHistory({ messages: [U1, A1] })
      expect(screen.queryByText('No conversation history yet.')).not.toBeInTheDocument()
    })
  })

  // ── buildExchanges logic (exercised through the UI) ──────────────────────

  describe('exchange grouping (buildExchanges)', () => {
    it('groups a user+assistant pair into one exchange', () => {
      renderHistory({ messages: [U1, A1] })
      expect(screen.getByText('How do I parse JSON in Rust?')).toBeInTheDocument()
      expect(screen.getByText('Use serde_json::from_str.')).toBeInTheDocument()
    })

    it('groups multiple consecutive pairs into separate exchanges', () => {
      renderHistory({ messages: [U1, A1, U2, A2] })
      // Footer reads "N exchanges"
      expect(screen.getByText(/2 exchanges/)).toBeInTheDocument()
    })

    it('counts a single exchange as singular', () => {
      renderHistory({ messages: [U1, A1] })
      expect(screen.getByText(/1 exchange ·/)).toBeInTheDocument()
    })

    it('includes an orphan trailing user message as its own exchange', () => {
      renderHistory({ messages: [U1, A1, U3] })
      // Three exchanges total: pair, then orphan user.
      expect(screen.getByText(/2 exchanges/)).toBeInTheDocument()
      expect(screen.getByText('Thanks!')).toBeInTheDocument()
    })

    it('handles two consecutive user messages as two separate exchanges', () => {
      renderHistory({ messages: [U1, U3] })
      expect(screen.getByText(/2 exchanges/)).toBeInTheDocument()
      // Orphan exchange has no assistant content rendered.
      expect(screen.getByText('How do I parse JSON in Rust?')).toBeInTheDocument()
      expect(screen.getByText('Thanks!')).toBeInTheDocument()
    })

    it('ignores a leading assistant message with no preceding user', () => {
      renderHistory({ messages: [A1, U1, A2] })
      // Only the U1+A2 pair forms one exchange; A1 is dropped.
      expect(screen.getByText(/1 exchange ·/)).toBeInTheDocument()
      expect(screen.getByText('How do I parse JSON in Rust?')).toBeInTheDocument()
    })
  })

  // ── Preview truncation ───────────────────────────────────────────────────

  describe('preview truncation', () => {
    it('renders the full user content when it is short', () => {
      renderHistory({ messages: [U1, A1] })
      expect(screen.getByText('How do I parse JSON in Rust?')).toBeInTheDocument()
    })

    it('uses line-clamp to visually truncate long content', () => {
      renderHistory({ messages: [LONG_USER] })
      const el = screen.getByText('x'.repeat(200))
      expect(el.className).toContain('line-clamp-2')
    })
  })

  // ── Footer ───────────────────────────────────────────────────────────────

  describe('footer', () => {
    it('shows the exchange count and hint text', () => {
      renderHistory({ messages: [U1, A1, U2, A2] })
      expect(screen.getByText(/2 exchanges · Click to reference in input/)).toBeInTheDocument()
    })
  })

  // ── Interaction ──────────────────────────────────────────────────────────

  describe('interaction', () => {
    it('calls onJumpToExchange with the exchange index when an entry is clicked', () => {
      const onJumpToExchange = vi.fn()
      renderHistory({ messages: [U1, A1, U2, A2], onJumpToExchange })
      // Each exchange is a <button>; click the second one.
      const buttons = document.querySelectorAll('button')
      // First button is the close X, then the exchange buttons.
      const exchangeButtons = Array.from(buttons).filter(
        (b) => !b.querySelector('.lucide-x')
      )
      fireEvent.click(exchangeButtons[1])
      expect(onJumpToExchange).toHaveBeenCalledWith(1)
    })

    it('writes the exchange text to the clipboard when Copy is clicked', () => {
      const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
      renderHistory({ messages: [U1, A1] })
      fireEvent.click(screen.getByText('Copy'))
      expect(writeText).toHaveBeenCalledTimes(1)
      const copied = writeText.mock.calls[0][0]
      expect(copied).toContain('User: How do I parse JSON in Rust?')
      expect(copied).toContain('claude: Use serde_json::from_str.')
    })
  })
})
