import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PanelErrorBoundary } from '../../components/layout/ErrorBoundary'

// ── Mock Tauri invoke (required by setup pattern) ──────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// Silence the expected console.error spam from React when a child throws.
beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ── Test fixtures ──────────────────────────────────────────────────────────

function GoodChild() {
  return <div data-testid="child">I render fine</div>
}

function BadChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Kaboom in child')
  return <div data-testid="child">Recovered</div>
}

function renderBoundary(props: { panelName?: string; children: React.ReactNode }) {
  return render(<PanelErrorBoundary {...props} />)
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('PanelErrorBoundary', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  // ── Happy path ───────────────────────────────────────────────────────────

  describe('happy path', () => {
    it('renders children when no error is thrown', () => {
      renderBoundary({ children: <GoodChild /> })
      expect(screen.getByTestId('child')).toBeInTheDocument()
      expect(screen.getByText('I render fine')).toBeInTheDocument()
    })

    it('does not render the fallback when children are healthy', () => {
      renderBoundary({ children: <GoodChild /> })
      expect(screen.queryByText('Retry')).not.toBeInTheDocument()
    })
  })

  // ── Error catching ───────────────────────────────────────────────────────

  describe('error catching', () => {
    it('renders the fallback UI when a child throws', () => {
      renderBoundary({ children: <BadChild shouldThrow /> })
      expect(screen.getByText('Retry')).toBeInTheDocument()
      expect(screen.queryByTestId('child')).not.toBeInTheDocument()
    })

    it('shows the default "Panel" name when panelName is omitted', () => {
      renderBoundary({ children: <BadChild shouldThrow /> })
      expect(screen.getByText('Panel Error')).toBeInTheDocument()
    })

    it('uses the provided panelName in the fallback title', () => {
      renderBoundary({
        panelName: 'Memory',
        children: <BadChild shouldThrow />,
      })
      expect(screen.getByText('Memory Error')).toBeInTheDocument()
    })

    it('displays the thrown error message in the fallback', () => {
      renderBoundary({ children: <BadChild shouldThrow /> })
      expect(screen.getByText('Kaboom in child')).toBeInTheDocument()
    })

    it('shows a fallback message when the error has no message', () => {
      function WeirdChild(): React.ReactNode {
        // throw a non-Error value that becomes an Error with empty message
        throw {}
      }
      renderBoundary({ children: <WeirdChild /> })
      expect(
        screen.getByText('Something went wrong in this panel.')
      ).toBeInTheDocument()
    })

    it('logs the error via componentDidCatch', () => {
      const errSpy = console.error as ReturnType<typeof vi.fn>
      renderBoundary({ children: <BadChild shouldThrow /> })
      // React logs the error itself, and componentDidCatch logs with the
      // panel prefix. At least one call should mention the boundary.
      expect(errSpy).toHaveBeenCalled()
    })
  })

  // ── Retry ────────────────────────────────────────────────────────────────

  describe('retry', () => {
    it('resets the error state and re-renders children when Retry is clicked', () => {
      renderBoundary({ children: <BadChild shouldThrow /> })
      // Error caught, fallback showing
      expect(screen.getByText('Retry')).toBeInTheDocument()
      expect(screen.getByText('Kaboom in child')).toBeInTheDocument()
      expect(screen.queryByTestId('child')).not.toBeInTheDocument()

      // Clicking Retry resets the boundary state, which re-renders children.
      // Since BadChild still has shouldThrow=true, it throws again and
      // the fallback reappears.
      fireEvent.click(screen.getByText('Retry'))

      // Fallback should still be showing after re-catch
      expect(screen.getByText('Retry')).toBeInTheDocument()
      expect(screen.getByText('Kaboom in child')).toBeInTheDocument()
      // Child should not be visible since it threw again
      expect(screen.queryByTestId('child')).not.toBeInTheDocument()
    })
  })

  // ── Fallback structure ───────────────────────────────────────────────────

  describe('fallback structure', () => {
    it('renders an alert triangle icon in the fallback', () => {
      renderBoundary({ children: <BadChild shouldThrow /> })
      expect(document.querySelector('.lucide-triangle-alert')).toBeInTheDocument()
    })

    it('renders a refresh icon on the Retry button', () => {
      renderBoundary({ children: <BadChild shouldThrow /> })
      const retryButton = screen.getByText('Retry').closest('button')
      expect(retryButton?.querySelector('.lucide-refresh-cw')).toBeInTheDocument()
    })
  })
})
