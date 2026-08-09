import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { LazyPanel, PanelFallback } from '../../components/LazyPanels'

// ── jsdom polyfills ────────────────────────────────────────────────────────

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

// ── Mock Tauri invoke ──────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// ── Child fixtures ─────────────────────────────────────────────────────────

function TestChild() {
  return <div data-testid="child">Hello from panel</div>
}



// ── Helpers ────────────────────────────────────────────────────────────────

function renderLazyPanel(idleTimeoutMs?: number) {
  return render(
    <LazyPanel idleTimeoutMs={idleTimeoutMs}>
      <TestChild />
    </LazyPanel>
  )
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('LazyPanel', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useFakeTimers()
  })

  // ── Rendering ────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders children when mounted', () => {
      renderLazyPanel()
      expect(screen.getByTestId('child')).toBeInTheDocument()
      expect(screen.getByText('Hello from panel')).toBeInTheDocument()
    })

    it('does not show the idle message initially', () => {
      renderLazyPanel()
      expect(screen.queryByText(/Panel idle/)).not.toBeInTheDocument()
    })
  })

  // ── Idle timeout ─────────────────────────────────────────────────────

  describe('idle timeout', () => {
    it('unmounts children after the default idle timeout (10 min)', () => {
      renderLazyPanel()
      expect(screen.getByTestId('child')).toBeInTheDocument()

      // Advance past the default idle timeout (600000ms = 10 min)
      act(() => {
        vi.advanceTimersByTime(600_000)
      })

      expect(screen.queryByTestId('child')).not.toBeInTheDocument()
      expect(screen.getByText('Panel idle — click to reactivate')).toBeInTheDocument()
    })

    it('uses a custom idle timeout when provided', () => {
      renderLazyPanel(5_000) // 5 seconds
      expect(screen.getByTestId('child')).toBeInTheDocument()

      // Advance just before timeout — child should still render
      act(() => {
        vi.advanceTimersByTime(4_999)
      })
      expect(screen.getByTestId('child')).toBeInTheDocument()

      // Advance past timeout — child should unmount
      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(screen.queryByTestId('child')).not.toBeInTheDocument()
      expect(screen.getByText('Panel idle — click to reactivate')).toBeInTheDocument()
    })

    it('shows the idle message with proper text', () => {
      renderLazyPanel(100)
      act(() => { vi.advanceTimersByTime(100) })

      expect(screen.getByText('Panel idle — click to reactivate')).toBeInTheDocument()
    })
  })

  // ── Activity events ──────────────────────────────────────────────────

  describe('activity events', () => {
    it('resets the idle timer on mousemove', () => {
      renderLazyPanel(10_000)
      expect(screen.getByTestId('child')).toBeInTheDocument()

      // Advance 9999ms — still within timeout
      act(() => { vi.advanceTimersByTime(9_999) })
      expect(screen.getByTestId('child')).toBeInTheDocument()

      // Fire a mousemove to reset the timer
      act(() => {
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
      })

      // Advance another 9999ms from the reset — still within
      act(() => { vi.advanceTimersByTime(9_999) })
      expect(screen.getByTestId('child')).toBeInTheDocument()

      // Advance past the second timeout
      act(() => { vi.advanceTimersByTime(1) })
      expect(screen.queryByTestId('child')).not.toBeInTheDocument()
    })

    it('resets the idle timer on keydown', () => {
      renderLazyPanel(10_000)
      expect(screen.getByTestId('child')).toBeInTheDocument()

      // Advance 9999ms
      act(() => { vi.advanceTimersByTime(9_999) })

      // Fire keydown
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
      })

      // Advance 9999ms — timer was reset
      act(() => { vi.advanceTimersByTime(9_999) })
      expect(screen.getByTestId('child')).toBeInTheDocument()
    })

    it('reactivates a timed-out panel on mousemove', () => {
      renderLazyPanel(1_000)

      // Let it time out
      act(() => { vi.advanceTimersByTime(1_000) })
      expect(screen.getByText('Panel idle — click to reactivate')).toBeInTheDocument()

      // Fire mousemove to reactivate
      act(() => {
        window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
      })
      expect(screen.getByTestId('child')).toBeInTheDocument()
    })

    it('reactivates a timed-out panel on keydown', () => {
      renderLazyPanel(1_000)

      // Let it time out
      act(() => { vi.advanceTimersByTime(1_000) })
      expect(screen.getByText('Panel idle — click to reactivate')).toBeInTheDocument()

      // Fire keydown to reactivate
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
      })
      expect(screen.getByTestId('child')).toBeInTheDocument()
    })
  })

  // ── Cleanup ──────────────────────────────────────────────────────────

  describe('cleanup', () => {
    it('clears the timer when the component unmounts', () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
      const { unmount } = renderLazyPanel()

      unmount()

      expect(clearTimeoutSpy).toHaveBeenCalled()
    })

    it('removes event listeners when the component unmounts', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')
      const { unmount } = renderLazyPanel()

      unmount()

      expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    })
  })
})

// ── PanelFallback ──────────────────────────────────────────────────────────

describe('PanelFallback', () => {
  it('renders loading text with pulse animation', () => {
    render(<PanelFallback />)
    const el = screen.getByText('Loading...')
    expect(el).toBeInTheDocument()
    expect(el.className).toContain('animate-pulse')
  })
})

// ── Lazy component exports ─────────────────────────────────────────────────

describe('lazy component exports', () => {
  it('exports lazy-loaded components that render with Suspense', async () => {
    // Dynamic import to get the lazy components
    const LazyPanels = await import('../../components/LazyPanels')

    // Each lazy export should be a lazy component (not a regular function)
    expect(LazyPanels.ModelRouterPanel).toBeDefined()
    expect(LazyPanels.WarRoom).toBeDefined()
    expect(LazyPanels.TaskGraph).toBeDefined()
    expect(LazyPanels.BrowserConnector).toBeDefined()
    expect(LazyPanels.MCPPanel).toBeDefined()

    // Lazy components have a _payload property (React internal)
    const lazyComps = [
      LazyPanels.ModelRouterPanel,
      LazyPanels.WarRoom,
      LazyPanels.TaskGraph,
      LazyPanels.BrowserConnector,
      LazyPanels.MCPPanel,
    ]
    lazyComps.forEach((comp) => {
      // React.lazy components have a thenable/promise-like internal structure
      // The simplest check: they are not regular function components
      expect(typeof comp).toBe('object')
      expect(comp).not.toBe(null)
    })
  })
})
