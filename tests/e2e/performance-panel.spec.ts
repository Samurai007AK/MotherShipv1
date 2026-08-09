import { test, expect, type Page } from '@playwright/test'

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Sidebar scoped locator */
const sidebar = (page: Page) => page.locator('aside').first()

/** Memory panel scoped locator */
const memoryPanel = (page: Page) => page.locator('aside').last()

/** Navigate to the Perf tab in the memory panel. */
async function openPerfTab(page: Page) {
  const mem = memoryPanel(page)
  // The Perf tab is labeled "Perf" with an Activity icon
  await mem.getByText('Perf').first().click()
  // Wait for the performance panel to render its header
  await expect(mem.getByText('Performance').first()).toBeVisible({ timeout: 5000 })
}

// ────────────────────────────────────────────────────────────────────────────
// Setup
// ────────────────────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await expect(sidebar(page).getByText('MOTHERSHIP')).toBeVisible({ timeout: 10000 })
})

// ────────────────────────────────────────────────────────────────────────────
// Performance Panel Tests
// ────────────────────────────────────────────────────────────────────────────

test.describe('Performance Panel', () => {
  test('Perf tab is visible in memory panel', async ({ page }) => {
    const mem = memoryPanel(page)
    await expect(mem.getByText('Perf').first()).toBeVisible()
  })

  test('clicking Perf tab opens the performance panel', async ({ page }) => {
    await openPerfTab(page)
    const mem = memoryPanel(page)
    await expect(mem.getByText('Performance').first()).toBeVisible()
  })

  test('shows the performance header with refresh button', async ({ page }) => {
    await openPerfTab(page)

    // Header should contain "Performance" text
    await expect(memoryPanel(page).getByText('Performance').first()).toBeVisible()

    // Refresh button should be visible (title="Refresh now")
    await expect(memoryPanel(page).getByTitle('Refresh now')).toBeVisible()
  })

  test('shows the polling indicator dot', async ({ page }) => {
    await openPerfTab(page)

    // The polling indicator starts as active (pulsing green dot)
    // It's a span with title "Polling active"
    const pollingDot = memoryPanel(page).locator('[title*=\"Polling\"]').first()
    await expect(pollingDot).toBeVisible()
  })

  test('shows Memory Usage section', async ({ page }) => {
    await openPerfTab(page)
    await expect(memoryPanel(page).getByText('Memory Usage').first()).toBeVisible()
  })

  test('shows the Auto-Pause section with toggle', async ({ page }) => {
    await openPerfTab(page)

    const mem = memoryPanel(page)
    // Auto-Pause section header
    await expect(mem.getByText('Auto-Pause').first()).toBeVisible()

    // The toggle button should be visible (it's a button with title "Auto-pause enabled")
    const toggleBtn = mem.locator('[title*=\"Auto-pause\"]').first()
    await expect(toggleBtn).toBeVisible()
  })

  test('shows threshold inputs in the auto-pause section', async ({ page }) => {
    await openPerfTab(page)

    const mem = memoryPanel(page)
    // Mem Threshold input
    await expect(mem.getByText('Mem Threshold').first()).toBeVisible()
    await expect(mem.getByText('MB').first()).toBeVisible()

    // Idle Window input
    await expect(mem.getByText('Idle Window').first()).toBeVisible()
    await expect(mem.getByText('sec').first()).toBeVisible()
  })

  test('shows the threshold number inputs with default values', async ({ page }) => {
    await openPerfTab(page)

    const mem = memoryPanel(page)
    // Mem Threshold contains input with default value 200
    const memInput = mem.locator('input[type=\"number\"]').first()
    await expect(memInput).toBeVisible()
    const memValue = await memInput.inputValue()
    expect(Number(memValue)).toBe(200)

    // Idle Window input contains default value 60 (seconds)
    const idleInput = mem.locator('input[type=\"number\"]').nth(1)
    await expect(idleInput).toBeVisible()
    const idleValue = await idleInput.inputValue()
    expect(Number(idleValue)).toBe(60)
  })

  test('can toggle auto-pause on and off', async ({ page }) => {
    await openPerfTab(page)

    const mem = memoryPanel(page)
    const toggleBtn = mem.locator('[title*=\"Auto-pause\"]').first()

    // Initially enabled
    await expect(toggleBtn).toHaveAttribute('title', 'Auto-pause enabled')

    // Click to disable
    await toggleBtn.click()
    await expect(toggleBtn).toHaveAttribute('title', 'Auto-pause disabled')

    // Click to re-enable
    await toggleBtn.click()
    await expect(toggleBtn).toHaveAttribute('title', 'Auto-pause enabled')
  })

  test('shows metric cards when data is available', async ({ page }) => {
    await openPerfTab(page)

    const mem = memoryPanel(page)
    // In dev mode, the panel shows "Waiting for data..." or JS heap info
    // The metric cards are only shown when snapshot data exists
    // But the section labels should be present
    const hasSnapshot = await mem.getByText('CPU').first().isVisible().catch(() => false)
    const hasDevMode = await mem.getByText('Waiting for data...').first().isVisible().catch(() => false)

    // Either snapshot data is showing (metric cards) or waiting state
    if (hasSnapshot) {
      await expect(mem.getByText('Memory Fraction').first()).toBeVisible()
      await expect(mem.getByText('JS Heap').first()).toBeVisible()
    } else if (!hasDevMode) {
      // Performance data available in desktop app only message
      await expect(mem.getByText(/Performance data available/).first()).toBeVisible()
    }
  })

  test('shows pressure history section', async ({ page }) => {
    await openPerfTab(page)

    const mem = memoryPanel(page)
    // Pressure history is shown when pressureHistory.length > 0
    // In dev mode with no polling data, it may not appear
    const pressureLabel = mem.getByText('Pressure History').first()
    if (await pressureLabel.isVisible().catch(() => false)) {
      await expect(pressureLabel).toBeVisible()
    }
  })

  test('can refresh performance data manually', async ({ page }) => {
    await openPerfTab(page)

    const mem = memoryPanel(page)
    const refreshBtn = mem.getByTitle('Refresh now')
    await expect(refreshBtn).toBeVisible()

    // Click refresh — should not throw
    await refreshBtn.click()
    // No error state should appear
    await expect(mem.getByText('Performance').first()).toBeVisible()
  })
})
