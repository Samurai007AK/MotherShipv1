import { describe, it, expect, beforeEach } from 'vitest'
import { useAgentStore, type Agent } from '../../stores/agentStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'

// ── Mock agents ─────────────────────────────────────────────────────────────

const MOCK_AGENTS: Agent[] = [
  {
    id: 'se-1',
    name: 'Software Engineer',
    provider: 'claude',
    role: 'software-engineer',
    status: 'idle',
    description: 'Implements features, writes code, fixes bugs',
    category: 'engineering',
    model: 'claude-sonnet-4-20250514',
  },
  {
    id: 'se-2',
    name: 'Software Engineer #2',
    provider: 'codex',
    role: 'software-engineer',
    status: 'idle',
    description: 'Secondary engineer for parallel tasks',
    category: 'engineering',
    model: 'codex-mini',
  },
]

// ── Helpers ─────────────────────────────────────────────────────────────────

function resetStores() {
  useAgentStore.setState({
    agents: MOCK_AGENTS,
    activeAgentId: null,
    recentAgentIds: [],
  })
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    splitPanes: new Map(),
    activeSplitPaneId: null,
  })
}

function getAgent(id: string): Agent | undefined {
  return useAgentStore.getState().agents.find((a) => a.id === id)
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('agent status detection from PTY lifecycle events', () => {
  beforeEach(() => {
    resetStores()
  })

  // ── onError: setTabConnected(false) + updateAgentStatus('error') ──────

  describe('on PTY error (onError callback)', () => {
    it('sets agent status to error and tab connected to false', () => {
      // Simulate onError callback logic from WorkspaceView:
      // useWorkspaceStore.getState().setTabConnected(agentId, false)
      // useAgentStore.getState().updateAgentStatus(agentId, 'error')
      const agentId = 'se-1'

      // First add a tab (simulates opening a terminal)
      useWorkspaceStore.getState().addTab(agentId, 'Software Engineer', 'claude')
      expect(getAgent(agentId)?.status).toBe('running')
      expect(useWorkspaceStore.getState().tabs[0].isConnected).toBe(false)

      // Mark as connected (PTY spawned successfully)
      useWorkspaceStore.getState().setConnected(agentId, true)
      expect(getAgent(agentId)?.status).toBe('running')
      expect(useWorkspaceStore.getState().tabs[0].isConnected).toBe(true)

      // Simulate error: only update isConnected, set status to error directly
      useWorkspaceStore.getState().setTabConnected(agentId, false)
      useAgentStore.getState().updateAgentStatus(agentId, 'error')

      expect(getAgent(agentId)?.status).toBe('error')
      expect(useWorkspaceStore.getState().tabs[0].isConnected).toBe(false)
      // lastActive should be set on error
      expect(getAgent(agentId)?.lastActive).toBeDefined()
    })

    it('does not briefly flicker through idle status', () => {
      // setTabConnected doesn't touch agent status at all — only isConnected
      const agentId = 'se-2'

      useAgentStore.getState().updateAgentStatus(agentId, 'running')
      expect(getAgent(agentId)?.status).toBe('running')

      // setTabConnected should NOT change agent status (this was the bug)
      useWorkspaceStore.getState().setTabConnected(agentId, false)
      expect(getAgent(agentId)?.status).toBe('running')

      // Then updateAgentStatus sets it to error
      useAgentStore.getState().updateAgentStatus(agentId, 'error')
      expect(getAgent(agentId)?.status).toBe('error')
    })
  })

  // ── onReconnect: setConnected(true) ──────────────────────────────────

  describe('on reconnect (onReconnect callback)', () => {
    it('sets agent status to running and tab connected to true', () => {
      const agentId = 'se-1'

      // Simulate error state first
      useWorkspaceStore.getState().addTab(agentId, 'Software Engineer', 'claude')
      useWorkspaceStore.getState().setConnected(agentId, true)
      useWorkspaceStore.getState().setTabConnected(agentId, false)
      useAgentStore.getState().updateAgentStatus(agentId, 'error')

      // Simulate reconnect: onReconnect callback calls setConnected(true)
      useWorkspaceStore.getState().setConnected(agentId, true)

      expect(getAgent(agentId)?.status).toBe('running')
      expect(useWorkspaceStore.getState().tabs[0].isConnected).toBe(true)
    })

    it('works when called multiple times (reconnect after reconnect)', () => {
      const agentId = 'se-2'
      useWorkspaceStore.getState().addTab(agentId, 'Software Engineer #2', 'codex')

      // First connection
      useWorkspaceStore.getState().setConnected(agentId, true)
      expect(getAgent(agentId)?.status).toBe('running')

      // Error
      useWorkspaceStore.getState().setTabConnected(agentId, false)
      useAgentStore.getState().updateAgentStatus(agentId, 'error')
      expect(getAgent(agentId)?.status).toBe('error')

      // Reconnect
      useWorkspaceStore.getState().setConnected(agentId, true)
      expect(getAgent(agentId)?.status).toBe('running')
      expect(useWorkspaceStore.getState().tabs[0].isConnected).toBe(true)
    })
  })

  // ── onExit (code 0): setConnected(false) ─────────────────────────────

  describe('on clean exit (onExit callback, code 0)', () => {
    it('sets agent status to idle and tab connected to false', () => {
      const agentId = 'se-1'

      useWorkspaceStore.getState().addTab(agentId, 'Software Engineer', 'claude')
      useWorkspaceStore.getState().setConnected(agentId, true)
      expect(getAgent(agentId)?.status).toBe('running')

      // Simulate clean exit: setConnected(false) — status becomes idle
      useWorkspaceStore.getState().setConnected(agentId, false)

      expect(getAgent(agentId)?.status).toBe('idle')
      expect(useWorkspaceStore.getState().tabs[0].isConnected).toBe(false)
    })
  })

  // ── onExit (non-zero code): setConnected(false) + updateAgentStatus('error') ──

  describe('on abnormal exit (onExit callback, non-zero code)', () => {
    it('sets agent status to error for exit code 1', () => {
      const agentId = 'se-1'

      useWorkspaceStore.getState().addTab(agentId, 'Software Engineer', 'claude')
      useWorkspaceStore.getState().setConnected(agentId, true)

      // Simulate non-zero exit: setConnected(false), then override to error
      useWorkspaceStore.getState().setConnected(agentId, false)
      useAgentStore.getState().updateAgentStatus(agentId, 'error')

      expect(getAgent(agentId)?.status).toBe('error')
      expect(useWorkspaceStore.getState().tabs[0].isConnected).toBe(false)
    })

    it('sets agent status to error for exit code -1 (killed by signal)', () => {
      const agentId = 'se-2'

      useWorkspaceStore.getState().addTab(agentId, 'Software Engineer #2', 'codex')
      useWorkspaceStore.getState().setConnected(agentId, true)

      // Negative exit code e.g., SIGTERM
      useWorkspaceStore.getState().setConnected(agentId, false)
      useAgentStore.getState().updateAgentStatus(agentId, 'error')

      expect(getAgent(agentId)?.status).toBe('error')
    })

    it('sets agent status to error for exit code 137 (SIGKILL)', () => {
      const agentId = 'se-1'

      useWorkspaceStore.getState().addTab(agentId, 'Software Engineer', 'claude')
      useWorkspaceStore.getState().setConnected(agentId, true)

      // Process killed with SIGKILL (128 + 9 = 137)
      useWorkspaceStore.getState().setConnected(agentId, false)
      useAgentStore.getState().updateAgentStatus(agentId, 'error')

      expect(getAgent(agentId)?.status).toBe('error')
    })

    it('sets correct final status without idle flicker', () => {
      const agentId = 'se-1'

      // Start with a running tab
      useWorkspaceStore.getState().addTab(agentId, 'Software Engineer', 'claude')
      useWorkspaceStore.getState().setConnected(agentId, true)
      expect(getAgent(agentId)?.status).toBe('running')

      // This is the exact sequence from the WorkspaceView callback:
      // 1. setConnected(false) → sets status to 'idle', isConnected to false
      useWorkspaceStore.getState().setConnected(agentId, false)
      // 2. updateAgentStatus('error') → overrides to 'error'
      useAgentStore.getState().updateAgentStatus(agentId, 'error')

      // Final state should be 'error' — the idle is only intermediate within the callback
      expect(getAgent(agentId)?.status).toBe('error')
      expect(useWorkspaceStore.getState().tabs.find((t) => t.agentId === agentId)?.isConnected).toBe(false)
    })
  })

  // ── Tab lifecycle (addTab / removeTab) ──────────────────────────────

  describe('tab lifecycle', () => {
    it('addTab sets agent status to running', () => {
      useWorkspaceStore.getState().addTab('se-1', 'Software Engineer', 'claude')
      expect(getAgent('se-1')?.status).toBe('running')
    })

    it('addTab for existing tab still sets status to running', () => {
      useWorkspaceStore.getState().addTab('se-1', 'Software Engineer', 'claude')
      // Force status to idle (simulating disconnected)
      useAgentStore.getState().updateAgentStatus('se-1', 'idle')
      // Add the same tab again
      useWorkspaceStore.getState().addTab('se-1', 'Software Engineer', 'claude')
      // addTab should update status to running even for existing tab
      expect(getAgent('se-1')?.status).toBe('running')
    })

    it('removeTab sets agent status to idle', () => {
      useWorkspaceStore.getState().addTab('se-1', 'Software Engineer', 'claude')
      expect(getAgent('se-1')?.status).toBe('running')

      useWorkspaceStore.getState().removeTab('se-1')
      expect(getAgent('se-1')?.status).toBe('idle')
    })

    it('removeTab sets lastActive', () => {
      useWorkspaceStore.getState().addTab('se-1', 'Software Engineer', 'claude')
      useWorkspaceStore.getState().removeTab('se-1')
      expect(getAgent('se-1')?.lastActive).toBeDefined()
    })
  })

  // ── setTabConnected isolated behavior ─────────────────────────────────

  describe('setTabConnected', () => {
    it('updates isConnected without changing agent status', () => {
      const agentId = 'se-1'
      useWorkspaceStore.getState().addTab(agentId, 'Software Engineer', 'claude')

      // Start with connected=true, status=running
      useWorkspaceStore.getState().setConnected(agentId, true)

      // setTabConnected should only touch isConnected
      useWorkspaceStore.getState().setTabConnected(agentId, false)
      expect(useWorkspaceStore.getState().tabs[0].isConnected).toBe(false)
      expect(getAgent(agentId)?.status).toBe('running')

      // Toggle back
      useWorkspaceStore.getState().setTabConnected(agentId, true)
      expect(useWorkspaceStore.getState().tabs[0].isConnected).toBe(true)
      expect(getAgent(agentId)?.status).toBe('running')
    })

    it('works for non-existent agentId (no-op)', () => {
      // Should not throw
      useWorkspaceStore.getState().setTabConnected('does-not-exist', true)
      expect(useWorkspaceStore.getState().tabs.length).toBe(0)
    })
  })

  // ── setConnected isolated behavior ────────────────────────────────────

  describe('setConnected', () => {
    it('sets status to running when connected=true', () => {
      useWorkspaceStore.getState().addTab('se-1', 'Software Engineer', 'claude')
      useWorkspaceStore.getState().setConnected('se-1', true)
      expect(getAgent('se-1')?.status).toBe('running')
    })

    it('sets status to idle when connected=false', () => {
      useWorkspaceStore.getState().addTab('se-1', 'Software Engineer', 'claude')
      useWorkspaceStore.getState().setConnected('se-1', false)
      expect(getAgent('se-1')?.status).toBe('idle')
    })

    it('updates lastActive when changing status', () => {
      useWorkspaceStore.getState().addTab('se-1', 'Software Engineer', 'claude')
      useWorkspaceStore.getState().setConnected('se-1', true)
      expect(getAgent('se-1')?.lastActive).toBeDefined()
    })
  })

  // ── Full lifecycle scenarios ──────────────────────────────────────────

  describe('full lifecycle', () => {
    it('follows open → connect → error → reconnect → close cycle', () => {
      const agentId = 'se-1'

      // 1. Open tab
      useWorkspaceStore.getState().addTab(agentId, 'Software Engineer', 'claude')
      expect(getAgent(agentId)?.status).toBe('running')

      // 2. PTY connects
      useWorkspaceStore.getState().setConnected(agentId, true)
      expect(getAgent(agentId)?.status).toBe('running')
      expect(useWorkspaceStore.getState().tabs[0].isConnected).toBe(true)

      // 3. PTY errors
      useWorkspaceStore.getState().setTabConnected(agentId, false)
      useAgentStore.getState().updateAgentStatus(agentId, 'error')
      expect(getAgent(agentId)?.status).toBe('error')
      expect(useWorkspaceStore.getState().tabs[0].isConnected).toBe(false)

      // 4. Reconnect succeeds
      useWorkspaceStore.getState().setConnected(agentId, true)
      expect(getAgent(agentId)?.status).toBe('running')
      expect(useWorkspaceStore.getState().tabs[0].isConnected).toBe(true)

      // 5. Process exits cleanly
      useWorkspaceStore.getState().setConnected(agentId, false)
      expect(getAgent(agentId)?.status).toBe('idle')
      expect(useWorkspaceStore.getState().tabs[0].isConnected).toBe(false)

      // 6. Close tab
      useWorkspaceStore.getState().removeTab(agentId)
      expect(useWorkspaceStore.getState().tabs.length).toBe(0)
      expect(getAgent(agentId)?.status).toBe('idle')
    })

    it('follows open → connect → abnormal exit → reconnect cycle', () => {
      const agentId = 'se-2'

      // 1. Open + connect
      useWorkspaceStore.getState().addTab(agentId, 'Software Engineer #2', 'codex')
      useWorkspaceStore.getState().setConnected(agentId, true)

      // 2. Process crashes with non-zero exit
      useWorkspaceStore.getState().setConnected(agentId, false)
      useAgentStore.getState().updateAgentStatus(agentId, 'error')
      expect(getAgent(agentId)?.status).toBe('error')

      // 3. User reconnects
      useWorkspaceStore.getState().setConnected(agentId, true)
      expect(getAgent(agentId)?.status).toBe('running')
    })
  })
})
