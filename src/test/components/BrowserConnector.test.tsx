import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrowserConnector } from '../../components/browser/BrowserConnector'

// ── Mock @tauri-apps/api/core for invoke ──────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({ label: 'browser-test', url: 'https://example.com', title: 'Test' }),
}))

// ── Spy on navigator.clipboard (already mocked in setup.ts) ───────────────

let mockWriteText: ReturnType<typeof vi.fn>

// ── Mock window.open ───────────────────────────────────────────────────────

const mockOpen = vi.fn()
window.open = mockOpen

// ── Helpers ────────────────────────────────────────────────────────────────

function renderBrowser() {
  return render(<BrowserConnector />)
}

/**
 * Find all tab elements rendered in the tab bar (children of .overflow-x-auto).
 */
function getTabs(): HTMLElement[] {
  const tabBar = document.querySelector('.overflow-x-auto')
  if (!tabBar) return []
  return Array.from(tabBar.children) as HTMLElement[]
}

/**
 * Get the active tab element (with bg-surface-base class).
 */
function getActiveTab(): HTMLElement | null {
  return document.querySelector('.bg-surface-base') as HTMLElement | null
}

/**
 * Get the URL bar container div (parent of the input, which has class flex-1).
 * Note: the <input> itself also has class flex-1, so .closest('.flex-1') returns
 * the input, not its parent. Use .parentElement instead.
 */
function getUrlBarContainer(): HTMLElement | null {
  const input = screen.queryByPlaceholderText('Enter URL or search...')
  if (!input) return null
  return input.parentElement as HTMLElement | null
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('BrowserConnector', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockWriteText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    mockOpen.mockReset()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  // ── Initial render ─────────────────────────────────────────────────────

  describe('initial render', () => {
    it('renders a single default tab', () => {
      renderBrowser()
      expect(getTabs().length).toBe(1)
    })

    it('shows the default tab title', () => {
      renderBrowser()
      expect(screen.getByText('Example')).toBeInTheDocument()
    })

    it('shows the URL bar with initial empty input', () => {
      renderBrowser()
      const input = screen.getByPlaceholderText('Enter URL or search...')
      expect(input).toBeInTheDocument()
      expect(input).toHaveValue('')
    })

    it('shows the content area placeholder (dev mode)', () => {
      renderBrowser()
      expect(screen.getByText('Browser View (Dev)')).toBeInTheDocument()
    })

    it('shows the status bar with the active URL', () => {
      renderBrowser()
      // Status bar URL is in the first span with truncate
      const statusUrls = screen.getAllByText('https://example.com')
      expect(statusUrls.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ── Tab bar ─────────────────────────────────────────────────────────────

  describe('tab bar', () => {
    it('renders a globe icon in each tab', () => {
      renderBrowser()
      const tabSvgElements = document
        .querySelector('.overflow-x-auto')
        ?.querySelectorAll('.lucide-globe')
      expect(tabSvgElements?.length).toBe(1)
    })

    it('highlights the active tab', () => {
      renderBrowser()
      const activeTab = getActiveTab()
      expect(activeTab).toBeInTheDocument()
      expect(activeTab).toHaveTextContent('Example')
    })

    it('does not show close X button when only one tab exists', () => {
      renderBrowser()
      // Close button only appears when tabs.length > 1
      expect(getTabs().length).toBe(1)
      // Check X icons inside the tab bar only (not the URL bar clear button)
      const tabBar = document.querySelector('.overflow-x-auto')
      const closeIcons = tabBar?.querySelectorAll('.lucide-x') || []
      expect(closeIcons.length).toBe(0)
    })

    it('shows the Add Tab + button', () => {
      renderBrowser()
      // Find the Plus icon (Add Tab button is the last button in the tab bar header)
      const plusIcon = document.querySelector('.lucide-plus')
      expect(plusIcon).toBeInTheDocument()
    })

    it('adds a new tab when + is clicked', () => {
      renderBrowser()
      const addBtn = document.querySelector('.lucide-plus')?.closest('button')!
      fireEvent.click(addBtn)
      expect(getTabs().length).toBe(2)
    })

    it('sets the new tab as active', () => {
      renderBrowser()
      const addBtn = document.querySelector('.lucide-plus')?.closest('button')!
      fireEvent.click(addBtn)
      const activeTab = getActiveTab()
      expect(activeTab).toHaveTextContent('New Tab')
    })

    it('clears the URL input when adding a tab', () => {
      renderBrowser()
      const input = screen.getByPlaceholderText('Enter URL or search...')
      fireEvent.change(input, { target: { value: 'hello' } })
      expect(input).toHaveValue('hello')

      const addBtn = document.querySelector('.lucide-plus')?.closest('button')!
      fireEvent.click(addBtn)
      expect(input).toHaveValue('')
    })

    it('switches active tab when a tab is clicked', () => {
      renderBrowser()
      // Add second tab
      const addBtn = document.querySelector('.lucide-plus')?.closest('button')!
      fireEvent.click(addBtn)

      // Click the first tab (Example) — it's inside the overflow-x-auto container
      const tabBar = document.querySelector('.overflow-x-auto')!
      const firstTab = tabBar.children[0] as HTMLElement
      fireEvent.click(firstTab)
      const activeTab = getActiveTab()
      expect(activeTab).toHaveTextContent('Example')
    })
  })

  // ── Tab close behavior ──────────────────────────────────────────────────

  describe('tab close behavior', () => {
    it('shows close buttons when more than one tab exists', () => {
      renderBrowser()
      const addBtn = document.querySelector('.lucide-plus')?.closest('button')!
      fireEvent.click(addBtn)

      // Now each tab should have a close (X) button inside the tab bar
      const tabBar = document.querySelector('.overflow-x-auto')
      const closeBtns = tabBar?.querySelectorAll('.lucide-x') || []
      expect(closeBtns.length).toBeGreaterThanOrEqual(2)
    })

    it('closes a tab when X is clicked', () => {
      renderBrowser()
      const addBtn = document.querySelector('.lucide-plus')?.closest('button')!
      fireEvent.click(addBtn)

      // Close the first tab
      const tabBar = document.querySelector('.overflow-x-auto')!
      const firstCloseBtn = tabBar.querySelector('.lucide-x')?.closest('button')!
      fireEvent.click(firstCloseBtn)
      expect(getTabs().length).toBe(1)
    })

    it('does not close the last remaining tab', () => {
      renderBrowser()
      // With only 1 tab, no close X exists in the tab bar
      const tabBar = document.querySelector('.overflow-x-auto')
      const closeBtns = tabBar?.querySelectorAll('.lucide-x') || []
      expect(closeBtns.length).toBe(0)
    })

    it('switches to another tab when the active tab is closed', () => {
      renderBrowser()
      const addBtn = document.querySelector('.lucide-plus')?.closest('button')!
      fireEvent.click(addBtn) // Tab 2 (active)
      fireEvent.click(addBtn) // Tab 3 (active)

      // Close the active tab (last one)
      const tabBar = document.querySelector('.overflow-x-auto')!
      const closeBtns = tabBar.querySelectorAll('.lucide-x')
      const lastCloseBtn = closeBtns[closeBtns.length - 1].closest('button')!
      fireEvent.click(lastCloseBtn)

      expect(getTabs().length).toBe(2)
    })

    it('stops propagation on close button click', () => {
      renderBrowser()
      const addBtn = document.querySelector('.lucide-plus')?.closest('button')!
      fireEvent.click(addBtn)

      // Close the first tab via its X button
      const tabBar = document.querySelector('.overflow-x-auto')!
      const firstCloseBtn = tabBar.querySelector('.lucide-x')?.closest('button')!
      fireEvent.click(firstCloseBtn)

      // The tab was removed without switching to another tab (the close was isolated)
      expect(getTabs().length).toBe(1)
    })
  })

  // ── URL input ──────────────────────────────────────────────────────────

  describe('URL input', () => {
    it('updates as the user types', () => {
      renderBrowser()
      const input = screen.getByPlaceholderText('Enter URL or search...')
      fireEvent.change(input, { target: { value: 'my-site' } })
      expect(input).toHaveValue('my-site')
    })

    it('navigates on Enter key press', () => {
      renderBrowser()
      const input = screen.getByPlaceholderText('Enter URL or search...')
      fireEvent.change(input, { target: { value: 'https://example.org' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(input).toHaveValue('https://example.org')
    })

    it('shows a clear X button when input is non-empty', () => {
      renderBrowser()
      const input = screen.getByPlaceholderText('Enter URL or search...')

      // Initially no clear X icon (1 tab, empty URL)
      const tabBar = document.querySelector('.overflow-x-auto')
      expect(tabBar?.querySelectorAll('.lucide-x').length).toBe(0)

      fireEvent.change(input, { target: { value: 'test' } })

      // Now a clear X appears in the URL bar container
      const urlBar = getUrlBarContainer()!
      expect(urlBar.querySelector('.lucide-x')).toBeInTheDocument()
    })

    it('clears the input when X is clicked', () => {
      renderBrowser()
      const input = screen.getByPlaceholderText('Enter URL or search...')
      fireEvent.change(input, { target: { value: 'test' } })
      expect(input).toHaveValue('test')

      // Click the clear button in the URL bar
      const urlBar = getUrlBarContainer()!
      const clearBtn = urlBar.querySelector('.lucide-x')?.closest('button')!
      fireEvent.click(clearBtn!)
      expect(input).toHaveValue('')
    })
  })

  // ── URL navigation logic ────────────────────────────────────────────────

  describe('URL navigation', () => {
    it('navigates to a full URL', () => {
      renderBrowser()
      const input = screen.getByPlaceholderText('Enter URL or search...')
      fireEvent.change(input, { target: { value: 'https://example.org/page' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(input).toHaveValue('https://example.org/page')
      // The URL appears in both the input and status bar
      const urlMatches = screen.getAllByText('https://example.org/page')
      expect(urlMatches.length).toBeGreaterThanOrEqual(1)
    })

    it('adds https:// when protocol is missing', () => {
      renderBrowser()
      const input = screen.getByPlaceholderText('Enter URL or search...')
      fireEvent.change(input, { target: { value: 'example.com' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(input).toHaveValue('https://example.com')
    })

    it('treats input without dots as a Google search', () => {
      renderBrowser()
      const input = screen.getByPlaceholderText('Enter URL or search...')
      fireEvent.change(input, { target: { value: 'react hooks tutorial' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      // encodeURIComponent uses %20 not +
      expect(input).toHaveValue(
        'https://www.google.com/search?q=react%20hooks%20tutorial'
      )
    })

    it('does nothing for empty input', () => {
      renderBrowser()
      const input = screen.getByPlaceholderText('Enter URL or search...')
      fireEvent.keyDown(input, { key: 'Enter' })
      // URL should remain unchanged (default url in status bar)
      const urlMatches = screen.getAllByText('https://example.com')
      expect(urlMatches.length).toBeGreaterThanOrEqual(1)
    })

    it('handles URL with spaces by treating as search', () => {
      renderBrowser()
      const input = screen.getByPlaceholderText('Enter URL or search...')
      fireEvent.change(input, { target: { value: 'my site .com' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      // Has dots but also spaces, so treated as search (encodeURIComponent uses %20)
      expect(input).toHaveValue(
        'https://www.google.com/search?q=my%20site%20.com'
      )
    })

    it('handles URL with http:// (not https)', () => {
      renderBrowser()
      const input = screen.getByPlaceholderText('Enter URL or search...')
      fireEvent.change(input, { target: { value: 'http://example.com' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(input).toHaveValue('http://example.com')
    })
  })

  // ── Navigation buttons ──────────────────────────────────────────────────

  describe('navigation buttons', () => {
    it('renders back (ArrowLeft) button', () => {
      renderBrowser()
      const backBtn = document.querySelector('.lucide-arrow-left')
      expect(backBtn).toBeInTheDocument()
    })

    it('renders forward (ArrowRight) button', () => {
      renderBrowser()
      const fwdBtn = document.querySelector('.lucide-arrow-right')
      expect(fwdBtn).toBeInTheDocument()
    })

    it('renders refresh button that navigates to current URL', () => {
      renderBrowser()
      const refreshBtn = document.querySelector('.lucide-refresh-cw')?.closest('button')
      expect(refreshBtn).toBeInTheDocument()
      fireEvent.click(refreshBtn!)
      const input = screen.getByPlaceholderText('Enter URL or search...')
      expect(input).toHaveValue('https://example.com')
    })

    it('renders home button that navigates to Google', () => {
      renderBrowser()
      // Find the nav bar via the refresh button, then find the home button
      // It's the 4th button (index 3) in the nav bar: ← → ↻ ⌂
      const refreshSvg = document.querySelector('.lucide-refresh-cw')
      const navBar = refreshSvg?.closest('button')?.parentElement
      const buttons = navBar?.querySelectorAll('button') || []
      const homeBtn = buttons[3]
      expect(homeBtn).toBeInTheDocument()
      fireEvent.click(homeBtn!)
      const input = screen.getByPlaceholderText('Enter URL or search...')
      expect(input).toHaveValue('https://www.google.com')
    })

    it('renders Copy URL button in the nav bar', () => {
      renderBrowser()
      const copyBtn = screen.getByTitle('Copy URL')
      expect(copyBtn).toBeInTheDocument()
    })

    it('copies URL to clipboard when Copy is clicked', () => {
      mockWriteText.mockResolvedValue(undefined)
      renderBrowser()
      const copyBtn = screen.getByTitle('Copy URL')
      fireEvent.click(copyBtn)
      expect(mockWriteText).toHaveBeenCalledWith('https://example.com')
    })

    it('renders Open External button in the nav bar', () => {
      renderBrowser()
      const extBtn = screen.getByTitle('Open in system browser')
      expect(extBtn).toBeInTheDocument()
    })

    it('opens URL in new window when Open External is clicked', () => {
      renderBrowser()
      const extBtn = screen.getByTitle('Open in system browser')
      fireEvent.click(extBtn)
      expect(mockOpen).toHaveBeenCalledWith('https://example.com', '_blank')
    })
  })

  // ── Content area ───────────────────────────────────────────────────────

  describe('content area', () => {
    it('shows the Browser View heading (dev mode)', () => {
      renderBrowser()
      expect(screen.getByText('Browser View (Dev)')).toBeInTheDocument()
    })

    it('shows the description text (dev mode)', () => {
      renderBrowser()
      // In dev mode (non-Tauri), the description explains both modes
      expect(
        screen.getByText(/Browser Panel|Browser View \(Dev\)/)
      ).toBeInTheDocument()
      expect(
        screen.getByText(/Tauri WebView window/)
      ).toBeInTheDocument()
    })

    it('shows a Copy URL button in the content area', () => {
      renderBrowser()
      const copyUrlBtns = screen.getAllByText('Copy URL')
      expect(copyUrlBtns.length).toBeGreaterThanOrEqual(1)
    })

    it('shows an Open Externally button in the content area', () => {
      renderBrowser()
      const openExtBtns = screen.getAllByText('Open Externally')
      expect(openExtBtns.length).toBeGreaterThanOrEqual(1)
    })

    it('content area Copy button copies the URL', () => {
      mockWriteText.mockResolvedValue(undefined)
      renderBrowser()
      const copyBtns = screen.getAllByText('Copy URL')
      // The content area buttons are inside a div.flex-col
      const contentCopyBtn = copyBtns.find(
        (btn) => btn.closest('.flex-col') !== null
      )
      fireEvent.click(contentCopyBtn || copyBtns[0])
      expect(mockWriteText).toHaveBeenCalledWith('https://example.com')
    })

    it('content area Open Externally button opens the URL', () => {
      renderBrowser()
      const openBtns = screen.getAllByText('Open Externally')
      const contentOpenBtn = openBtns.find(
        (btn) => btn.closest('.flex-col') !== null
      )
      fireEvent.click(contentOpenBtn || openBtns[0])
      expect(mockOpen).toHaveBeenCalledWith('https://example.com', '_blank')
    })
  })

  // ── Status bar ─────────────────────────────────────────────────────────

  describe('status bar', () => {
    it('displays the current URL', () => {
      renderBrowser()
      const urlMatches = screen.getAllByText('https://example.com')
      // One is in the status bar, possibly also in the input (set by navigate)
      expect(urlMatches.length).toBeGreaterThanOrEqual(1)
    })

    it('shows the Capture screenshot button', () => {
      renderBrowser()
      expect(screen.getByTitle('Capture screenshot')).toBeInTheDocument()
    })

    it('shows the Bookmark page button', () => {
      renderBrowser()
      expect(screen.getByTitle('Bookmark page')).toBeInTheDocument()
    })

    it('updates the URL displayed when navigating', () => {
      renderBrowser()
      const input = screen.getByPlaceholderText('Enter URL or search...')
      fireEvent.change(input, { target: { value: 'https://my-site.io' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      const urlMatches = screen.getAllByText('https://my-site.io')
      expect(urlMatches.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ── Edge cases ─────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles refresh gracefully', () => {
      renderBrowser()
      const refreshBtn = document.querySelector('.lucide-refresh-cw')?.closest('button')
      fireEvent.click(refreshBtn!)
      const input = screen.getByPlaceholderText('Enter URL or search...')
      expect(input).toHaveValue('https://example.com')
    })

    it('handles copy URL gracefully', () => {
      mockWriteText.mockResolvedValue(undefined)
      renderBrowser()
      const copyBtn = screen.getByTitle('Copy URL')
      fireEvent.click(copyBtn)
      expect(mockWriteText).toHaveBeenCalledWith('https://example.com')
    })

    it('handles open external gracefully', () => {
      renderBrowser()
      const extBtn = screen.getByTitle('Open in system browser')
      fireEvent.click(extBtn)
      expect(mockOpen).toHaveBeenCalledWith('https://example.com', '_blank')
    })

    it('navigates on Enter when URL bar has only whitespace', () => {
      renderBrowser()
      const input = screen.getByPlaceholderText('Enter URL or search...')
      fireEvent.change(input, { target: { value: '   ' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      // Whitespace is truthy, no dots, so treated as search
      expect(input).toHaveValue(
        'https://www.google.com/search?q=%20%20%20'
      )
    })
  })
})
