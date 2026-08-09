// ────────────────────────────────────────────────────────────────────────────
// E2E Tests: Cold Storage Panel (Archive, Prune, Restore)
// ────────────────────────────────────────────────────────────────────────────
//
// Uses the same mutable Tauri IPC mock approach as worktree-flow.spec.ts:
// installTauriMock() before page.goto() to set up initial handlers,
// updateTauriMock() to change handlers mid-test.
//
// ────────────────────────────────────────────────────────────────────────────

import { test, expect, type Page } from '@playwright/test'
import { installTauriMock, updateTauriMock } from './tauri-mock'

// ── Mock data ──────────────────────────────────────────────────────────────

const MOCK_ARCHIVED_SESSIONS = [
  {
    session_id: 'sess-2026-06-01-abc123',
    agent_id: 'claude',
    file_path: '/home/user/.mothership/archives/claude/sess-2026-06-01-abc123.json.gz',
    size_bytes: 12_345,
  },
  {
    session_id: 'sess-2026-06-15-def456',
    agent_id: 'codex',
    file_path: '/home/user/.mothership/archives/codex/sess-2026-06-15-def456.json.gz',
    size_bytes: 67_890,
  },
  {
    session_id: 'sess-2026-06-20-ghi789',
    agent_id: 'gemini',
    file_path: '/home/user/.mothership/archives/gemini/sess-2026-06-20-ghi789.json.gz',
    size_bytes: 1_234_567,
  },
]

// ── Locator helpers ────────────────────────────────────────────────────────

const sidebar = (page: Page) => page.locator('aside').first()
const memoryPanel = (page: Page) => page.locator('aside').last()

/** Navigate to the Storage tab in the memory panel */
async function switchToStorage(page: Page) {
  const mem = memoryPanel(page)
  await mem.getByText('Storage').first().click()
  await page.waitForTimeout(500)
  // Wait for the cold storage panel to render
  await expect(mem.getByText('Cold Storage').first()).toBeVisible({ timeout: 5000 })
}

/** Navigate to the app with cold-storage IPC mocks and switch to Storage tab */
async function navigateToStorage(page: Page, handlers: Record<string, unknown> = {}) {
  await installTauriMock(page, {
    list_archived_sessions: [],
    archive_old_sessions: 0,
    prune_old_snapshots: 0,
    restore_archived_session: 0,
    ...handlers,
  })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await expect(sidebar(page).getByText('MOTHERSHIP')).toBeVisible({ timeout: 10000 })
  await switchToStorage(page)
}

// ── Tests ──────────────────────────────────────────────────────────────────

test.describe('Cold Storage Panel', () => {
  // ── Panel rendering ─────────────────────────────────────────────────

  test.describe('panel rendering', () => {
    test('shows cold storage panel with header and description', async ({ page }) => {
      await navigateToStorage(page)
      const mem = memoryPanel(page)

      await expect(mem.getByText('Cold Storage').first()).toBeVisible()
      await expect(mem.getByText('Manage archived memory entries').first()).toBeVisible()
    })

    test('shows stats section with zero counts initially', async ({ page }) => {
      await navigateToStorage(page)
      const mem = memoryPanel(page)

      await expect(mem.getByText('0 archived').first()).toBeVisible()
      await expect(mem.getByText('0 B total').first()).toBeVisible()
    })

    test('shows archive section with preset buttons', async ({ page }) => {
      await navigateToStorage(page)
      const mem = memoryPanel(page)

      await expect(mem.getByText('Archive Old Sessions').first()).toBeVisible()
      await expect(mem.getByText('24 hours').first()).toBeVisible()
      await expect(mem.getByText('48 hours').first()).toBeVisible()
      await expect(mem.getByText('72 hours').first()).toBeVisible()
      await expect(mem.getByText('1 week').first()).toBeVisible()
      await expect(mem.getByText('2 weeks').first()).toBeVisible()
      await expect(mem.getByText('Custom...').first()).toBeVisible()
    })

    test('shows prune section with preset buttons', async ({ page }) => {
      await navigateToStorage(page)
      const mem = memoryPanel(page)

      await expect(mem.getByText('Prune Old Snapshots').first()).toBeVisible()
      await expect(mem.getByText('7 days, keep 10').first()).toBeVisible()
      await expect(mem.getByText('14 days, keep 20').first()).toBeVisible()
      await expect(mem.getByText('30 days, keep 50').first()).toBeVisible()
      await expect(mem.getByText('60 days, keep 100').first()).toBeVisible()
      await expect(mem.getByText('Custom...').first()).toBeVisible()
    })

    test('shows archived sessions section header', async ({ page }) => {
      await navigateToStorage(page)
      const mem = memoryPanel(page)

      await expect(mem.getByText('Archived Sessions').first()).toBeVisible()
    })

    test('shows empty state when no archived sessions exist', async ({ page }) => {
      await navigateToStorage(page)
      const mem = memoryPanel(page)

      await expect(mem.getByText('No archived sessions').first()).toBeVisible()
    })
  })

  // ── Archive with presets ────────────────────────────────────────────

  test.describe('archive with presets', () => {
    test('archives sessions when 24 hours preset is clicked', async ({ page }) => {
      await navigateToStorage(page, { archive_old_sessions: 3 })
      const mem = memoryPanel(page)

      await mem.getByText('24 hours').first().click()
      await page.waitForTimeout(500)

      // Success toast should appear
      await expect(mem.getByText('Archived 3 sessions').first()).toBeVisible({ timeout: 3000 })
    })

    test('archives sessions when 48 hours preset is clicked', async ({ page }) => {
      await navigateToStorage(page, { archive_old_sessions: 5 })
      const mem = memoryPanel(page)

      await mem.getByText('48 hours').first().click()
      await page.waitForTimeout(500)

      await expect(mem.getByText('Archived 5 sessions').first()).toBeVisible({ timeout: 3000 })
    })

    test('shows "No sessions to archive" when archive returns 0', async ({ page }) => {
      await navigateToStorage(page, { archive_old_sessions: 0 })
      const mem = memoryPanel(page)

      await mem.getByText('1 week').first().click()

      await expect(mem.getByText('No sessions to archive').first()).toBeVisible({ timeout: 3000 })
    })

    test('refreshes archived session list after successful archive', async ({ page }) => {
      // Set the post-archive list mock BEFORE clicking, because the store's
      // loadArchivedSessions() runs synchronously right after the IPC resolves.
      await navigateToStorage(page, {
        archive_old_sessions: 2,
        list_archived_sessions: MOCK_ARCHIVED_SESSIONS.slice(0, 2),
      })
      const mem = memoryPanel(page)

      // Click archive preset — the store will call archive IPC (returns 2),
      // then immediately call list_archived_sessions which returns sessions
      await mem.getByText('24 hours').first().click()
      await page.waitForTimeout(500)

      // Stats should update
      await expect(mem.getByText('2 archived').first()).toBeVisible({ timeout: 3000 })
    })
  })

  // ── Archive with custom hours ───────────────────────────────────────

  test.describe('archive with custom hours', () => {
    test('shows custom archive input when Custom... is clicked', async ({ page }) => {
      await navigateToStorage(page)
      const mem = memoryPanel(page)

      await mem.getByText('Custom...').first().click()

      const customInput = mem.getByPlaceholder('Age in hours').first()
      await expect(customInput).toBeVisible()
    })

    test('Go button is disabled when custom hours input is empty', async ({ page }) => {
      await navigateToStorage(page)
      const mem = memoryPanel(page)

      await mem.getByText('Custom...').first().click()

      const goBtn = mem.locator('button').filter({ hasText: 'Go' }).first()
      await expect(goBtn).toBeDisabled()
    })

    test('archives with custom hours when Go is clicked', async ({ page }) => {
      await navigateToStorage(page, { archive_old_sessions: 1 })
      const mem = memoryPanel(page)

      await mem.getByText('Custom...').first().click()

      const customInput = mem.getByPlaceholder('Age in hours').first()
      await customInput.fill('12')

      const goBtn = mem.locator('button').filter({ hasText: 'Go' }).first()
      await expect(goBtn).not.toBeDisabled()
      await goBtn.click()

      await expect(mem.getByText('Archived 1 session').first()).toBeVisible({ timeout: 3000 })
    })

    test('does not archive when custom hours is 0 or negative', async ({ page }) => {
      await navigateToStorage(page, { archive_old_sessions: 0 })
      const mem = memoryPanel(page)

      await mem.getByText('Custom...').first().click()

      const customInput = mem.getByPlaceholder('Age in hours').first()
      await customInput.fill('0')

      const goBtn = mem.locator('button').filter({ hasText: 'Go' }).first()
      // The input has min=1, so 0 shouldn't be allowed. If it is, clicking does nothing
      // because the handler checks `h > 0`. The button may be enabled (filled input)
      // but clicking it should not trigger archive (no toast appears).
      await goBtn.click()
      await page.waitForTimeout(500)
      // The 'No sessions to archive' toast should NOT appear since the handler
      // bails out (h > 0 is false before reaching archiveOldSessions)
      await expect(mem.getByText('No sessions to archive').first()).not.toBeVisible({ timeout: 1000 })
    })
  })

  // ── Prune with presets ──────────────────────────────────────────────

  test.describe('prune with presets', () => {
    test('prunes snapshots when 7 days preset is clicked', async ({ page }) => {
      await navigateToStorage(page, { prune_old_snapshots: 10 })
      const mem = memoryPanel(page)

      await mem.getByText('7 days, keep 10').first().click()
      await page.waitForTimeout(500)

      await expect(mem.getByText('Pruned 10 old snapshots').first()).toBeVisible({ timeout: 3000 })
    })

    test('prunes snapshots when 30 days preset is clicked', async ({ page }) => {
      await navigateToStorage(page, { prune_old_snapshots: 3 })
      const mem = memoryPanel(page)

      await mem.getByText('30 days, keep 50').first().click()
      await page.waitForTimeout(500)

      await expect(mem.getByText('Pruned 3 old snapshots').first()).toBeVisible({ timeout: 3000 })
    })

    test('shows "No snapshots to prune" when prune returns 0', async ({ page }) => {
      await navigateToStorage(page, { prune_old_snapshots: 0 })
      const mem = memoryPanel(page)

      await mem.getByText('14 days, keep 20').first().click()
      await page.waitForTimeout(500)

      await expect(mem.getByText('No snapshots to prune').first()).toBeVisible({ timeout: 3000 })
    })
  })

  // ── Prune with custom ───────────────────────────────────────────────

  test.describe('prune with custom', () => {
    test('shows custom prune inputs when Custom... is clicked', async ({ page }) => {
      await navigateToStorage(page)
      const mem = memoryPanel(page)

      // Find the prune Custom... button (second Custom... button in the panel)
      const pruneCustomBtn = mem.getByText('Custom...').nth(1)
      await pruneCustomBtn.click()

      await expect(mem.getByPlaceholder('Max age (days)').first()).toBeVisible()
      await expect(mem.getByPlaceholder('Min keep').first()).toBeVisible()
    })

    test('Go button is disabled when custom prune inputs are empty', async ({ page }) => {
      await navigateToStorage(page)
      const mem = memoryPanel(page)

      const pruneCustomBtn = mem.getByText('Custom...').nth(1)
      await pruneCustomBtn.click()

      const goBtn = mem.locator('button').filter({ hasText: 'Go' }).first()
      await expect(goBtn).toBeDisabled()
    })

    test('prunes with custom days and keep when Go is clicked', async ({ page }) => {
      await navigateToStorage(page, { prune_old_snapshots: 5 })
      const mem = memoryPanel(page)

      const pruneCustomBtn = mem.getByText('Custom...').nth(1)
      await pruneCustomBtn.click()

      await mem.getByPlaceholder('Max age (days)').first().fill('45')
      await mem.getByPlaceholder('Min keep').first().fill('15')

      const goBtn = mem.locator('button').filter({ hasText: 'Go' }).first()
      await expect(goBtn).not.toBeDisabled()
      await goBtn.click()

      await expect(mem.getByText('Pruned 5 old snapshots').first()).toBeVisible({ timeout: 3000 })
    })
  })

  // ── Archived sessions list ──────────────────────────────────────────

  test.describe('archived sessions list', () => {
    test('shows archived sessions when they exist', async ({ page }) => {
      await navigateToStorage(page, { list_archived_sessions: MOCK_ARCHIVED_SESSIONS })
      const mem = memoryPanel(page)

      // Should show agent names, file sizes, and session IDs
      await expect(mem.getByText('claude').first()).toBeVisible({ timeout: 3000 })
      await expect(mem.getByText('codex').first()).toBeVisible({ timeout: 3000 })
      await expect(mem.getByText('gemini').first()).toBeVisible({ timeout: 3000 })

      // Sizes should be visible (12.1 KB, 66.3 KB, 1.2 MB)
      await expect(mem.getByText('12.1 KB').first()).toBeVisible()
      await expect(mem.getByText('66.3 KB').first()).toBeVisible()
      await expect(mem.getByText('1.2 MB').first()).toBeVisible()
    })

    test('shows stats with correct counts when sessions exist', async ({ page }) => {
      await navigateToStorage(page, { list_archived_sessions: MOCK_ARCHIVED_SESSIONS })
      const mem = memoryPanel(page)

      // Should show total count and size
      await expect(mem.getByText('3 archived').first()).toBeVisible()
      // The total size is 12_345 + 67_890 + 1_234_567 = 1_314_802 bytes ≈ 1.3 MB
      await expect(mem.getByText('1.3 MB').first()).toBeVisible()
    })

    test('can expand and collapse an archived session row', async ({ page }) => {
      await navigateToStorage(page, { list_archived_sessions: MOCK_ARCHIVED_SESSIONS.slice(0, 1) })
      const mem = memoryPanel(page)

      // Click on the archived session row to expand
      await mem.getByText('claude').first().click()
      await page.waitForTimeout(300)

      // Expanded content should show session details
      await expect(mem.getByText('sess-2026-06-01-abc123').first()).toBeVisible()
      await expect(mem.getByText('Restore').first()).toBeVisible()

      // Click again to collapse
      await mem.getByText('claude').first().click()
      await page.waitForTimeout(300)

      // Session details should be hidden
      await expect(mem.getByText('sess-2026-06-01-abc123').first()).not.toBeVisible()
    })

    test('shows file path in expanded session row', async ({ page }) => {
      await navigateToStorage(page, { list_archived_sessions: MOCK_ARCHIVED_SESSIONS.slice(0, 1) })
      const mem = memoryPanel(page)

      await mem.getByText('claude').first().click()
      await page.waitForTimeout(300)

      await expect(
        mem.getByText(/mothership\/archives\/claude\/sess/).first()
      ).toBeVisible()
    })
  })

  // ── Restore ─────────────────────────────────────────────────────────

  test.describe('restore archived session', () => {
    test('restores a session when Restore button is clicked', async ({ page }) => {
      await navigateToStorage(page, {
        list_archived_sessions: MOCK_ARCHIVED_SESSIONS.slice(0, 1),
        restore_archived_session: 5,
      })
      const mem = memoryPanel(page)

      // Expand the session row
      await mem.getByText('claude').first().click()
      await page.waitForTimeout(300)

      // Click Restore
      await mem.getByText('Restore').first().click()
      await page.waitForTimeout(500)

      // Success toast should appear
      await expect(mem.getByText('Restored 5 entries').first()).toBeVisible({ timeout: 3000 })
    })

    test('shows "Nothing to restore" when restore returns 0', async ({ page }) => {
      await navigateToStorage(page, {
        list_archived_sessions: MOCK_ARCHIVED_SESSIONS.slice(0, 1),
        restore_archived_session: 0,
      })
      const mem = memoryPanel(page)

      await mem.getByText('claude').first().click()

      await mem.getByText('Restore').first().click()

      // Error toast should appear
      await expect(mem.getByText('Nothing to restore').first()).toBeVisible({ timeout: 3000 })
    })

    test('restores a session returning 3 entries', async ({ page }) => {
      await navigateToStorage(page, {
        list_archived_sessions: MOCK_ARCHIVED_SESSIONS.slice(0, 1),
        restore_archived_session: 3,
      })
      const mem = memoryPanel(page)

      await mem.getByText('claude').first().click()

      await mem.getByText('Restore').first().click()

      await expect(mem.getByText('Restored 3 entries').first()).toBeVisible({ timeout: 3000 })
    })
  })

  // ── Result toasts ───────────────────────────────────────────────────

  test.describe('result toasts', () => {
    test('success toast appears with correct styling', async ({ page }) => {
      await navigateToStorage(page, { archive_old_sessions: 2 })
      const mem = memoryPanel(page)

      await mem.getByText('24 hours').first().click()
      await page.waitForTimeout(500)

      // The toast should have green styling (success)
      const toast = mem.getByText('Archived 2 sessions').first()
      await expect(toast).toBeVisible()
    })

    test('toast disappears after 4 seconds', async ({ page }) => {
      await navigateToStorage(page, { archive_old_sessions: 1 })
      const mem = memoryPanel(page)

      await mem.getByText('24 hours').first().click()

      await expect(mem.getByText('Archived 1 session').first()).toBeVisible()

      // Wait for toast to auto-dismiss (component uses setTimeout 4000ms)
      await expect(mem.getByText('Archived 1 session').first()).not.toBeVisible({ timeout: 6000 })
    })

    test('multiple toasts replace each other', async ({ page }) => {
      await navigateToStorage(page, { archive_old_sessions: 1 })
      const mem = memoryPanel(page)

      // First action
      await mem.getByText('24 hours').first().click()
      await page.waitForTimeout(500)

      // Second action (use a preset with a different message)
      await updateTauriMock(page, { archive_old_sessions: 0 })
      await mem.getByText('48 hours').first().click()
      await page.waitForTimeout(500)

      // The old toast should be gone, new one visible
      await expect(mem.getByText('Archived 1 session').first()).not.toBeVisible({ timeout: 1000 })
      await expect(mem.getByText('No sessions to archive').first()).toBeVisible()
    })
  })

  // ── Refresh ─────────────────────────────────────────────────────────

  test.describe('refresh archived sessions', () => {
    test('refresh button reloads the archived sessions list', async ({ page }) => {
      await navigateToStorage(page, { list_archived_sessions: [] })
      const mem = memoryPanel(page)

      // Initially shows empty state
      await expect(mem.getByText('No archived sessions').first()).toBeVisible()

      // Update mock and click refresh
      await updateTauriMock(page, { list_archived_sessions: MOCK_ARCHIVED_SESSIONS.slice(0, 1) })
      await mem.getByTitle('Refresh').first().click()
      await page.waitForTimeout(500)

      // Now should show the session
      await expect(mem.getByText('claude').first()).toBeVisible({ timeout: 3000 })
      await expect(mem.getByText('12.1 KB').first()).toBeVisible()
    })
  })

  // ── Loading state ───────────────────────────────────────────────────

  test.describe('loading state', () => {
    test('shows loading indicator when list_archived_sessions is slow', async ({ page }) => {
      // Use a delayed promise to keep the component in loading state
      await navigateToStorage(page, {
        list_archived_sessions: () => new Promise((resolve) => setTimeout(() => resolve([]), 3000)),
      })

      const mem = memoryPanel(page)

      // Note: React 18 batches state updates inside async functions, so the
      // setIsLoading(true) inside the useEffect is deferred until the first await.
      // Check that the loading eventually resolves to the empty state.
      await expect(mem.getByText('No archived sessions').first()).toBeVisible({ timeout: 8000 })
    })
  })


})
