import { test, expect, type Page } from '@playwright/test'

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Workspace scoped locator */
const workspace = (page: Page) => page.locator('main').first()

/** Sidebar scoped locator */
const sidebar = (page: Page) => page.locator('aside').first()

/** Memory panel scoped locator */
const memoryPanel = (page: Page) => page.locator('aside').last()

/** Click the empty-state Quick Start button for a given agent name to open a terminal */
async function openQuickStart(page: Page, agentName: string) {
  await workspace(page).getByText(agentName).first().click()
  await expect(page.getByText('No Active Workspace')).not.toBeVisible({ timeout: 5000 })
}

/**
 * Simulate a file drop event on the workspace area.
 * Playwright doesn't natively support drag-drop of files from the OS,
 * so we dispatch a custom DragEvent with a FileList.
 */
async function simulateFileDrop(
  page: Page,
  files: Array<{ name: string; mimeType: string; buffer: Buffer }>
) {
  const mainArea = page.locator('main').first()

  // Create a DataTransfer with the files
  const filePayload = await page.evaluateHandle(
    async (fileDescriptors) => {
      const dt = new DataTransfer()
      for (const fd of fileDescriptors) {
        const response = await fetch(fd.url)
        const blob = await response.blob()
        const file = new File([blob], fd.name, { type: fd.mimeType })
        dt.items.add(file)
      }
      return dt
    },
    files.map((f) => ({
      name: f.name,
      mimeType: f.mimeType,
      url: `/test-assets/${f.name}`,
    }))
  )

  // Simulate the drag-drop sequence
  await mainArea.dispatchEvent('dragenter', { dataTransfer: filePayload })
  await mainArea.dispatchEvent('dragover', { dataTransfer: filePayload })
  await mainArea.dispatchEvent('drop', { dataTransfer: filePayload })
  await mainArea.dispatchEvent('dragleave', { dataTransfer: filePayload })
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
// Tests
// ────────────────────────────────────────────────────────────────────────────

test.describe('Drag-drop file attachment', () => {
  test('shows drag overlay when file is dragged over workspace', async ({ page }) => {
    const mainArea = page.locator('main').first()

    // Simulate dragenter with Files type
    const dt = await page.evaluateHandle(() => {
      const dt = new DataTransfer()
      dt.items.add(new File(['test'], 'test.txt', { type: 'text/plain' }))
      return dt
    })

    await mainArea.dispatchEvent('dragenter', { dataTransfer: dt })

    // The drop overlay should appear
    const overlay = page.locator('text=Drop files to attach')
    await expect(overlay).toBeVisible()

    // Clean up
    await mainArea.dispatchEvent('dragleave', { dataTransfer: dt })
    await expect(overlay).not.toBeVisible({ timeout: 2000 })
  })

  test('shows drag overlay text with file attachment icon', async ({ page }) => {
    const mainArea = page.locator('main').first()

    const dt = await page.evaluateHandle(() => {
      const dt = new DataTransfer()
      dt.items.add(new File(['test'], 'test.txt', { type: 'text/plain' }))
      return dt
    })

    await mainArea.dispatchEvent('dragenter', { dataTransfer: dt })

    await expect(page.getByText('Drop files to attach')).toBeVisible()
    await expect(page.getByText('Files will be recorded in memory')).toBeVisible()

    // Clean up
    await mainArea.dispatchEvent('dragleave', { dataTransfer: dt })
  })

  test('overlay appears and disappears on drag enter/leave', async ({ page }) => {
    const mainArea = page.locator('main').first()

    // Create a file drag payload
    const dt = await page.evaluateHandle(() => {
      const dt = new DataTransfer()
      dt.items.add(new File(['test'], 'test.txt', { type: 'text/plain' }))
      return dt
    })

    // Drag enter — overlay appears
    await mainArea.dispatchEvent('dragenter', { dataTransfer: dt })
    await expect(page.getByText('Drop files to attach')).toBeVisible()

    // Drag leave — overlay disappears
    await mainArea.dispatchEvent('dragleave', { dataTransfer: dt })
    await expect(page.getByText('Drop files to attach')).not.toBeVisible({ timeout: 2000 })
  })

  test('does not show overlay for non-file drag events', async ({ page }) => {
    const mainArea = page.locator('main').first()

    // Simulate dragging text (not files) using setData, not items.add
    const dt = await page.evaluateHandle(() => {
      const dt = new DataTransfer()
      dt.setData('text/plain', 'some text')
      return dt
    })

    await mainArea.dispatchEvent('dragenter', { dataTransfer: dt })
    await page.waitForTimeout(200)

    // The overlay should not appear for non-file drags
    await expect(page.getByText('Drop files to attach')).not.toBeVisible()

    // Clean up
    await mainArea.dispatchEvent('dragleave', { dataTransfer: dt })
  })

  test('can drop files onto workspace with an active terminal', async ({ page }) => {
    // First open a terminal so there's an active agent
    await openQuickStart(page, 'Claude')

    const mainArea = page.locator('main').first()

    // Simulate dropping a file
    const dt = await page.evaluateHandle(() => {
      const dt = new DataTransfer()
      dt.items.add(new File(['file content'], 'test-file.js', { type: 'text/javascript' }))
      return dt
    })

    // The drop should not crash — dispatch the full sequence
    await mainArea.dispatchEvent('dragenter', { dataTransfer: dt })
    await mainArea.dispatchEvent('dragover', { dataTransfer: dt })
    await mainArea.dispatchEvent('drop', { dataTransfer: dt })
    await mainArea.dispatchEvent('dragleave', { dataTransfer: dt })

    // Overlay should be gone after drop
    await expect(page.getByText('Drop files to attach')).not.toBeVisible({ timeout: 2000 })

    // The Claude terminal should still be visible (workspace didn't crash)
    await expect(workspace(page).getByText('Claude').first()).toBeVisible()
  })

  test('can drag and drop multiple files', async ({ page }) => {
    await openQuickStart(page, 'Claude')

    const mainArea = page.locator('main').first()

    // Simulate dropping multiple files
    const dt = await page.evaluateHandle(() => {
      const dt = new DataTransfer()
      dt.items.add(new File(['code'], 'app.ts', { type: 'text/typescript' }))
      dt.items.add(new File(['styles'], 'styles.css', { type: 'text/css' }))
      dt.items.add(new File(['data'], 'data.json', { type: 'application/json' }))
      return dt
    })

    await mainArea.dispatchEvent('dragenter', { dataTransfer: dt })
    await mainArea.dispatchEvent('dragover', { dataTransfer: dt })
    await mainArea.dispatchEvent('drop', { dataTransfer: dt })
    await mainArea.dispatchEvent('dragleave', { dataTransfer: dt })

    // Should not error
    await expect(workspace(page).getByText('Claude').first()).toBeVisible()
  })

  test('drop without active agent does not crash', async ({ page }) => {
    // No terminal open — no active agent
    const mainArea = page.locator('main').first()

    const dt = await page.evaluateHandle(() => {
      const dt = new DataTransfer()
      dt.items.add(new File(['test'], 'test.txt', { type: 'text/plain' }))
      return dt
    })

    // Dispatch drop — should be handled gracefully
    await mainArea.dispatchEvent('dragenter', { dataTransfer: dt })
    await mainArea.dispatchEvent('dragover', { dataTransfer: dt })
    await mainArea.dispatchEvent('drop', { dataTransfer: dt })
    await mainArea.dispatchEvent('dragleave', { dataTransfer: dt })

    // No errors should occur, empty workspace should still be visible
    await expect(workspace(page).getByText('No Active Workspace')).toBeVisible()
  })

  test('drag counter correctly tracks multiple nested drag events', async ({ page }) => {
    const mainArea = page.locator('main').first()

    const dt = await page.evaluateHandle(() => {
      const dt = new DataTransfer()
      dt.items.add(new File(['test'], 'test.txt', { type: 'text/plain' }))
      return dt
    })

    // Simulate multiple drag enters (as happens with nested elements)
    await mainArea.dispatchEvent('dragenter', { dataTransfer: dt })
    await mainArea.dispatchEvent('dragenter', { dataTransfer: dt })
    await mainArea.dispatchEvent('dragenter', { dataTransfer: dt })

    // Overlay should be visible
    await expect(page.getByText('Drop files to attach')).toBeVisible()

    // First two drag leaves (counter goes from 3 → 2 → 1, still > 0)
    await mainArea.dispatchEvent('dragleave', { dataTransfer: dt })
    await mainArea.dispatchEvent('dragleave', { dataTransfer: dt })

    // Overlay should still be visible (counter = 1)
    await expect(page.getByText('Drop files to attach')).toBeVisible()

    // Final drag leave (counter goes to 0, overlay should hide)
    await mainArea.dispatchEvent('dragleave', { dataTransfer: dt })
    await expect(page.getByText('Drop files to attach')).not.toBeVisible({ timeout: 2000 })
  })
})
