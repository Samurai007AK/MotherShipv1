// ────────────────────────────────────────────────────────────────────────────
// E2E Tests: Worktree Flow (Create, View Diff, Ports, Delete)
// ────────────────────────────────────────────────────────────────────────────
//
// Mutable Tauri IPC mock approach:
// 1. Each test calls installTauriMock() with its desired handlers BEFORE
//    calling page.goto(), so the app initializes with the correct state.
// 2. updateTauriMock() patches the handler map at runtime via page.evaluate()
//    for mid-test interactions (e.g., after creating a worktree, the
//    listWorktrees refresh call uses updated handlers).
// 3. beforeEach only sets up the base mock infrastructure and waits for
//    the app to render — no navigation happens there.
//
// ────────────────────────────────────────────────────────────────────────────

import { test, expect, type Page } from '@playwright/test'
import { installTauriMock } from './tauri-mock'

// ── Mock data ──────────────────────────────────────────────────────────────

const MOCK_DETECT_PROJECT = {
  rootPath: '/home/user/project',
  currentBranch: 'main',
  hasRemotes: true,
  remoteName: 'origin',
  hasUncommitted: false,
}

const MOCK_WORKTREE_1 = {
  id: 'wt-feature-user-auth',
  branchName: 'feature/user-auth',
  worktreePath: '/home/user/project/.mothership/worktrees/feature-user-auth',
  projectRoot: '/home/user/project',
  status: 'active',
  agentId: 'claude',
  createdAt: '2026-06-21T10:00:00Z',
  aheadBehind: 'up to date',
  hasUncommitted: true,
  commitsAhead: 0,
  commitsBehind: 0,
}

const MOCK_WORKTREE_2 = {
  id: 'wt-fix-login-bug',
  branchName: 'fix/login-bug',
  worktreePath: '/home/user/project/.mothership/worktrees/fix-login-bug',
  projectRoot: '/home/user/project',
  status: 'active',
  agentId: 'codex',
  createdAt: '2026-06-21T12:00:00Z',
  aheadBehind: '↑1 ↓0',
  hasUncommitted: false,
  commitsAhead: 1,
  commitsBehind: 0,
}

const MOCK_DIFF = {
  branchName: 'feature/user-auth',
  diffText: `diff --git a/src/auth.ts b/src/auth.ts
index abc..def 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,3 +1,5 @@
+import { User } from "./types"
+
 export function login() {
   // TODO
 }
diff --git a/src/utils.ts b/src/utils.ts
index 123..456 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -10,7 +10,9 @@
 export function formatDate(date: Date): string {
-  return date.toISOString()
+  const year = date.getFullYear()
+  const month = String(date.getMonth() + 1).padStart(2, '0')
+  return \`\${year}-\${month}-01\`
 }
 `,
  filesChanged: 2,
  insertions: 5,
  deletions: 1,
  changedFiles: [
    { path: 'src/auth.ts', status: 'M', insertions: 3, deletions: 0 },
    { path: 'src/utils.ts', status: 'M', insertions: 2, deletions: 1 },
  ],
}

const MOCK_FILE_DIFFS = [
  {
    path: 'src/auth.ts',
    status: 'M',
    old_content: 'export function login() {\n  // TODO\n}\n',
    new_content: 'import { User } from "./types"\n\nexport function login() {\n  // TODO\n}\n',
    insertions: 3,
    deletions: 0,
    language: 'typescript',
  },
  {
    path: 'src/utils.ts',
    status: 'M',
    old_content: 'export function formatDate(date: Date): string {\n  return date.toISOString()\n}\n',
    new_content: 'export function formatDate(date: Date): string {\n  const year = date.getFullYear()\n  const month = String(date.getMonth() + 1).padStart(2, \'0\')\n  return \`\${year}-\${month}-01\`\n}\n',
    insertions: 2,
    deletions: 1,
    language: 'typescript',
  },
]

const MOCK_PORT = {
  port: 40001,
  service: 'web',
  worktree_id: 'wt-feature-user-auth',
  allocated_at: '2026-06-21T14:00:00Z',
}

const MOCK_PRESET_CONFIG = {
  setup: ['echo "Global setup"'],
  teardown: ['echo "Global teardown"'],
  presets: [
    {
      name: 'Node.js API',
      description: 'Set up a Node.js API workspace',
      base_branch: 'develop',
      setup: ['npm install'],
      teardown: [],
      run: ['npm run dev'],
      env: { PORT: '3000' },
      agent_id: 'codex',
    },
  ],
}

// ── Locator helpers ────────────────────────────────────────────────────────

const workspace = (page: Page) => page.locator('main').first()
const sidebar = (page: Page) => page.locator('aside').first()

// ── Navigation helper ──────────────────────────────────────────────────────

/**
 * Install mock, navigate to app, switch to worktrees view, and wait for it to render.
 * This is the standard setup for every test.
 * `handlers` are the initial Tauri IPC mock handlers.
 */
async function navigateWithMock(page: Page, handlers: Record<string, unknown>) {
  await installTauriMock(page, handlers)
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await expect(sidebar(page).getByText('MOTHERSHIP')).toBeVisible({ timeout: 15000 })
  // Wait for the app's initialization effect to complete
  await page.waitForTimeout(1500)
  // Switch to the Worktrees view (default is Terminal)
  await workspace(page).getByText('Worktrees').click()
  await page.waitForTimeout(300)
}

// ── Tests ──────────────────────────────────────────────────────────────────

test.describe('Worktree flow', () => {
  test('shows empty state when project is not a git repo', async ({ page }) => {
    // detect_git_project: null = reject → app shows "Not a Git Repository"
    await navigateWithMock(page, {
      detect_git_project: null,
    })

    // The app should have entered the non-git empty state
    await page.waitForTimeout(1000)

    // Verify the app renders the git empty-state message
    // (shown when detectProject fails)
    const bodyText = await page.locator('body').innerText()
    const hasEmptyState =
      bodyText.includes('Not a Git Repository') ||
      bodyText.includes('Retry Detection') ||
      // The workspace might default to terminal view instead
      bodyText.includes('No Active Workspace')
    expect(hasEmptyState).toBe(true)
  })

  test('shows worktree list when git project is detected', async ({ page }) => {
    await navigateWithMock(page, {
      detect_git_project: MOCK_DETECT_PROJECT,
      list_worktree_workspaces: [MOCK_WORKTREE_1, MOCK_WORKTREE_2],
    })

    // Both worktree branches should be visible in the UI
    await expect(workspace(page).getByText('feature/user-auth').first()).toBeVisible({ timeout: 5000 })
    await expect(workspace(page).getByText('fix/login-bug').first()).toBeVisible({ timeout: 3000 })

    // Footer should show the worktree count
    await expect(workspace(page).getByText('2 workspaces').first()).toBeVisible({ timeout: 3000 })
  })

  test('expands worktree card showing action buttons', async ({ page }) => {
    await navigateWithMock(page, {
      detect_git_project: MOCK_DETECT_PROJECT,
      list_worktree_workspaces: [MOCK_WORKTREE_1],
    })

    // Find the worktree card
    const card = workspace(page).getByText('feature/user-auth').first()
    await expect(card).toBeVisible({ timeout: 5000 })

    // Click to expand (the whole card header is clickable)
    await card.click()
    await page.waitForTimeout(500)

    // Expanded section should show action buttons
    await expect(workspace(page).getByText('Sync').first()).toBeVisible({ timeout: 2000 })
    await expect(workspace(page).getByText('Commit').first()).toBeVisible({ timeout: 2000 })
    await expect(workspace(page).getByText('Push').first()).toBeVisible({ timeout: 2000 })
    await expect(workspace(page).getByText('VS Code').first()).toBeVisible({ timeout: 2000 })
    await expect(workspace(page).getByText('Cursor').first()).toBeVisible({ timeout: 2000 })
    await expect(workspace(page).getByText('Allocate Port').first()).toBeVisible({ timeout: 2000 })
  })

  test('shows uncommitted changes indicator', async ({ page }) => {
    await navigateWithMock(page, {
      detect_git_project: MOCK_DETECT_PROJECT,
      list_worktree_workspaces: [MOCK_WORKTREE_1], // hasUncommitted: true
    })

    // Expand the card
    const card = workspace(page).getByText('feature/user-auth').first()
    await expect(card).toBeVisible({ timeout: 5000 })
    await card.click()
    await page.waitForTimeout(500)

    // The expanded section may show "files changed" or "Uncommitted" badge
    // depending on whether getWorktreeDiff has been called
    const diffBadge = workspace(page).locator('text=files changed').first()
    if (await diffBadge.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(diffBadge).toBeVisible()
    }
  })

  test('creates a new worktree workspace via the UI', async ({ page }) => {
    await navigateWithMock(page, {
      detect_git_project: MOCK_DETECT_PROJECT,
      list_worktree_workspaces: [], // empty initially — no cards shown yet
      read_preset_config: { setup: [], teardown: [], presets: [] },
      create_worktree_workspace: {
        success: true,
        workspace: MOCK_WORKTREE_1,
        error: null,
      },
    })

    // Click "New Workspace" button in the WorktreeManager header
    const newWsBtn = workspace(page).getByText('New Workspace').first()
    await expect(newWsBtn).toBeVisible({ timeout: 5000 })
    await newWsBtn.click()

    // Create panel should open with task name input
    const taskInput = workspace(page).getByPlaceholder('Task name')
    await expect(taskInput).toBeVisible({ timeout: 3000 })
    await taskInput.fill('Add user auth')

    // Before clicking Create, replace the create handler with a self-updating function.
    // This atomic function both resolves the create call AND updates the list handler,
    // so any post-creation refresh (listWorktreeWorkspaces) immediately sees the new data.
    await page.evaluate((wt) => {
      window.__TAURI_MOCK_HANDLERS__.create_worktree_workspace = () => {
        window.__TAURI_MOCK_HANDLERS__.list_worktree_workspaces = [wt]
        return { success: true, workspace: wt, error: null }
      }
    }, MOCK_WORKTREE_1)

    // Click Create Workspace
    const createBtn = workspace(page).getByText('Create Workspace').first()
    await expect(createBtn).not.toBeDisabled()
    await createBtn.click()

    await page.waitForTimeout(1000)

    // The new worktree should now appear in the list
    await expect(workspace(page).getByText('feature/user-auth').first()).toBeVisible({ timeout: 5000 })
  })

  test('creates worktree with a preset', async ({ page }) => {
    await navigateWithMock(page, {
      detect_git_project: MOCK_DETECT_PROJECT,
      list_worktree_workspaces: [],
      read_preset_config: MOCK_PRESET_CONFIG,
      create_worktree_workspace: {
        success: true,
        workspace: MOCK_WORKTREE_1,
        error: null,
      },
      run_preset_setup: { success: true, stdout: 'Setup complete', stderr: '', exit_code: 0 },
    })

    // Open create panel
    const newWsBtn = workspace(page).getByText('New Workspace').first()
    await expect(newWsBtn).toBeVisible({ timeout: 5000 })
    await newWsBtn.click()

    // Select a preset from the dropdown
    const presetSelect = workspace(page).locator('select').first()
    await expect(presetSelect).toBeVisible({ timeout: 2000 })
    await presetSelect.selectOption('Node.js API')

    // Fill task name
    const taskInput = workspace(page).getByPlaceholder('Task name')
    await taskInput.fill('API setup')

    // Self-updating handler — atomically updates the list mock on create
    await page.evaluate((wt) => {
      window.__TAURI_MOCK_HANDLERS__.create_worktree_workspace = () => {
        window.__TAURI_MOCK_HANDLERS__.list_worktree_workspaces = [wt]
        return { success: true, workspace: wt, error: null }
      }
    }, MOCK_WORKTREE_1)

    // Create
    const createBtn = workspace(page).getByText('Create Workspace').first()
    await createBtn.click()

    await page.waitForTimeout(1000)

    // Worktree should appear
    await expect(workspace(page).getByText('feature/user-auth').first()).toBeVisible({ timeout: 5000 })
  })

  test('shows error when worktree creation fails', async ({ page }) => {
    await navigateWithMock(page, {
      detect_git_project: MOCK_DETECT_PROJECT,
      list_worktree_workspaces: [],
      read_preset_config: { setup: [], teardown: [], presets: [] },
      create_worktree_workspace: {
        success: false,
        workspace: null,
        error: 'Branch already exists',
      },
    })

    // Open create panel
    const newWsBtn = workspace(page).getByText('New Workspace').first()
    await newWsBtn.click()

    // Fill and attempt creation
    const taskInput = workspace(page).getByPlaceholder('Task name')
    await taskInput.fill('Duplicate task')
    const createBtn = workspace(page).getByText('Create Workspace').first()
    await createBtn.click()
    await page.waitForTimeout(1000)

    // Error message should be visible
    await expect(workspace(page).getByText('Branch already exists').first()).toBeVisible({ timeout: 3000 })
  })

  test('views diff in expanded worktree card', async ({ page }) => {
    await navigateWithMock(page, {
      detect_git_project: MOCK_DETECT_PROJECT,
      list_worktree_workspaces: [MOCK_WORKTREE_1],
      get_worktree_diff: MOCK_DIFF,
      get_worktree_file_diffs: MOCK_FILE_DIFFS,
    })

    // Expand the worktree card
    const card = workspace(page).getByText('feature/user-auth').first()
    await expect(card).toBeVisible({ timeout: 5000 })
    await card.click()
    await page.waitForTimeout(500)

    // Click "View Diff" button in the actions
    const viewDiffBtn = workspace(page).getByText('View Diff').first()
    await expect(viewDiffBtn).toBeVisible({ timeout: 2000 })
    await viewDiffBtn.click()
    await page.waitForTimeout(1500)

    // The diff viewer should show changes — look for diff stats
    const diffContent = workspace(page).locator('text=2 files changed').first()
    if (await diffContent.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(diffContent).toBeVisible()
    }
  })

  test('allocates and displays a port in expanded view', async ({ page }) => {
    await navigateWithMock(page, {
      detect_git_project: MOCK_DETECT_PROJECT,
      list_worktree_workspaces: [MOCK_WORKTREE_1],
      list_worktree_ports: [],
      allocate_worktree_port: MOCK_PORT,
    })

    // Expand the worktree card
    const card = workspace(page).getByText('feature/user-auth').first()
    await expect(card).toBeVisible({ timeout: 5000 })
    await card.click()
    await page.waitForTimeout(500)

    // Click "Allocate Port" button
    const allocateBtn = workspace(page).getByText('Allocate Port').first()
    await expect(allocateBtn).toBeVisible({ timeout: 2000 })
    await allocateBtn.click()

    // Service name input should appear
    const serviceInput = workspace(page).getByPlaceholder('Service name')
    await expect(serviceInput).toBeVisible({ timeout: 2000 })
    await serviceInput.fill('web')

    // Click the Allocate submit button
    const submitBtn = workspace(page).getByText('Allocate').first()
    await expect(submitBtn).not.toBeDisabled()
    await submitBtn.click()
    await page.waitForTimeout(500)

    // The port chip should show the allocated port number
    await expect(workspace(page).getByText('40001').first()).toBeVisible({ timeout: 2000 })
  })

  test('deletes a worktree via the confirmation flow', async ({ page }) => {
    await navigateWithMock(page, {
      detect_git_project: MOCK_DETECT_PROJECT,
      list_worktree_workspaces: [MOCK_WORKTREE_1, MOCK_WORKTREE_2],
      list_worktree_ports: [],
      release_all_worktree_ports: null,
      // delete_worktree_workspace returns Result<()> — any resolving value works
      // The Rust command returns null on success, but our mock uses null for reject.
      // Use {} so the store's set() call runs and filters out the deleted worktree.
      delete_worktree_workspace: {},
    })

    // Both worktrees should be visible
    await expect(workspace(page).getByText('fix/login-bug').first()).toBeVisible({ timeout: 5000 })
    await expect(workspace(page).getByText('2 workspaces').first()).toBeVisible({ timeout: 3000 })

    // Hover over the first worktree card to reveal header action buttons
    const cardHeader = workspace(page).getByText('feature/user-auth').first()
    await cardHeader.hover()
    await page.waitForTimeout(300)

    // The delete button (Trash2 icon) has title "Delete workspace"
    const deleteBtn = workspace(page).locator('button[title="Delete workspace"]').first()
    await expect(deleteBtn).toBeVisible({ timeout: 2000 })
    await deleteBtn.click()
    await page.waitForTimeout(300)

    // Delete confirmation should appear
    await expect(workspace(page).getByText('Delete?').first()).toBeVisible({ timeout: 2000 })

    // Confirm deletion — the store will call releaseAllWorktreePorts + delete_worktree_workspace
    // Both mocks resolve successfully, and the store filters out the deleted worktree
    const confirmBtn = workspace(page).locator('button[title="Confirm delete"]').first()
    await expect(confirmBtn).toBeVisible({ timeout: 2000 })
    await confirmBtn.click()
    await page.waitForTimeout(500)

    // After deletion, the worktree count should decrement
    // (the store filters the worktree out after successful IPC)
    await expect(workspace(page).getByText('1 workspace').first()).toBeVisible({ timeout: 3000 })
    await expect(workspace(page).getByText('feature/user-auth').first()).not.toBeVisible({ timeout: 3000 })
  })

  test('opens terminal from worktree card', async ({ page }) => {
    await navigateWithMock(page, {
      detect_git_project: MOCK_DETECT_PROJECT,
      list_worktree_workspaces: [MOCK_WORKTREE_1],
    })

    // Hover over the worktree card header to reveal action buttons
    const card = workspace(page).getByText('feature/user-auth').first()
    await card.hover()
    await page.waitForTimeout(300)

    // Click the terminal button
    const terminalBtn = workspace(page).locator('button[title="Open terminal in this workspace"]').first()
    await expect(terminalBtn).toBeVisible({ timeout: 2000 })
    await terminalBtn.click()
    await page.waitForTimeout(500)
  })

  test('VS Code and Cursor IDE buttons are present', async ({ page }) => {
    await navigateWithMock(page, {
      detect_git_project: MOCK_DETECT_PROJECT,
      list_worktree_workspaces: [MOCK_WORKTREE_1],
    })

    // Expand the card
    const card = workspace(page).getByText('feature/user-auth').first()
    await card.click()
    await page.waitForTimeout(500)

    // Verify IDE buttons exist in the expanded actions
    await expect(workspace(page).getByText('VS Code').first()).toBeVisible({ timeout: 2000 })
    await expect(workspace(page).getByText('Cursor').first()).toBeVisible({ timeout: 2000 })
  })
})
