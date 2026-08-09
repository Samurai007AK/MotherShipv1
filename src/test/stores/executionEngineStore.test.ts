import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useExecutionEngineStore, type ExecutionGroupConfig } from '../../stores/executionEngineStore'

// ── Mock @tauri-apps/api/core invoke ────────────────────────────────────────

const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}))

// ── Helpers ─────────────────────────────────────────────────────────────────

function resetStore() {
  useExecutionEngineStore.setState({
    groups: [],
    activeGroupId: null,
    isPolling: false,
  })
  mockInvoke.mockReset()
}

function makeGroupConfig(overrides: Partial<ExecutionGroupConfig> = {}): ExecutionGroupConfig {
  return {
    name: 'Test Execution',
    agents: [
      { agent_id: 'claude', prompt: 'Analyze this code' },
      { agent_id: 'codex', prompt: 'Review the tests' },
    ],
    initial_context: 'We are working on project X',
    ...overrides,
  }
}

function createCompletedGroup(id: string) {
  return {
    id,
    name: 'Completed Group',
    status: 'completed' as const,
    agents: [
      { agent_id: 'claude', prompt: 'Test', status: 'completed' as const, output: 'Done!' },
      { agent_id: 'codex', prompt: 'Test', status: 'completed' as const, output: 'Reviewed' },
    ],
    shared_context: [],
    created_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('executionEngineStore', () => {
  beforeEach(() => {
    resetStore()
  })

  // ── Initial state ────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts with empty groups', () => {
      const state = useExecutionEngineStore.getState()
      expect(state.groups).toEqual([])
      expect(state.activeGroupId).toBeNull()
      expect(state.isPolling).toBe(false)
    })
  })

  // ── setActiveGroup ────────────────────────────────────────────────────

  describe('setActiveGroup', () => {
    it('sets the active group ID', () => {
      useExecutionEngineStore.getState().setActiveGroup('group-1')
      expect(useExecutionEngineStore.getState().activeGroupId).toBe('group-1')
    })

    it('clears active group ID when passed null', () => {
      useExecutionEngineStore.getState().setActiveGroup('group-1')
      useExecutionEngineStore.getState().setActiveGroup(null)
      expect(useExecutionEngineStore.getState().activeGroupId).toBeNull()
    })
  })

  // ── stopPolling ───────────────────────────────────────────────────────

  describe('stopPolling', () => {
    it('sets isPolling to false', () => {
      useExecutionEngineStore.setState({ isPolling: true })
      useExecutionEngineStore.getState().stopPolling()
      expect(useExecutionEngineStore.getState().isPolling).toBe(false)
    })
  })

  // ── clearCompleted ────────────────────────────────────────────────────

  describe('clearCompleted', () => {
    it('removes completed groups but keeps running ones', () => {
      const runningId = 'running-1'
      const completedId = 'completed-1'

      useExecutionEngineStore.setState({
        groups: [
          createCompletedGroup(completedId),
          {
            id: runningId,
            name: 'Running Group',
            status: 'running' as const,
            agents: [
              { agent_id: 'claude', prompt: 'Test', status: 'running' as const, output: '' },
            ],
            shared_context: [],
            created_at: new Date().toISOString(),
          },
          createCompletedGroup('completed-2'),
        ],
        activeGroupId: completedId,
      })

      useExecutionEngineStore.getState().clearCompleted()

      const { groups, activeGroupId } = useExecutionEngineStore.getState()
      expect(groups.length).toBe(1)
      expect(groups[0].id).toBe(runningId)
      // activeGroupId should be preserved even if the active group was cleared
      expect(activeGroupId).toBe(completedId)
    })

    it('does nothing when all groups are running', () => {
      useExecutionEngineStore.setState({
        groups: [{
          id: 'g1',
          name: 'Running',
          status: 'running' as const,
          agents: [{ agent_id: 'claude', prompt: 'Test', status: 'running' as const, output: '' }],
          shared_context: [],
          created_at: new Date().toISOString(),
        }],
      })

      useExecutionEngineStore.getState().clearCompleted()
      expect(useExecutionEngineStore.getState().groups.length).toBe(1)
    })

    it('clears all groups when all are completed', () => {
      useExecutionEngineStore.setState({
        groups: [createCompletedGroup('g1'), createCompletedGroup('g2')],
      })

      useExecutionEngineStore.getState().clearCompleted()
      expect(useExecutionEngineStore.getState().groups.length).toBe(0)
    })
  })

  // ── startGroup ────────────────────────────────────────────────────────

  describe('startGroup', () => {
    it('calls invoke with the correct config and adds local group', async () => {
      mockInvoke.mockResolvedValue('group-uuid-123')
      const config = makeGroupConfig()

      const groupId = await useExecutionEngineStore.getState().startGroup(config)

      expect(groupId).toBe('group-uuid-123')
      expect(mockInvoke).toHaveBeenCalledWith('start_execution_group', { config })

      const { groups, activeGroupId, isPolling } = useExecutionEngineStore.getState()
      expect(groups.length).toBe(1)
      expect(groups[0].id).toBe('group-uuid-123')
      expect(groups[0].name).toBe('Test Execution')
      expect(groups[0].status).toBe('spawning')
      expect(groups[0].agents.length).toBe(2)
      expect(groups[0].agents[0].agent_id).toBe('claude')
      expect(groups[0].agents[0].status).toBe('pending')
      expect(groups[0].shared_context.length).toBe(1)
      expect(groups[0].shared_context[0].source).toBe('system')
      expect(groups[0].shared_context[0].content).toBe('We are working on project X')
      expect(activeGroupId).toBe('group-uuid-123')
      expect(isPolling).toBe(true) // starts polling automatically
    })

    it('handles group without initial context', async () => {
      mockInvoke.mockResolvedValue('group-456')
      const config = makeGroupConfig({ initial_context: undefined })

      await useExecutionEngineStore.getState().startGroup(config)

      const group = useExecutionEngineStore.getState().groups[0]
      expect(group.shared_context).toEqual([])
    })

    it('handles single-agent groups', async () => {
      mockInvoke.mockResolvedValue('group-789')
      const config = makeGroupConfig({
        name: 'Single Agent',
        agents: [{ agent_id: 'claude', prompt: 'Do something' }],
      })

      await useExecutionEngineStore.getState().startGroup(config)

      const group = useExecutionEngineStore.getState().groups[0]
      expect(group.agents.length).toBe(1)
      expect(group.agents[0].agent_id).toBe('claude')
    })

    it('returns null and does not add group when invoke fails', async () => {
      mockInvoke.mockRejectedValue(new Error('Backend unavailable'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const config = makeGroupConfig()

      const groupId = await useExecutionEngineStore.getState().startGroup(config)

      expect(groupId).toBeNull()
      expect(useExecutionEngineStore.getState().groups.length).toBe(0)
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  // ── getGroup ──────────────────────────────────────────────────────────

  describe('getGroup', () => {
    it('calls invoke and updates the group in state', async () => {
      const updatedGroup = createCompletedGroup('g1')
      mockInvoke.mockResolvedValue(updatedGroup)

      // Pre-populate with a spawning group
      useExecutionEngineStore.setState({
        groups: [{
          id: 'g1',
          name: 'Old',
          status: 'spawning' as const,
          agents: [{ agent_id: 'claude', prompt: 'Test', status: 'pending' as const, output: '' }],
          shared_context: [],
          created_at: new Date().toISOString(),
        }],
      })

      await useExecutionEngineStore.getState().getGroup('g1')

      expect(mockInvoke).toHaveBeenCalledWith('get_execution_group', { groupId: 'g1' })
      const group = useExecutionEngineStore.getState().groups[0]
      expect(group.status).toBe('completed')
      expect(group.agents[0].output).toBe('Done!')
    })

    it('does nothing when invoke returns null', async () => {
      mockInvoke.mockResolvedValue(null)

      await useExecutionEngineStore.getState().getGroup('nonexistent')
      // No error should be thrown
    })

    it('handles invoke errors gracefully', async () => {
      mockInvoke.mockRejectedValue(new Error('Not found'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await useExecutionEngineStore.getState().getGroup('g1')
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  // ── listGroups ────────────────────────────────────────────────────────

  describe('listGroups', () => {
    it('calls invoke and replaces all groups in state', async () => {
      const remoteGroups = [createCompletedGroup('g1'), createCompletedGroup('g2')]
      mockInvoke.mockResolvedValue(remoteGroups)

      useExecutionEngineStore.setState({
        groups: [{ ...createCompletedGroup('old-g'), id: 'old-g' }],
      })

      await useExecutionEngineStore.getState().listGroups()

      expect(mockInvoke).toHaveBeenCalledWith('list_execution_groups')
      expect(useExecutionEngineStore.getState().groups.length).toBe(2)
    })

    it('handles invoke errors gracefully', async () => {
      mockInvoke.mockRejectedValue(new Error('Failed'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await useExecutionEngineStore.getState().listGroups()
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  // ── cancelGroup ───────────────────────────────────────────────────────

  describe('cancelGroup', () => {
    it('calls invoke with the correct group ID', async () => {
      mockInvoke.mockResolvedValue(undefined)

      await useExecutionEngineStore.getState().cancelGroup('group-1')

      expect(mockInvoke).toHaveBeenCalledWith('cancel_execution_group', { groupId: 'group-1' })
    })

    it('handles invoke errors gracefully', async () => {
      mockInvoke.mockRejectedValue(new Error('Group not found'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await useExecutionEngineStore.getState().cancelGroup('nonexistent')
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  // ── addContext ────────────────────────────────────────────────────────

  describe('addContext', () => {
    it('calls invoke with the correct parameters', async () => {
      mockInvoke.mockResolvedValue(undefined)

      await useExecutionEngineStore.getState().addContext('group-1', 'user', 'New context data')

      expect(mockInvoke).toHaveBeenCalledWith('add_execution_context', {
        groupId: 'group-1',
        source: 'user',
        content: 'New context data',
      })
    })

    it('handles invoke errors gracefully', async () => {
      mockInvoke.mockRejectedValue(new Error('Group not running'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await useExecutionEngineStore.getState().addContext('group-1', 'user', 'data')
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  // ── startPolling ──────────────────────────────────────────────────────

  describe('startPolling', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('sets isPolling to true', () => {
      useExecutionEngineStore.getState().startPolling()
      expect(useExecutionEngineStore.getState().isPolling).toBe(true)
    })

    it('does not start polling if already polling', () => {
      useExecutionEngineStore.setState({ isPolling: true })
      useExecutionEngineStore.getState().startPolling()
      // isPolling should still be true; no extra timers started
      expect(useExecutionEngineStore.getState().isPolling).toBe(true)
    })

    it('stops polling when no running groups remain', async () => {
      // Start with a completed group — polling should immediately stop
      useExecutionEngineStore.setState({
        groups: [createCompletedGroup('g1')],
      })

      useExecutionEngineStore.getState().startPolling()

      // Advance past the initial setTimeout(500)
      await vi.advanceTimersByTimeAsync(500)

      // Poll should have checked groups, found none running, and stopped
      expect(useExecutionEngineStore.getState().isPolling).toBe(false)
    })

    it('polls running groups and stops when they complete', async () => {
      const runningGroup = {
        id: 'g1',
        name: 'Running',
        status: 'running' as const,
        agents: [{ agent_id: 'claude', prompt: 'Test', status: 'running' as const, output: '' }],
        shared_context: [],
        created_at: new Date().toISOString(),
      }

      useExecutionEngineStore.setState({
        groups: [runningGroup],
      })

      // getGroup will first return the running group, then a completed group
      let callCount = 0
      mockInvoke.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve(runningGroup) // still running
        }
        return Promise.resolve(createCompletedGroup('g1')) // now completed
      })

      useExecutionEngineStore.getState().startPolling()
      expect(useExecutionEngineStore.getState().isPolling).toBe(true)

      // Advance past initial 500ms delay
      await vi.advanceTimersByTimeAsync(500)
      // After first poll, group is still running → sets timeout for 1000ms
      await vi.advanceTimersByTimeAsync(1000)
      // After second poll, group is completed → polling stops
      await vi.advanceTimersByTimeAsync(100)

      expect(useExecutionEngineStore.getState().isPolling).toBe(false)
      expect(callCount).toBeGreaterThanOrEqual(2)
    })
  })

  // ── Status transitions ────────────────────────────────────────────────

  describe('status transitions', () => {
    it('starts as spawning after startGroup', async () => {
      mockInvoke.mockResolvedValue('g1')
      const config = makeGroupConfig({ agents: [{ agent_id: 'claude', prompt: 'Test' }] })

      await useExecutionEngineStore.getState().startGroup(config)

      expect(useExecutionEngineStore.getState().groups[0].status).toBe('spawning')
      expect(useExecutionEngineStore.getState().groups[0].agents[0].status).toBe('pending')
    })

    it('transitions to running/error/completed via getGroup updates', async () => {
      mockInvoke.mockResolvedValue('g1')
      await useExecutionEngineStore.getState().startGroup(makeGroupConfig())

      // Simulate a running group coming back from backend
      const runningGroup = {
        ...useExecutionEngineStore.getState().groups[0],
        status: 'running' as const,
        agents: [{ ...useExecutionEngineStore.getState().groups[0].agents[0], status: 'running' as const }],
      }
      mockInvoke.mockResolvedValue(runningGroup)
      await useExecutionEngineStore.getState().getGroup('g1')
      expect(useExecutionEngineStore.getState().groups[0].status).toBe('running')

      // Simulate completion
      const completedGroup = {
        ...runningGroup,
        status: 'completed' as const,
        agents: [{ ...runningGroup.agents[0], status: 'completed' as const, output: 'Done!' }],
        completed_at: new Date().toISOString(),
      }
      mockInvoke.mockResolvedValue(completedGroup)
      await useExecutionEngineStore.getState().getGroup('g1')
      expect(useExecutionEngineStore.getState().groups[0].status).toBe('completed')
    })

    it('transitions to error via getGroup updates', async () => {
      mockInvoke.mockResolvedValue('g1')
      await useExecutionEngineStore.getState().startGroup(makeGroupConfig())

      const errorGroup = {
        ...useExecutionEngineStore.getState().groups[0],
        status: 'error' as const,
        agents: [{
          ...useExecutionEngineStore.getState().groups[0].agents[0],
          status: 'error' as const,
          error: 'Session crashed',
        }],
      }
      mockInvoke.mockResolvedValue(errorGroup)
      await useExecutionEngineStore.getState().getGroup('g1')
      expect(useExecutionEngineStore.getState().groups[0].status).toBe('error')
      expect(useExecutionEngineStore.getState().groups[0].agents[0].status).toBe('error')
      expect(useExecutionEngineStore.getState().groups[0].agents[0].error).toBe('Session crashed')
    })
  })

  // ── Multiple groups ───────────────────────────────────────────────────

  describe('multiple groups', () => {
    it('prepends new groups when starting multiple executions', async () => {
      mockInvoke
        .mockResolvedValueOnce('g1')
        .mockResolvedValueOnce('g2')

      const config = makeGroupConfig({ agents: [{ agent_id: 'claude', prompt: 'Task 1' }] })
      await useExecutionEngineStore.getState().startGroup({ ...config, name: 'First' })
      await useExecutionEngineStore.getState().startGroup({ ...config, name: 'Second' })

      const { groups } = useExecutionEngineStore.getState()
      expect(groups.length).toBe(2)
      expect(groups[0].name).toBe('Second') // most recent first
      expect(groups[1].name).toBe('First')
    })

    it('switches activeGroupId to the latest execution', async () => {
      mockInvoke
        .mockResolvedValueOnce('g1')
        .mockResolvedValueOnce('g2')

      const config = makeGroupConfig({ agents: [{ agent_id: 'claude', prompt: 'Test' }] })
      await useExecutionEngineStore.getState().startGroup(config)
      expect(useExecutionEngineStore.getState().activeGroupId).toBe('g1')

      await useExecutionEngineStore.getState().startGroup(config)
      expect(useExecutionEngineStore.getState().activeGroupId).toBe('g2')
    })
  })
})
