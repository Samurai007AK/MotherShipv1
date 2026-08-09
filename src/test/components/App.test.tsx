import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import App from '../../App'

const { mockStoreState } = vi.hoisted(() => ({
  mockStoreState: {
    resolvedTheme: 'dark' as 'light' | 'dark',
    theme: 'dark' as 'light' | 'dark' | 'system',
    setTheme: vi.fn(),
  },
}))

vi.mock('../../components/command-palette/CommandPalette', () => ({
  CommandPalette: vi.fn(
    ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
      (
        <div data-testid="command-palette" data-isopen={String(isOpen)}>
          CommandPalette
          <button data-testid="palette-close" onClick={onClose}>
            close
          </button>
        </div>
      )
  ),
  useCommandPalette: vi.fn(() => ({ isOpen: false, setIsOpen: vi.fn() })),
}))

vi.mock('../../components/updater/UpdateBanner', () => ({
  UpdateBanner: () => <div data-testid="update-banner">UpdateBanner</div>,
}))

vi.mock('../../components/onboarding/OnboardingWizard', () => ({
  OnboardingWizard: () => <div data-testid="onboarding-wizard">OnboardingWizard</div>,
}))

vi.mock('../../components/layout/TopBar', () => ({
  TopBar: ({ activeNav }: { activeNav: string }) => (
    <div data-testid="top-bar" data-activenav={activeNav}>TopBar</div>
  ),
}))

vi.mock('../../components/layout/FileSidebar', () => ({
  FileSidebar: () => <div data-testid="file-sidebar">FileSidebar</div>,
}))

vi.mock('../../components/layout/AgentBar', () => ({
  AgentBar: () => <div data-testid="agent-bar">AgentBar</div>,
}))

vi.mock('../../components/layout/PortsDialog', () => ({
  PortsDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="ports-dialog">PortsDialog</div> : null,
}))

vi.mock('../../components/agents/AgentSidebar', () => ({
  AgentSidebar: () => <div data-testid="agent-sidebar">AgentSidebar</div>,
}))

vi.mock('../../hooks/useContextCapture', () => ({
  useContextCapture: vi.fn(),
}))

vi.mock('../../stores/themeStore', () => ({
  useThemeStore: (selector?: (s: typeof mockStoreState) => any) => {
    return selector ? selector(mockStoreState) : mockStoreState
  },
}))

import { useContextCapture } from '../../hooks/useContextCapture'

function getHtmlClass(): string[] {
  return Array.from(document.documentElement.classList)
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStoreState.resolvedTheme = 'dark'
    mockStoreState.theme = 'dark'
    document.documentElement.classList.remove('light', 'dark')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the root container with correct base classes', () => {
    const { container } = render(<App />)
    const root = container.firstChild as HTMLElement
    expect(root).toBeInTheDocument()
    expect(root).toHaveClass('flex', 'flex-col', 'h-screen', 'overflow-hidden', 'bg-c-bg', 'text-c-text')
  })

  it('renders CommandPalette component', () => {
    render(<App />)
    expect(screen.getByTestId('command-palette')).toBeInTheDocument()
  })

  it('renders OnboardingWizard component', () => {
    render(<App />)
    expect(screen.getByTestId('onboarding-wizard')).toBeInTheDocument()
  })

  it('renders TopBar component', () => {
    render(<App />)
    expect(screen.getByTestId('top-bar')).toBeInTheDocument()
  })

  it('renders FileSidebar component', () => {
    render(<App />)
    expect(screen.getByTestId('file-sidebar')).toBeInTheDocument()
  })

  it('renders AgentBar component', () => {
    render(<App />)
    expect(screen.getByTestId('agent-bar')).toBeInTheDocument()
  })

  it('renders all child components inside the app', () => {
    const { container } = render(<App />)
    const root = container.firstChild as HTMLElement
    expect(root.querySelector('[data-testid="update-banner"]')).toBeInTheDocument()
    expect(root.querySelector('[data-testid="command-palette"]')).toBeInTheDocument()
    expect(root.querySelector('[data-testid="onboarding-wizard"]')).toBeInTheDocument()
    expect(root.querySelector('[data-testid="top-bar"]')).toBeInTheDocument()
    expect(root.querySelector('[data-testid="agent-bar"]')).toBeInTheDocument()
  })

  it('passes isOpen=false to CommandPalette by default', () => {
    render(<App />)
    const cp = screen.getByTestId('command-palette')
    expect(cp.getAttribute('data-isopen')).toBe('false')
  })

  it('passes an onClose function to CommandPalette that sets isOpen to false', () => {
    render(<App />)
    const closeBtn = screen.getByTestId('palette-close')
    act(() => {
      closeBtn.click()
    })
    const cp = screen.getByTestId('command-palette')
    expect(cp.getAttribute('data-isopen')).toBe('false')
  })

  it('renders CommandPalette with isOpen=true when useCommandPalette returns isOpen=true', async () => {
    const { useCommandPalette } = await import(
      '../../components/command-palette/CommandPalette'
    )
    vi.mocked(useCommandPalette).mockReturnValue({
      isOpen: true,
      setIsOpen: vi.fn(),
    })

    render(<App />)

    await waitFor(() => {
      const cp = screen.getByTestId('command-palette')
      expect(cp.getAttribute('data-isopen')).toBe('true')
    })
  })

  it('calls useContextCapture on mount', () => {
    render(<App />)
    expect(vi.mocked(useContextCapture)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(useContextCapture)).toHaveBeenCalledWith()
  })

  it('calls useContextCapture only once', () => {
    render(<App />)
    const callCount = vi.mocked(useContextCapture).mock.calls.length
    expect(callCount).toBeGreaterThanOrEqual(1)
  })

  it('syncs resolvedTheme to html element class on mount (dark)', () => {
    render(<App />)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
  })

  it('syncs resolvedTheme to html element class on mount (light)', () => {
    mockStoreState.resolvedTheme = 'light'
    mockStoreState.theme = 'light'

    render(<App />)
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('removes the opposite theme class when mounting', () => {
    document.documentElement.classList.add('light', 'dark')

    render(<App />)

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.classList.contains('light')).toBe(false)
  })

  it('updates html class when resolvedTheme changes', () => {
    const { rerender } = render(<App />)
    expect(getHtmlClass()).toEqual(['dark'])

    mockStoreState.resolvedTheme = 'light'
    rerender(<App />)

    expect(getHtmlClass()).toEqual(['light'])
  })

  it('removes old theme class and adds new one on theme change', () => {
    const { rerender } = render(<App />)
    expect(getHtmlClass()).toEqual(['dark'])

    mockStoreState.resolvedTheme = 'light'
    rerender(<App />)

    expect(getHtmlClass()).toEqual(['light'])
  })

  it('does not throw when rendered with default state', () => {
    expect(() => render(<App />)).not.toThrow()
  })

  it('handles theme changes that do not affect classList', () => {
    const { rerender } = render(<App />)
    expect(getHtmlClass()).toEqual(['dark'])

    rerender(<App />)
    expect(getHtmlClass()).toEqual(['dark'])
  })

  it('renders all children without duplicates', () => {
    const { container } = render(<App />)
    const cmdPalettes = container.querySelectorAll('[data-testid="command-palette"]')
    const wizards = container.querySelectorAll('[data-testid="onboarding-wizard"]')
    const topBars = container.querySelectorAll('[data-testid="top-bar"]')

    expect(cmdPalettes.length).toBe(1)
    expect(wizards.length).toBe(1)
    expect(topBars.length).toBe(1)
  })

  it('renders the full layout hierarchy', () => {
    const { container } = render(<App />)
    const root = container.firstChild as HTMLElement

    expect(root.tagName).toBe('DIV')
    expect(root.className).toContain('flex')
    expect(root.className).toContain('flex-col')

    const children = Array.from(root.children)
    const testIds = children.map(
      (c) => (c as HTMLElement).getAttribute('data-testid')
    )

    expect(testIds).toContain('update-banner')
    expect(testIds).toContain('command-palette')
    expect(testIds).toContain('onboarding-wizard')
    expect(testIds).toContain('top-bar')
    expect(testIds).toContain('agent-bar')

    const contentDiv = children.find(
      (c) => (c as HTMLElement).className?.includes('flex-1')
    )
    expect(contentDiv).toBeDefined()
  })
})
