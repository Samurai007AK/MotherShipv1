import '@testing-library/jest-dom'
import { afterAll } from 'vitest'

// Suppress React act() warnings from zustand store mutations that trigger
// useSyncExternalStore re-renders outside of act(). These are well-understood
// and don't indicate real bugs — wrapping every store mutation in act() would
// make tests unreadable.
const ORIGINAL_CONSOLE_ERROR = console.error
console.error = (...args: any[]) => {
  // Suppress act() warnings from zustand store mutations, but preserve
  // legitimate warnings about state updates after unmount (real bugs).
  if (
    typeof args[0] === 'string' &&
    args[0].includes('not wrapped in act') &&
    !args[0].includes('unmount')
  ) return
  ORIGINAL_CONSOLE_ERROR.call(console, ...args)
}
afterAll(() => {
  console.error = ORIGINAL_CONSOLE_ERROR
})

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
    get length() {
      return Object.keys(store).length
    },
    key: (index: number) => Object.keys(store)[index] || null,
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: () => Promise.resolve(),
    readText: () => Promise.resolve(''),
  },
  configurable: true,
})

// Polyfill ResizeObserver (not available in jsdom)
class ResizeObserverMock {
  callback: ResizeObserverCallback
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver
