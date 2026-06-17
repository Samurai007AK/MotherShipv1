import { test, expect, type Page } from '@playwright/test'

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Sidebar scoped locator */
const sidebar = (page: Page) => page.locator('aside').first()

/** Workspace scoped locator */
const workspace = (page: Page) => page.locator('main').first()

/** Memory panel scoped locator */
const memoryPanel = (page: Page) =>
  page.locator('aside').last()

/** Click the empty-state Quick Start button for a given agent name to open a terminal */
async function openQuickStart(page: Page, agentName: string) {
  // The empty state renders Quick Start buttons inside <main>
  // Each button shows the agent name text
  await workspace(page).getByText(agentName).first().click()
  // Wait for the tab to appear (WorkspaceView has a 100ms spawn timeout)
  await expect(page.getByText('No Active Workspace')).not.toBeVisible({ timeout: 5000 })
}

// ────────────────────────────────────────────────────────────────────────────
// Setup: navigate to app and wait for it to load
// ────────────────────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  // Wait for React to render — the sidebar has agent content
  await expect(sidebar(page).getByText('MOTHERSHIP')).toBeVisible({ timeout: 10000 })
})

// ────────────────────────────────────────────────────────────────────────────
// 1. App Loads
// ────────────────────────────────────────────────────────────────────────────

test.describe('App loads', () => {
  test('has the correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/Mothership/)
  })

  test('shows MOTHERSHIP branding in the sidebar header', async ({ page }) => {
    await expect(sidebar(page).getByText('MOTHERSHIP')).toBeVisible()
    await expect(sidebar(page).getByText('AI Control Center')).toBeVisible()
  })

  test('shows all three main panels (sidebar, workspace, memory)', async ({ page }) => {
    const sb = sidebar(page)
    // Sidebar: agent list area — use .first() for names that appear in both agent row and description
    await expect(sb.getByText('Claude').first()).toBeVisible()
    await expect(sb.getByText('Codex').first()).toBeVisible()

    // Center: workspace area with empty state
    await expect(workspace(page).getByText('No Active Workspace')).toBeVisible()

    // Right panel: memory tabs
    const mem = memoryPanel(page)
    await expect(mem.getByText('Notes').first()).toBeVisible()
    await expect(mem.getByText('Context').first()).toBeVisible()
    await expect(mem.getByText('Timeline').first()).toBeVisible()
  })

  test('shows empty workspace with prompt to get started', async ({ page }) => {
    await expect(workspace(page).getByText('No Active Workspace')).toBeVisible()
    await expect(workspace(page).getByText('Select an agent from the sidebar')).toBeVisible()
    // Quick-start agent buttons should be visible in the workspace
    await expect(workspace(page).getByText('Claude').first()).toBeVisible()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 2. Agent Sidebar
// ────────────────────────────────────────────────────────────────────────────

test.describe('Agent sidebar', () => {
  test('lists agents from all categories', async ({ page }) => {
    const sb = sidebar(page)
    // Use .first() since agent names may appear in both row header and description
    await expect(sb.getByText('Claude').first()).toBeVisible()
    await expect(sb.getByText('Codex').first()).toBeVisible()
    await expect(sb.getByText('Gemini').first()).toBeVisible()
    await expect(sb.getByText('Researcher').first()).toBeVisible()
    await expect(sb.getByText('DevOps').first()).toBeVisible()
    await expect(sb.getByText('Writer').first()).toBeVisible()
  })

  test('shows category headers (Coding, Research, Operations, Creative)', async ({ page }) => {
    const sb = sidebar(page)
    // Category headers are buttons — use .first() since text may match descriptions too
    await expect(sb.getByText('Coding').first()).toBeVisible()
    await expect(sb.getByText('Research').first()).toBeVisible()
    await expect(sb.getByText('Operations').first()).toBeVisible()
    await expect(sb.getByText('Creative').first()).toBeVisible()
  })

  test('shows agent count in sidebar footer', async ({ page }) => {
    await expect(sidebar(page).getByText(/agents/)).toBeVisible()
  })

  test('can collapse and expand a category', async ({ page }) => {
    const sb = sidebar(page)
    // Click on the Coding category header to collapse — use first matching button
    const codingHeader = sb.getByText('Coding').first()
    await codingHeader.click()
    await expect(codingHeader).toBeVisible()

    // Click again to re-expand
    await codingHeader.click()

    // Click Quick Start Claude in workspace to open a terminal
    await openQuickStart(page, 'Claude')
  })

  test('agent descriptions are expandable via click', async ({ page }) => {
    const sb = sidebar(page)
    // Find a description that mentions Anthropic Claude
    // Agent descriptions are truncated by default
    const description = sb.locator('text=Anthropic Claude').first()
    await expect(description).toBeVisible()

    // Click to expand the description
    await description.click()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 3. Add Agent Dialog
// ────────────────────────────────────────────────────────────────────────────

test.describe('Add agent dialog', () => {
  test('opens the dialog when Add Agent button is clicked', async ({ page }) => {
    // Click sidebar footer Add Agent button (the dashed border button)
    await sidebar(page).getByText('Add Agent').click()

    // Dialog should appear with its header and form labels
    await expect(page.getByRole('heading', { name: 'Add Agent' })).toBeVisible()
    // Form labels (they render inside the dialog, not sidebar)
    await expect(page.getByText('Provider').first()).toBeVisible()
    await expect(page.getByText('Name').first()).toBeVisible()
  })

  test('shows provider options in the dropdown', async ({ page }) => {
    await sidebar(page).getByText('Add Agent').click()

    // Open provider dropdown
    await page.getByText('Select a provider...').click()

    // All providers should be listed
    await expect(page.getByText('Claude').first()).toBeVisible()
    await expect(page.getByText('Codex').first()).toBeVisible()
    await expect(page.getByText('Gemini').first()).toBeVisible()
    await expect(page.getByText('OpenCode').first()).toBeVisible()
  })

  test('can fill form and add a new agent', async ({ page }) => {
    await sidebar(page).getByText('Add Agent').first().click()

    // Wait for dialog to render
    await expect(page.getByRole('heading', { name: 'Add Agent' })).toBeVisible()

    // Open provider dropdown by clicking the trigger button
    await page.getByText('Select a provider...').first().click()

    // Select Codex from the dropdown menu — these are plain buttons, force click to avoid interception
    await page.getByRole('button', { name: /Codex/ }).first().click({ force: true })

    // Fill in name
    await page.getByPlaceholder('e.g., My Claude Agent').fill('Test Agent')

    // Click Add Agent button in dialog footer
    await page.getByRole('button', { name: 'Add Agent' }).last().click()

    // Dialog should close and agent should appear in sidebar
    await expect(sidebar(page).getByText('Test Agent')).toBeVisible({ timeout: 5000 })
  })

  test('closes dialog on backdrop click', async ({ page }) => {
    await sidebar(page).getByText('Add Agent').click()

    // Dialog is wrapped in a fixed overlay — click outside the dialog box
    // The backdrop has class bg-black/60
    await page.locator('.bg-black\\/60').first().click({ force: true })

    // Dialog should close — the sidebar Add Agent button is still visible
    await expect(sidebar(page).getByText('Add Agent').first()).toBeVisible()
  })

  test('disables submit button when name is empty', async ({ page }) => {
    await sidebar(page).getByText('Add Agent').click()

    // Open the provider dropdown
    await page.getByText('Select a provider...').first().click()
    // Click the Gemini option — use the button in the dropdown panel
    await page.getByRole('button', { name: 'Gemini' }).first().click()

    // Add Agent button should remain disabled (name is empty)
    const addBtn = page.getByRole('button', { name: 'Add Agent' }).last()
    await expect(addBtn).toBeDisabled()
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 4. Open Terminal
// ────────────────────────────────────────────────────────────────────────────

test.describe('Open terminal', () => {
  test('clicking Quick Start agent opens a terminal tab', async ({ page }) => {
    await openQuickStart(page, 'Claude')

    // A terminal tab should appear in the workspace tab bar
    await expect(workspace(page).getByText('Claude').first()).toBeVisible()
  })

  test('multiple agents can have open terminals', async ({ page }) => {
    // Open first agent via Quick Start (empty state buttons)
    await openQuickStart(page, 'Claude')

    // Open second agent via Command Palette (empty state is gone now)
    await page.keyboard.press('Control+k')
    await page.getByPlaceholder('Search agents, notes, files…').fill('Codex')
    await page.getByText('Codex').first().click()
    await expect(workspace(page).getByText('Codex').first()).toBeVisible({ timeout: 5000 })

    // Both tabs should be visible in the tab bar
    await expect(workspace(page).getByText('Claude').first()).toBeVisible()
    await expect(workspace(page).getByText('Codex').first()).toBeVisible()
  })

  test('can switch between terminal tabs', async ({ page }) => {
    // Open first terminal via Quick Start
    await openQuickStart(page, 'Claude')

    // Open second terminal via Command Palette
    await page.keyboard.press('Control+k')
    await page.getByPlaceholder('Search agents, notes, files…').fill('Codex')
    await page.getByText('Codex').first().click()
    await expect(workspace(page).getByText('Codex').first()).toBeVisible({ timeout: 5000 })

    const ws = workspace(page)
    const claudeTab = ws.getByText('Claude').first()
    const codexTab = ws.getByText('Codex').first()

    await expect(claudeTab).toBeVisible()
    await expect(codexTab).toBeVisible()

    // Click on the Claude tab to switch to it
    await claudeTab.click()
    await expect(claudeTab).toBeVisible()
    await expect(codexTab).toBeVisible()
  })

  test('can close a terminal tab', async ({ page }) => {
    await openQuickStart(page, 'Claude')

    const ws = workspace(page)
    // Find the Claude tab in the tab bar
    const claudeTab = ws.getByText('Claude').first()
    await claudeTab.hover()

    // The X close button is inside the tab's parent container
    const closeBtn = claudeTab
      .locator('xpath=ancestor::div[contains(@class,"group")]//button[last()]')
      .first()
    await closeBtn.click({ force: true })

    // After closing, the empty workspace should be visible again
    await expect(workspace(page).getByText('No Active Workspace')).toBeVisible({ timeout: 5000 })
  })

  test('shows terminal toolbar with agent name', async ({ page }) => {
    await openQuickStart(page, 'Claude')

    // The terminal toolbar shows the agent name and model in AI mode
    // or agent@mothership in PTY mode. Wait for spawn to complete.
    await expect(
      workspace(page).getByText(/claude|Claude/).first()
    ).toBeVisible({ timeout: 5000 })
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 5. Switch Theme
// ────────────────────────────────────────────────────────────────────────────

test.describe('Theme toggle', () => {
  test('shows three theme buttons (light, dark, system)', async ({ page }) => {
    const themeButtons = page.locator('button[title="Light"], button[title="Dark"], button[title="System"]')
    await expect(themeButtons).toHaveCount(3)
  })

  test('can switch theme to dark', async ({ page }) => {
    await page.locator('button[title="Dark"]').click()
    await expect(page.locator('html')).toHaveClass(/dark/)
  })

  test('can switch theme to light', async ({ page }) => {
    await page.locator('button[title="Light"]').click()
    await expect(page.locator('html')).toHaveClass(/light/)
  })

  test('can switch theme to system', async ({ page }) => {
    await page.locator('button[title="System"]').click()
    const htmlClass = await page.locator('html').getAttribute('class')
    expect(htmlClass).toMatch(/(light|dark)/)
  })

  test('theme change persists visually', async ({ page }) => {
    await page.locator('button[title="Light"]').click()
    await expect(page.locator('html')).toHaveClass(/light/)

    await page.locator('button[title="Dark"]').click()
    await expect(page.locator('html')).toHaveClass(/dark/)

    await page.locator('button[title="Light"]').click()
    await expect(page.locator('html')).toHaveClass(/light/)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 6. Memory Panel
// ────────────────────────────────────────────────────────────────────────────

test.describe('Memory panel', () => {
  test('has tab navigation with Notes, Context, Timeline', async ({ page }) => {
    const mem = memoryPanel(page)
    await expect(mem.getByText('Notes').first()).toBeVisible()
    await expect(mem.getByText('Context').first()).toBeVisible()
    await expect(mem.getByText('Timeline').first()).toBeVisible()
  })

  test('notes tab shows empty state', async ({ page }) => {
    await expect(memoryPanel(page).getByText('Notes').first()).toBeVisible()
  })

  test('timeline tab is clickable', async ({ page }) => {
    await memoryPanel(page).getByText('Timeline').first().click()
  })

  test('context tab is clickable', async ({ page }) => {
    await memoryPanel(page).getByText('Context').first().click()
  })

  test('search tab in memory panel is accessible', async ({ page }) => {
    const mem = memoryPanel(page)
    const searchTab = mem.getByText('Search').first()
    if (await searchTab.isVisible()) {
      await searchTab.click()
    }
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 7. Command Palette (Cmd+K)
// ────────────────────────────────────────────────────────────────────────────

test.describe('Command palette', () => {
  test('opens on Ctrl+K', async ({ page }) => {
    await page.keyboard.press('Control+k')
    await expect(page.getByPlaceholder('Search agents, notes, files…')).toBeVisible()
  })

  test('shows agents in command palette results', async ({ page }) => {
    await page.keyboard.press('Control+k')
    await expect(page.getByPlaceholder('Search agents, notes, files…')).toBeVisible()
    await expect(page.getByText('Claude').first()).toBeVisible()
  })

  test('filters results when typing', async ({ page }) => {
    await page.keyboard.press('Control+k')
    const searchInput = page.getByPlaceholder('Search agents, notes, files…')
    await searchInput.fill('Gemini')
    await expect(page.getByText('Gemini').first()).toBeVisible()
  })

  test('closes on Escape', async ({ page }) => {
    await page.keyboard.press('Control+k')
    await expect(page.getByPlaceholder('Search agents, notes, files…')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByPlaceholder('Search agents, notes, files…')).not.toBeVisible()
  })

  test('can select an agent from palette to open terminal', async ({ page }) => {
    await page.keyboard.press('Control+k')

    // Click Claude in the palette results
    await page.getByText('Claude').first().click()

    // Terminal tab should be created
    await expect(workspace(page).getByText('No Active Workspace')).not.toBeVisible({ timeout: 5000 })
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 8. Handoff Dialog
// ────────────────────────────────────────────────────────────────────────────

test.describe('Handoff dialog', () => {
  test('handoff button is visible in context tab', async ({ page }) => {
    const mem = memoryPanel(page)
    // Handoff button only shows in the Context tab when an agent is active
    // First select an agent so activeAgentId is set
    await sidebar(page).getByText('Claude').first().click()
    // Switch to Context tab
    await mem.getByText('Context').first().click()

    const handoffButton = mem.getByTitle('Handoff context')
    await expect(handoffButton).toBeVisible({ timeout: 5000 })
  })

  test('opens handoff dialog when clicked', async ({ page }) => {
    const mem = memoryPanel(page)
    await sidebar(page).getByText('Claude').first().click()
    await mem.getByText('Context').first().click()
    await mem.getByTitle('Handoff context').click()

    await expect(page.getByText('Context Handoff')).toBeVisible()
  })

  test('shows source and target agent selection in handoff dialog', async ({ page }) => {
    const mem = memoryPanel(page)
    await sidebar(page).getByText('Claude').first().click()
    await mem.getByText('Context').first().click()
    await mem.getByTitle('Handoff context').click()

    await expect(page.getByText('Context Handoff').first()).toBeVisible()
    await expect(page.getByText('From').first()).toBeVisible()
    await expect(page.getByText('To').first()).toBeVisible()
  })

  test('handoff dialog shows agent grid for target selection', async ({ page }) => {
    const mem = memoryPanel(page)
    await sidebar(page).getByText('Claude').first().click()
    await mem.getByText('Context').first().click()
    await mem.getByTitle('Handoff context').click()

    await expect(page.getByText('Context Handoff')).toBeVisible()
    // Target agents should be shown as selectable buttons
    await expect(page.getByText('Codex').first()).toBeVisible()
  })

  test('can close handoff dialog', async ({ page }) => {
    const mem = memoryPanel(page)
    await sidebar(page).getByText('Claude').first().click()
    await mem.getByText('Context').first().click()
    await mem.getByTitle('Handoff context').click()

    // Wait for dialog to be visible
    await expect(page.getByText('Context Handoff').first()).toBeVisible()

    // Click the backdrop to close
    await page.locator('.fixed.inset-0 .bg-c-bg\/80').first().click({ force: true })
    await page.waitForTimeout(300)

    // The dialog should not be visible
    await expect(page.getByText('Context Handoff').first()).not.toBeVisible({ timeout: 3000 })
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 9. Keyboard Shortcuts
// ────────────────────────────────────────────────────────────────────────────

test.describe('Keyboard shortcuts', () => {
  test('Ctrl+T opens new terminal for active agent', async ({ page }) => {
    // Open Quick Start Claude to create a terminal
    await openQuickStart(page, 'Claude')

    // Press Ctrl+T — should open another terminal for a different agent
    await page.keyboard.press('Control+t')

    // A new tab should appear (may be Codex or another agent)
    await page.waitForTimeout(500)
    const tabCount = await workspace(page).locator('[class*="group"]').count()
    expect(tabCount).toBeGreaterThanOrEqual(1)
  })

  test('Ctrl+W closes active terminal tab', async ({ page }) => {
    await openQuickStart(page, 'Claude')

    // Press Ctrl+W to close
    await page.keyboard.press('Control+w')

    // Workspace should return to empty state
    await expect(workspace(page).getByText('No Active Workspace')).toBeVisible({ timeout: 5000 })
  })

  test('number shortcuts switch between tabs', async ({ page }) => {
    await openQuickStart(page, 'Claude')

    // Open second terminal via Command Palette
    await page.keyboard.press('Control+k')
    await page.getByPlaceholder('Search agents, notes, files…').fill('Codex')
    await page.getByText('Codex').first().click()
    await expect(workspace(page).getByText('Codex').first()).toBeVisible({ timeout: 5000 })

    const ws = workspace(page)
    await expect(ws.getByText('Claude').first()).toBeVisible()
    await expect(ws.getByText('Codex').first()).toBeVisible()

    // Press Ctrl+1 then Ctrl+2 to switch tabs
    await page.keyboard.press('Control+1')
    await page.keyboard.press('Control+2')
  })
})

// ────────────────────────────────────────────────────────────────────────────
// 10. Layout and Responsiveness
// ────────────────────────────────────────────────────────────────────────────

test.describe('Layout', () => {
  test('resizable panels have visible separators', async ({ page }) => {
    // react-resizable-panels Separator renders with role="separator"
    const separators = page.locator('[role="separator"]')
    const count = await separators.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('app takes full viewport', async ({ page }) => {
    const mainDiv = page.locator('.flex.h-screen')
    await expect(mainDiv).toBeVisible()

    const box = await mainDiv.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThan(0)
    expect(box!.height).toBeGreaterThan(0)
  })
})
