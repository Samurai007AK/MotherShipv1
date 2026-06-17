import { create } from 'zustand'

export type Theme = 'light' | 'dark' | 'system'

interface ThemeState {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getStoredTheme(): Theme {
  try {
    const raw = localStorage.getItem('mothership-theme')
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {}
  return 'dark'
}

function applyTheme(resolved: 'light' | 'dark') {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(resolved)

  // Body classes are managed by CSS variables and Tailwind, no hardcoded colors needed
}

function resolve(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? getSystemTheme() : theme
}

export const useThemeStore = create<ThemeState>()((set) => {
  const initial = getStoredTheme()
  const resolved = resolve(initial)

  // Apply on load
  if (typeof window !== 'undefined') {
    applyTheme(resolved)
  }

  return {
    theme: initial,
    resolvedTheme: resolved,

    setTheme: (theme) => {
      const resolved = resolve(theme)
      localStorage.setItem('mothership-theme', theme)
      applyTheme(resolved)
      set({ theme, resolvedTheme: resolved })
    },
  }
})

// Listen for system theme changes when in 'system' mode
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const { theme } = useThemeStore.getState()
    if (theme === 'system') {
      const resolved = getSystemTheme()
      applyTheme(resolved)
      useThemeStore.setState({ resolvedTheme: resolved })
    }
  })
}
