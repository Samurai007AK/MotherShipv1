import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useWorktreeStore, getWorktreeForPath, type WorktreeInfo, type WorktreeDiff, type ProjectGitInfo } from '../../stores/worktreeStore'
import { useMemoryStore } from '../../stores/memoryStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'
const mockInvoke = vi.mocked(invoke)

// ── Fixtures ───────────────────────────────────────────────────────────────

const MOCK_WORKTREE_1: WorktreeInfo = {
  id: 'wt-1',
  branchName: 'feature/user-auth',
  worktreePath: '/tmp/test-repo/.mothership/worktrees/feature-user-auth',
  projectRoot: '/tmp/test-repo',
  status: 'clean',
  agentId: 'claude',
  createdAt: '2026-06-21T10:00:00Z',
  aheadBehind: null,
  hasUncommitted: false,
  commitsAhead: 0,
  commitsBehind: 0,
}

const MOCK_WORKTREE_2: WorktreeInfo = {
  id: 'wt-2',
  branchName: 'fix/login-bug',
  worktreePath: '/tmp/test-repo/.mothership/worktrees/fix-login-bug',
  projectRoot: '/tmp/test-repo',
  status: 'dirty',
  agentId: 'codex',
  createdAt: '2026-06-21T11:00:00Z',
  aheadBehind: '1 ahead, 0 behind',
  hasUncommitted: true,
  commitsAhead: 1,
  commitsBehind: 0,
}

const MOCK_DIFF: WorktreeDiff = {
  branchName: 'feature/user-auth',
  diffText: 'diff --git a/src/auth.ts b/src/auth.ts\nindex abc..def 100644\n--- a/src/auth.ts\n+++ b/src/auth.ts\n@@ -1,3 +1,5 @@\n+import { User } from "./types"\n+\n export function login() {\n   // TODO\n }\n',
  filesChanged: 1,
  insertions: 3,
  deletions: 0,
  changedFiles: [
    { path: 'src/auth.ts', status: 'modified', insertions: 3, deletions: 0 },
  ],
}

const MOCK_PROJECT_INFO: ProjectGitInfo = {
  rootPath: '/tmp/test-repo',
  currentBranch: 'main',
  hasRemotes: true,
  remoteName: 'origin',
  hasUncommitted: false,
}

const MOCK_CREATE_RESULT = {
  success: true,
  workspace: MOCK_WORKTREE_1,
  error: null,
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('worktreeStore', () => {
  beforeEach(() => {
    // Reset all stores to clean state
    useWorktreeStore.setState({
      worktrees: [],
      activeWorktreeId: null,
      isInitialized: false,
      projectInfo: null,
      isGitAvailable: false,
      workspaceView: 'terminal',
      worktreeDiffCache: new Map(),
    })

    useMemoryStore.setState({
      notes: [],
      contextHistory: [],
      activeTab: 'notes',
      searchQuery: '',
      contextFilter: '',
      handoffHistory: [],
      sessions: [],
      globalSearchQuery: '',
      searchResults: [],
      isLoaded: true,
    })

    // Reset workspace store to remove any tabs from previous tests
    useWorkspaceStore.setState({
      tabs: [],
      activeTabId: null,
      splitPanes: new Map(),
      activeSplitPaneId: null,
    })

    // Reset mock invoke
    mockInvoke.mockReset()
    // Clear all spies (e.g., addTab spy in openWorktreeTerminal tests)
    vi.restoreAllMocks()
  })

  // ── detectProject ──────────────────────────────────────────────────────

  describe('detectProject', () => {
    it('detects a git project successfully', async () => {
      mockInvoke.mockResolvedValueOnce(MOCK_PROJECT_INFO)

      const result = await useWorktreeStore.getState().detectProject('/tmp/test-repo')

      expect(result).toEqual(MOCK_PROJECT_INFO)
      expect(useWorktreeStore.getState().projectInfo).toEqual(MOCK_PROJECT_INFO)
      expect(useWorktreeStore.getState().isGitAvailable).toBe(true)
      expect(useWorktreeStore.getState().isInitialized).toBe(true)
      expect(mockInvoke).toHaveBeenCalledWith('detect_git_project', {
        path: '/tmp/test-repo',
      })
    })

    it('handles detection failure gracefully', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Not a git repository'))

      const result = await useWorktreeStore.getState().detectProject('/tmp/bad-path')

      expect(result).toBeNull()
      expect(useWorktreeStore.getState().projectInfo).toBeNull()
      expect(useWorktreeStore.getState().isGitAvailable).toBe(false)
      expect(useWorktreeStore.getState().isInitialized).toBe(true)
    })

    it('defaults path to current directory when not specified', async () => {
      mockInvoke.mockResolvedValueOnce(MOCK_PROJECT_INFO)

      await useWorktreeStore.getState().detectProject()

      expect(mockInvoke).toHaveBeenCalledWith('detect_git_project', { path: '.' })
    })
  })

  // ── createWorktree ─────────────────────────────────────────────────────

  describe('createWorktree', () => {
    it('creates a worktree and adds it to the list', async () => {
      mockInvoke.mockResolvedValueOnce(MOCK_CREATE_RESULT)

      const result = await useWorktreeStore
        .getState()
        .createWorktree('/tmp/test-repo', 'Add user auth', 'main', 'claude')

      expect(result.success).toBe(true)
      expect(result.workspace).toEqual(MOCK_WORKTREE_1)
      expect(useWorktreeStore.getState().worktrees).toContainEqual(MOCK_WORKTREE_1)
      expect(useWorktreeStore.getState().activeWorktreeId).toBe(MOCK_WORKTREE_1.id)
      expect(mockInvoke).toHaveBeenCalledWith('create_worktree_workspace', {
        projectPath: '/tmp/test-repo',
        taskName: 'Add user auth',
        baseBranch: 'main',
        agentId: 'claude',
      })
    })

    it('records creation in shared memory', async () => {
      mockInvoke.mockResolvedValueOnce(MOCK_CREATE_RESULT)

      await useWorktreeStore
        .getState()
        .createWorktree('/tmp/test-repo', 'Add user auth', 'main', 'claude')

      const { notes, contextHistory } = useMemoryStore.getState()
      // Should have created a note about the workspace creation
      expect(notes.length).toBe(1)
      expect(notes[0].content).toContain('Add user auth')
      expect(notes[0].content).toContain('feature/user-auth')
      expect(notes[0].tags).toContain('worktree')
      expect(notes[0].tags).toContain('workspace-created')
      expect(notes[0].agentId).toBe('claude')

      // Should have created a context entry
      expect(contextHistory.length).toBe(1)
      expect(contextHistory[0].content).toContain('Add user auth')
      expect(contextHistory[0].agentId).toBe('claude')
      expect(contextHistory[0].entryType).toBe('summary')
    })

    it('handles creation failure', async () => {
      mockInvoke.mockResolvedValueOnce({
        success: false,
        workspace: null,
        error: 'Branch already exists',
      })

      const result = await useWorktreeStore
        .getState()
        .createWorktree('/tmp/test-repo', 'Duplicate task', 'main')

      expect(result.success).toBe(false)
      expect(result.workspace).toBeNull()
      expect(result.error).toBe('Branch already exists')
      expect(useWorktreeStore.getState().worktrees.length).toBe(0)
    })

    it('handles invoke rejection', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Git error: merge conflict'))

      const result = await useWorktreeStore
        .getState()
        .createWorktree('/tmp/test-repo', 'Failing task', 'main')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Git error')
    })

    it('creates worktree without optional agentId and baseBranch', async () => {
      mockInvoke.mockResolvedValueOnce(MOCK_CREATE_RESULT)

      await useWorktreeStore
        .getState()
        .createWorktree('/tmp/test-repo', 'No agent task')

      expect(mockInvoke).toHaveBeenCalledWith('create_worktree_workspace', {
        projectPath: '/tmp/test-repo',
        taskName: 'No agent task',
        baseBranch: null,
        agentId: null,
      })
    })

    it('records creation with system agentId when none provided', async () => {
      mockInvoke.mockResolvedValueOnce(MOCK_CREATE_RESULT)

      await useWorktreeStore
        .getState()
        .createWorktree('/tmp/test-repo', 'System task')

      const { contextHistory } = useMemoryStore.getState()
      expect(contextHistory[0].agentId).toBe('system')
    })
  })

  // ── listWorktrees ──────────────────────────────────────────────────────

  describe('listWorktrees', () => {
    it('lists worktrees and updates state', async () => {
      mockInvoke.mockResolvedValueOnce([MOCK_WORKTREE_1, MOCK_WORKTREE_2])

      await useWorktreeStore.getState().listWorktrees('/tmp/test-repo')

      expect(useWorktreeStore.getState().worktrees).toEqual([
        MOCK_WORKTREE_1,
        MOCK_WORKTREE_2,
      ])
      expect(mockInvoke).toHaveBeenCalledWith('list_worktree_workspaces', {
        projectPath: '/tmp/test-repo',
      })
    })

    it('handles empty list', async () => {
      mockInvoke.mockResolvedValueOnce([])

      await useWorktreeStore.getState().listWorktrees('/tmp/test-repo')

      expect(useWorktreeStore.getState().worktrees).toEqual([])
    })

    it('handles invoke failure gracefully and preserves previous state', async () => {
      // Seed existing worktrees to verify state is preserved on failure
      useWorktreeStore.setState({ worktrees: [MOCK_WORKTREE_1] })
      mockInvoke.mockRejectedValueOnce(new Error('Git not found'))

      await expect(
        useWorktreeStore.getState().listWorktrees('/tmp/test-repo')
      ).resolves.toBeUndefined()

      // Previous worktrees should still be present
      expect(useWorktreeStore.getState().worktrees).toEqual([MOCK_WORKTREE_1])
    })
  })

  // ── deleteWorktree ─────────────────────────────────────────────────────

  describe('deleteWorktree', () => {
    beforeEach(() => {
      // Seed with two worktrees
      useWorktreeStore.setState({
        worktrees: [MOCK_WORKTREE_1, MOCK_WORKTREE_2],
        activeWorktreeId: MOCK_WORKTREE_1.id,
      })
    })

    it('deletes a worktree and removes it from the list', async () => {
      mockInvoke.mockResolvedValueOnce(undefined)

      await useWorktreeStore.getState().deleteWorktree(MOCK_WORKTREE_1.worktreePath)

      expect(useWorktreeStore.getState().worktrees).not.toContainEqual(MOCK_WORKTREE_1)
      expect(useWorktreeStore.getState().worktrees).toContainEqual(MOCK_WORKTREE_2)
      expect(mockInvoke).toHaveBeenCalledWith('delete_worktree_workspace', {
        worktreePath: MOCK_WORKTREE_1.worktreePath,
        deleteBranch: false,
      })
    })

    it('clears activeWorktreeId when deleting the active worktree', async () => {
      expect(useWorktreeStore.getState().activeWorktreeId).toBe(MOCK_WORKTREE_1.id)
      mockInvoke.mockResolvedValueOnce(undefined)

      await useWorktreeStore.getState().deleteWorktree(MOCK_WORKTREE_1.worktreePath)

      expect(useWorktreeStore.getState().activeWorktreeId).toBeNull()
    })

    it('preserves activeWorktreeId when deleting a non-active worktree', async () => {
      useWorktreeStore.setState({ activeWorktreeId: MOCK_WORKTREE_1.id })
      mockInvoke.mockResolvedValueOnce(undefined)

      await useWorktreeStore.getState().deleteWorktree(MOCK_WORKTREE_2.worktreePath)

      expect(useWorktreeStore.getState().activeWorktreeId).toBe(MOCK_WORKTREE_1.id)
    })

    it('passes deleteBranch flag to backend', async () => {
      mockInvoke.mockResolvedValueOnce(undefined)

      await useWorktreeStore.getState().deleteWorktree(MOCK_WORKTREE_1.worktreePath, true)

      expect(mockInvoke).toHaveBeenCalledWith('delete_worktree_workspace', {
        worktreePath: MOCK_WORKTREE_1.worktreePath,
        deleteBranch: true,
      })
    })

    it('handles deletion failure gracefully', async () => {
      // deleteWorktree now calls release_all_worktree_ports first, then
      // delete_worktree_workspace — both need to fail to preserve the list
      mockInvoke.mockRejectedValue(new Error('Permission denied'))
      const initialCount = useWorktreeStore.getState().worktrees.length

      await useWorktreeStore.getState().deleteWorktree(MOCK_WORKTREE_1.worktreePath)

      // Worktree should remain in the list since the delete IPC call failed
      expect(useWorktreeStore.getState().worktrees.length).toBe(initialCount)
    })
  })

  // ── syncWorktree ───────────────────────────────────────────────────────

  describe('syncWorktree', () => {
    it('syncs worktree and refreshes the list', async () => {
      mockInvoke.mockResolvedValueOnce('Synced successfully')
      // listWorktrees call from within syncWorktree
      mockInvoke.mockResolvedValueOnce([MOCK_WORKTREE_1])

      const result = await useWorktreeStore
        .getState()
        .syncWorktree(MOCK_WORKTREE_1.worktreePath)

      expect(result).toBe('Synced successfully')
      expect(mockInvoke).toHaveBeenCalledWith('sync_worktree_workspace', {
        worktreePath: MOCK_WORKTREE_1.worktreePath,
        baseBranch: null,
      })
    })

    it('passes baseBranch to backend', async () => {
      mockInvoke.mockResolvedValueOnce('Synced to main')
      mockInvoke.mockResolvedValueOnce([])

      await useWorktreeStore
        .getState()
        .syncWorktree(MOCK_WORKTREE_1.worktreePath, 'main')

      expect(mockInvoke).toHaveBeenCalledWith('sync_worktree_workspace', {
        worktreePath: MOCK_WORKTREE_1.worktreePath,
        baseBranch: 'main',
      })
    })

    it('throws on sync failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Merge conflict'))

      await expect(
        useWorktreeStore.getState().syncWorktree(MOCK_WORKTREE_1.worktreePath)
      ).rejects.toThrow('Merge conflict')
    })
  })

  // ── commitWorktreeChanges ──────────────────────────────────────────────

  describe('commitWorktreeChanges', () => {
    it('commits changes and records in memory', async () => {
      mockInvoke.mockResolvedValueOnce('Committed abc123')
      mockInvoke.mockResolvedValueOnce([]) // listWorktrees refresh

      const result = await useWorktreeStore
        .getState()
        .commitWorktreeChanges(MOCK_WORKTREE_1.worktreePath, 'Fix auth bug')

      expect(result).toBe('Committed abc123')

      // Should have recorded a note in memory
      const { notes } = useMemoryStore.getState()
      expect(notes.length).toBe(1)
      expect(notes[0].content).toContain('Fix auth bug')
      expect(notes[0].tags).toContain('worktree')
      expect(notes[0].tags).toContain('commit')
    })

    it('throws on commit failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Nothing to commit'))

      await expect(
        useWorktreeStore
          .getState()
          .commitWorktreeChanges(MOCK_WORKTREE_1.worktreePath, '')
      ).rejects.toThrow('Nothing to commit')
    })
  })

  // ── pushWorktreeBranch ─────────────────────────────────────────────────

  describe('pushWorktreeBranch', () => {
    it('pushes branch and records in memory', async () => {
      mockInvoke.mockResolvedValueOnce('Pushed to origin/feature/user-auth')

      const result = await useWorktreeStore
        .getState()
        .pushWorktreeBranch(MOCK_WORKTREE_1.worktreePath)

      expect(result).toBe('Pushed to origin/feature/user-auth')
      expect(mockInvoke).toHaveBeenCalledWith('push_worktree_branch', {
        worktreePath: MOCK_WORKTREE_1.worktreePath,
      })

      const { notes } = useMemoryStore.getState()
      expect(notes.length).toBe(1)
      expect(notes[0].tags).toContain('worktree')
      expect(notes[0].tags).toContain('push')
    })

    it('throws on push failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('No remote configured'))

      await expect(
        useWorktreeStore.getState().pushWorktreeBranch(MOCK_WORKTREE_1.worktreePath)
      ).rejects.toThrow('No remote configured')
    })
  })

  // ── getWorktreeStatus ──────────────────────────────────────────────────

  describe('getWorktreeStatus', () => {
    it('fetches status and updates worktree in the list', async () => {
      useWorktreeStore.setState({ worktrees: [MOCK_WORKTREE_1] })
      const updatedWorktree = { ...MOCK_WORKTREE_1, status: 'dirty', hasUncommitted: true }
      mockInvoke.mockResolvedValueOnce(updatedWorktree)

      const result = await useWorktreeStore
        .getState()
        .getWorktreeStatus(MOCK_WORKTREE_1.worktreePath)

      expect(result).toEqual(updatedWorktree)
      expect(useWorktreeStore.getState().worktrees[0].status).toBe('dirty')
      expect(useWorktreeStore.getState().worktrees[0].hasUncommitted).toBe(true)
    })

    it('throws on failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Worktree not found'))

      await expect(
        useWorktreeStore.getState().getWorktreeStatus('/nonexistent')
      ).rejects.toThrow('Worktree not found')
    })
  })

  // ── getWorktreeDiff ────────────────────────────────────────────────────

  describe('getWorktreeDiff', () => {
    beforeEach(() => {
      useWorktreeStore.setState({
        worktrees: [MOCK_WORKTREE_1],
        worktreeDiffCache: new Map(),
      })
    })

    it('fetches diff and caches it', async () => {
      mockInvoke.mockResolvedValueOnce(MOCK_DIFF)

      const result = await useWorktreeStore
        .getState()
        .getWorktreeDiff(MOCK_WORKTREE_1.worktreePath)

      expect(result).toEqual(MOCK_DIFF)
      expect(mockInvoke).toHaveBeenCalledWith('get_worktree_diff', {
        worktreePath: MOCK_WORKTREE_1.worktreePath,
      })

      // Should be cached
      expect(
        useWorktreeStore.getState().worktreeDiffCache.get(MOCK_WORKTREE_1.worktreePath)
      ).toEqual(MOCK_DIFF)
    })

    it('returns cached diff without calling invoke', async () => {
      // Seed the cache
      useWorktreeStore.setState({
        worktreeDiffCache: new Map([[MOCK_WORKTREE_1.worktreePath, MOCK_DIFF]]),
      })

      const result = await useWorktreeStore
        .getState()
        .getWorktreeDiff(MOCK_WORKTREE_1.worktreePath)

      expect(result).toEqual(MOCK_DIFF)
      // invoke should NOT have been called
      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('force-refreshes diff when forceRefresh is true', async () => {
      // Seed the cache
      useWorktreeStore.setState({
        worktreeDiffCache: new Map([[MOCK_WORKTREE_1.worktreePath, MOCK_DIFF]]),
      })
      const staleDiff = { ...MOCK_DIFF, filesChanged: 99 }
      mockInvoke.mockResolvedValueOnce(staleDiff)

      const result = await useWorktreeStore
        .getState()
        .getWorktreeDiff(MOCK_WORKTREE_1.worktreePath, true)

      expect(result.filesChanged).toBe(99)
      // invoke should have been called despite cache existing
      expect(mockInvoke).toHaveBeenCalledTimes(1)
    })

    it('throws on diff fetch failure', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('No changes'))

      await expect(
        useWorktreeStore.getState().getWorktreeDiff(MOCK_WORKTREE_1.worktreePath)
      ).rejects.toThrow('No changes')
    })
  })

  // ── Selection & View Toggle ────────────────────────────────────────────

  describe('selection and view toggle', () => {
    it('sets active worktree', () => {
      useWorktreeStore.getState().setActiveWorktree('wt-1')
      expect(useWorktreeStore.getState().activeWorktreeId).toBe('wt-1')
    })

    it('clears active worktree', () => {
      useWorktreeStore.getState().setActiveWorktree('wt-1')
      useWorktreeStore.getState().setActiveWorktree(null)
      expect(useWorktreeStore.getState().activeWorktreeId).toBeNull()
    })

    it('toggles workspace view to worktrees', () => {
      useWorktreeStore.getState().setWorkspaceView('worktrees')
      expect(useWorktreeStore.getState().workspaceView).toBe('worktrees')
    })

    it('toggles workspace view to terminals', () => {
      useWorktreeStore.getState().setWorkspaceView('worktrees')
      useWorktreeStore.getState().setWorkspaceView('terminal')
      expect(useWorktreeStore.getState().workspaceView).toBe('terminal')
    })
  })

  // ── openWorktreeTerminal ──────────────────────────────────────────────

  describe('openWorktreeTerminal', () => {
    beforeEach(() => {
      // Ensure a clean workspace store before each test in this block
      useWorkspaceStore.setState({
        tabs: [],
        activeTabId: null,
      })
    })

    it('switches to terminal view and adds a tab with workingDir', async () => {
      await useWorktreeStore
        .getState()
        .openWorktreeTerminal(MOCK_WORKTREE_1)

      const state = useWorktreeStore.getState()
      expect(state.workspaceView).toBe('terminal')

      const { tabs } = useWorkspaceStore.getState()
      expect(tabs.length).toBe(1)
      expect(tabs[0].agentId).toBe('claude')
      expect(tabs[0].agentName).toBe('claude')
      expect(tabs[0].workingDir).toBe(MOCK_WORKTREE_1.worktreePath)
    })

    it('records the terminal open in shared memory', async () => {
      await useWorktreeStore
        .getState()
        .openWorktreeTerminal(MOCK_WORKTREE_1)

      const { contextHistory } = useMemoryStore.getState()
      expect(contextHistory.length).toBe(1)
      expect(contextHistory[0].content).toContain('Opened terminal')
      expect(contextHistory[0].content).toContain(MOCK_WORKTREE_1.branchName)
      expect(contextHistory[0].agentId).toBe('claude')
    })

    it('uses the worktree-assigned agentId', async () => {
      await useWorktreeStore
        .getState()
        .openWorktreeTerminal(MOCK_WORKTREE_2) // agentId is 'codex'

      const { tabs } = useWorkspaceStore.getState()
      expect(tabs.length).toBe(1)
      expect(tabs[0].agentId).toBe('codex')
      expect(tabs[0].agentName).toBe('codex')
      // Provider is hardcoded as 'claude' in the store's openWorktreeTerminal
      expect(tabs[0].provider).toBe('claude')
      expect(tabs[0].workingDir).toBe(MOCK_WORKTREE_2.worktreePath)
    })

    it('defaults to claude agentId when worktree has none', async () => {
      const wtNoAgent = { ...MOCK_WORKTREE_1, agentId: null }

      await useWorktreeStore.getState().openWorktreeTerminal(wtNoAgent)

      const { tabs } = useWorkspaceStore.getState()
      expect(tabs.length).toBe(1)
      expect(tabs[0].agentId).toBe('claude')
      expect(tabs[0].workingDir).toBe(wtNoAgent.worktreePath)
    })
  })

  // ── Memory Integration ─────────────────────────────────────────────────

  describe('memory integration', () => {
    describe('addWorktreeNote', () => {
      it('adds a note tagged with the worktree ID', () => {
        useWorktreeStore.setState({ worktrees: [MOCK_WORKTREE_1] })

        useWorktreeStore
          .getState()
          .addWorktreeNote('wt-1', 'Need to review the auth flow')

        const { notes } = useMemoryStore.getState()
        expect(notes.length).toBe(1)
        expect(notes[0].content).toBe('[feature/user-auth] Need to review the auth flow')
        expect(notes[0].tags).toContain('worktree')
        expect(notes[0].tags).toContain('wt-wt-1')
        expect(notes[0].agentId).toBe('claude')
      })

      it('uses worktree agentId for the note', () => {
        useWorktreeStore.setState({ worktrees: [MOCK_WORKTREE_2] })

        useWorktreeStore
          .getState()
          .addWorktreeNote('wt-2', 'Check the login handler')

        const { notes } = useMemoryStore.getState()
        expect(notes[0].agentId).toBe('codex')
      })

      it('handles unknown worktreeId gracefully', () => {
        useWorktreeStore.setState({ worktrees: [] })

        useWorktreeStore
          .getState()
          .addWorktreeNote('wt-unknown', 'Orphaned note')

        const { notes } = useMemoryStore.getState()
        expect(notes[0].content).toBe('[wt-unknown] Orphaned note')
        expect(notes[0].agentId).toBeUndefined()
      })
    })

    describe('getWorktreeNotes', () => {
      it('returns notes filtered by worktree tag', () => {
        // Seed memory store with notes for different worktrees
        useMemoryStore.setState({
          notes: [
            {
              id: 'note-1',
              content: '[feature/user-auth] Need to review',
              agentId: 'claude',
              entryType: 'note',
              tags: ['worktree', 'wt-wt-1'],
              filesReferenced: [],
              createdAt: '2026-06-21T12:00:00Z',
              updatedAt: '2026-06-21T12:00:00Z',
            },
            {
              id: 'note-2',
              content: '[fix/login-bug] Fixed the token',
              agentId: 'codex',
              entryType: 'note',
              tags: ['worktree', 'wt-wt-2'],
              filesReferenced: [],
              createdAt: '2026-06-21T12:30:00Z',
              updatedAt: '2026-06-21T12:30:00Z',
            },
            {
              id: 'note-3',
              content: 'General note without worktree',
              agentId: 'claude',
              entryType: 'note',
              tags: ['general'],
              filesReferenced: [],
              createdAt: '2026-06-21T13:00:00Z',
              updatedAt: '2026-06-21T13:00:00Z',
            },
          ],
        })

        const wt1Notes = useWorktreeStore.getState().getWorktreeNotes('wt-1')
        expect(wt1Notes.length).toBe(1)
        expect(wt1Notes[0].content).toBe('[feature/user-auth] Need to review')

        const wt2Notes = useWorktreeStore.getState().getWorktreeNotes('wt-2')
        expect(wt2Notes.length).toBe(1)
        expect(wt2Notes[0].content).toBe('[fix/login-bug] Fixed the token')
      })

      it('returns empty array for worktree with no notes', () => {
        useMemoryStore.setState({ notes: [] })

        const notes = useWorktreeStore.getState().getWorktreeNotes('wt-nonexistent')
        expect(notes).toEqual([])
      })

      it('returns up to 50 notes', () => {
        const manyNotes = Array.from({ length: 60 }, (_, i) => ({
          id: `note-${i}`,
          content: `Note ${i}`,
          agentId: 'claude',
          entryType: 'note' as const,
          tags: ['worktree', 'wt-wt-1'],
          filesReferenced: [] as string[],
          createdAt: `2026-06-21T${String(i).padStart(2, '0')}:00:00Z`,
          updatedAt: `2026-06-21T${String(i).padStart(2, '0')}:00:00Z`,
        }))
        useMemoryStore.setState({ notes: manyNotes })

        const notes = useWorktreeStore.getState().getWorktreeNotes('wt-1')
        expect(notes.length).toBe(50) // Sliced to 50
      })
    })

    describe('create + memory integration', () => {
      it('creates both a note and a context entry on workspace creation', async () => {
        mockInvoke.mockResolvedValueOnce(MOCK_CREATE_RESULT)

        await useWorktreeStore
          .getState()
          .createWorktree('/tmp/test-repo', 'Add user auth', 'main', 'claude')

        const state = useMemoryStore.getState()
        expect(state.notes.length).toBe(1)
        expect(state.contextHistory.length).toBe(1)
      })
    })

    describe('commit + memory integration', () => {
      it('records a commit note tagged with worktree and commit', async () => {
        mockInvoke.mockResolvedValueOnce('Committed abc123')
        mockInvoke.mockResolvedValueOnce([])

        await useWorktreeStore
          .getState()
          .commitWorktreeChanges(MOCK_WORKTREE_1.worktreePath, 'Refactor auth')

        const { notes } = useMemoryStore.getState()
        expect(notes.length).toBe(1)
        expect(notes[0].tags).toEqual(['worktree', 'commit'])
      })
    })
  })

  // ── Helper: getWorktreeForPath ─────────────────────────────────────────

  describe('getWorktreeForPath (helper)', () => {
    it('finds worktree by path', () => {
      useWorktreeStore.setState({ worktrees: [MOCK_WORKTREE_1, MOCK_WORKTREE_2] })

      const found = getWorktreeForPath(MOCK_WORKTREE_2.worktreePath)
      expect(found).toEqual(MOCK_WORKTREE_2)
    })

    it('returns undefined for unknown path', () => {
      useWorktreeStore.setState({ worktrees: [MOCK_WORKTREE_1] })

      const found = getWorktreeForPath('/unknown/path')
      expect(found).toBeUndefined()
    })

    it('returns undefined when worktrees list is empty', () => {
      useWorktreeStore.setState({ worktrees: [] })

      const found = getWorktreeForPath(MOCK_WORKTREE_1.worktreePath)
      expect(found).toBeUndefined()
    })
  })
})
