import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeToggle } from '../../components/layout/ThemeToggle'
import { useThemeStore } from '../../stores/themeStore'

// ── Mock Tauri invoke (required by setup pattern) ──────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// ── Helpers ────────────────────────────────────────────────────────────────

function renderToggle() {
  return render(<ThemeToggle />)
}

function resetStore() {
  useThemeStore.setState({
    theme: 'dark',
    resolvedTheme: 'dark',
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ThemeToggle', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    resetStore()
  })

  // ── Button rendering ─────────────────────────────────────────────────

  describe('buttons', () => {
    it('renders three theme buttons', () => {
      renderToggle()
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBe(3)
    })

    it('renders a Light button', () => {
      renderToggle()
      expect(screen.getByTitle('Light')).toBeInTheDocument()
    })

    it('renders a Dark button', () => {
      renderToggle()
      expect(screen.getByTitle('Dark')).toBeInTheDocument()
    })

    it('renders a System button', () => {
      renderToggle()
      expect(screen.getByTitle('System')).toBeInTheDocument()
    })
  })

  // ── Active state ─────────────────────────────────────────────────────

  describe('active state', () => {
    it('highlights the dark button when theme is dark (default)', () => {
      renderToggle()
      const darkBtn = screen.getByTitle('Dark')
      expect(darkBtn.className).toContain('shadow-sm')
    })

    it('highlights the light button when theme is light', () => {
      useThemeStore.setState({ theme: 'light', resolvedTheme: 'light' })
      renderToggle()

      const lightBtn = screen.getByTitle('Light')
      expect(lightBtn.className).toContain('shadow-sm')

      const darkBtn = screen.getByTitle('Dark')
      expect(darkBtn.className).not.toContain('shadow-sm')
    })

    it('highlights the system button when theme is system', () => {
      useThemeStore.setState({ theme: 'system', resolvedTheme: 'dark' })
      renderToggle()

      const systemBtn = screen.getByTitle('System')
      expect(systemBtn.className).toContain('shadow-sm')
    })

    it('applies text-c-text to the active button', () => {
      renderToggle()
      const darkBtn = screen.getByTitle('Dark')
      expect(darkBtn.className).toContain('text-c-text')
    })

    it('applies text-c-muted to inactive buttons', () => {
      useThemeStore.setState({ theme: 'light', resolvedTheme: 'light' })
      renderToggle()

      const darkBtn = screen.getByTitle('Dark')
      expect(darkBtn.className).toContain('text-c-muted')
    })
  })

  // ── Click behavior ───────────────────────────────────────────────────

  describe('click behavior', () => {
    it('calls setTheme with "light" when Light button is clicked', () => {
      const setTheme = vi.spyOn(useThemeStore.getState(), 'setTheme')
      renderToggle()

      fireEvent.click(screen.getByTitle('Light'))

      expect(setTheme).toHaveBeenCalledWith('light')
    })

    it('calls setTheme with "dark" when Dark button is clicked', () => {
      useThemeStore.setState({ theme: 'light', resolvedTheme: 'light' })
      const setTheme = vi.spyOn(useThemeStore.getState(), 'setTheme')
      renderToggle()

      fireEvent.click(screen.getByTitle('Dark'))

      expect(setTheme).toHaveBeenCalledWith('dark')
    })

    it('calls setTheme with "system" when System button is clicked', () => {
      const setTheme = vi.spyOn(useThemeStore.getState(), 'setTheme')
      renderToggle()

      fireEvent.click(screen.getByTitle('System'))

      expect(setTheme).toHaveBeenCalledWith('system')
    })
  })

  // ── Icons ────────────────────────────────────────────────────────────

  describe('icons', () => {
    it('renders a Sun icon on the Light button', () => {
      renderToggle()
      const lightBtn = screen.getByTitle('Light')
      expect(lightBtn.querySelector('.lucide-sun')).toBeInTheDocument()
    })

    it('renders a Moon icon on the Dark button', () => {
      renderToggle()
      const darkBtn = screen.getByTitle('Dark')
      expect(darkBtn.querySelector('.lucide-moon')).toBeInTheDocument()
    })

    it('renders a Monitor icon on the System button', () => {
      renderToggle()
      const systemBtn = screen.getByTitle('System')
      expect(systemBtn.querySelector('.lucide-monitor')).toBeInTheDocument()
    })
  })

  // ── Container ────────────────────────────────────────────────────────

  describe('container', () => {
    it('renders within a container with rounded-lg', () => {
      renderToggle()
      const container = screen.getByTitle('Light').closest('.rounded-lg')
      expect(container).toBeInTheDocument()
    })

    it('renders all buttons within the same container', () => {
      renderToggle()
      const container = screen.getByTitle('Light').closest('.rounded-lg')!
      expect(container.contains(screen.getByTitle('Dark'))).toBe(true)
      expect(container.contains(screen.getByTitle('System'))).toBe(true)
    })
  })
})
