// ────────────────────────────────────────────────────────────────────────────
// Shared Tauri IPC Mock for Playwright E2E Tests
// ────────────────────────────────────────────────────────────────────────────
//
// Usage:
//   1. Call installTauriMock(page, handlers) BEFORE page.goto()
//      so the app initializes with the correct mock state.
//   2. Call updateTauriMock(page, handlers) mid-test to change
//      how subsequent invoke() calls resolve.
//
// The handler map is stored on window.__TAURI_MOCK_HANDLERS__ and is
// mutable at runtime via page.evaluate().
//
// ────────────────────────────────────────────────────────────────────────────

import type { Page } from '@playwright/test'

/**
 * Install the Tauri IPC mock with initial handlers.
 * Must be called BEFORE page.goto() so the app sees correct state on mount.
 * Uses addInitScript to inject the mock before any app scripts run.
 */
export async function installTauriMock(page: Page, initialHandlers: Record<string, unknown> = {}) {
  const serialized = JSON.stringify(initialHandlers)
  await page.addInitScript((handlersJson: string) => {
    const handlers: Record<string, unknown> = JSON.parse(handlersJson)

    // Expose the mutable handler map for runtime updates
    window.__TAURI_MOCK_HANDLERS__ = handlers

    // Callback registration (needed by Tauri IPC Channel)
    const callbacks = new Map<number, (data: unknown) => void>()
    const transformCallback = (cb: (data: unknown) => void, once = false) => {
      const id = crypto.getRandomValues(new Uint32Array(1))[0]
      callbacks.set(id, (data: unknown) => {
        if (once) callbacks.delete(id)
        cb(data)
      })
      return id
    }
    const unregisterCallback = (id: number) => callbacks.delete(id)
    const runCallback = (id: number, data: unknown) => {
      const cb = callbacks.get(id)
      if (cb) cb(data)
    }

    // The main invoke mock — reads from the mutable handler map
    const invoke = (cmd: string, _args?: unknown, _options?: unknown) => {
      const handler = window.__TAURI_MOCK_HANDLERS__[cmd]

      if (handler === undefined) {
        return Promise.reject(new Error(`[Tauri Mock] No handler for command: ${cmd}`))
      }
      if (handler === null) {
        return Promise.reject(new Error(`[Tauri Mock] Handler is null for command: ${cmd}`))
      }
      if (typeof handler === 'function') {
        return Promise.resolve(handler(_args))
      }
      return Promise.resolve(handler)
    }

    // Set up Tauri globals
    window.__TAURI_INTERNALS__ = {
      invoke,
      transformCallback,
      unregisterCallback,
      runCallback,
      callbacks,
      convertFileSrc: (path: string, protocol = 'asset') =>
        `http://${protocol}.localhost/${encodeURIComponent(path)}`,
    }

    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: () => {},
    }

    window.__TAURI__ = {
      core: window.__TAURI_INTERNALS__,
    }

    window.isTauri = true
  }, serialized)
}

/**
 * Update the mutable handler map at runtime.
 * Use this mid-test to change how subsequent invoke() calls resolve.
 * The app's next invoke call will use the updated handler.
 */
export async function updateTauriMock(page: Page, handlers: Record<string, unknown>) {
  await page.evaluate((h) => {
    Object.assign(window.__TAURI_MOCK_HANDLERS__, h)
  }, handlers)
}
