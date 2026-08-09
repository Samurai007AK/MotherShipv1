import { describe, it, expect, beforeEach, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { useLoopStore, type LoopConfig } from '../../stores/loopStore'

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

const mockInvoke = vi.mocked(invoke)

// ── Fixtures ──────────────────────────────────────────────────────────────

const defaultConfig: LoopConfig = {
  agentId: 'claude',
  projectPath: '/project',
  maxIterations: 20,
  timeoutMs: 600000,
  qualityGateCommands: { typecheck: 'tsc --noEmit', test: 'npm test' },
  autoCommit: true,
  syncToAgentsMd: true,
  autoArchive: true,
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('loopStore', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    useLoopStore.setState({
      status: 'idle',
      loopId: null,
      tasks: [],
      currentTask: null,
      currentAction: '',
      currentIteration: 0,
      maxIterations: 20,
      iterations: [],
      progress: 0,
      startTime: null,
      errorsEncountered: 0,
      consecutiveErrors: 0,
    })
  })

  // ── Initial state ───────────────────────────────────────────────────────

  describe('initial state', () => {
    it('has correct defaults', () => {
      const state = useLoopStore.getState()
      expect(state.status).toBe('idle')
      expect(state.loopId).toBeNull()
      expect(state.tasks).toEqual([])
      expect(state.currentTask).toBeNull()
      expect(state.currentAction).toBe('')
      expect(state.currentIteration).toBe(0)
      expect(state.maxIterations).toBe(20)
      expect(state.iterations).toEqual([])
      expect(state.progress).toBe(0)
      expect(state.startTime).toBeNull()
      expect(state.errorsEncountered).toBe(0)
      expect(state.consecutiveErrors).toBe(0)
    })
  })

  // ── startLoop ───────────────────────────────────────────────────────────

  describe('startLoop', () => {
    it('sets status to running and resets iteration state', async () => {
      mockInvoke.mockResolvedValue(undefined)

      await useLoopStore.getState().startLoop(defaultConfig)

      const state = useLoopStore.getState()
      expect(state.status).toBe('running')
      expect(state.currentIteration).toBe(0)
      expect(state.iterations).toEqual([])
      expect(state.progress).toBe(0)
      expect(state.errorsEncountered).toBe(0)
      expect(state.consecutiveErrors).toBe(0)
      expect(state.maxIterations).toBe(20)
    })

    it('sets startTime on first loop start', async () => {
      mockInvoke.mockResolvedValue(undefined)

      await useLoopStore.getState().startLoop(defaultConfig)

      expect(useLoopStore.getState().startTime).toBeInstanceOf(Date)
    })

    it('calls start_loop IPC with loopId and config', async () => {
      mockInvoke.mockResolvedValue(undefined)

      // Use fake timers so Date.now() is deterministic
      vi.useFakeTimers()
      const now = Date.now()
      vi.setSystemTime(now)

      await useLoopStore.getState().startLoop(defaultConfig)

      expect(mockInvoke).toHaveBeenCalledWith('start_loop', {
        loopId: `loop-${now}`,
        config: defaultConfig,
      })

      vi.useRealTimers()
    })

    it('uses maxIterations from config', async () => {
      mockInvoke.mockResolvedValue(undefined)
      const customConfig = { ...defaultConfig, maxIterations: 5 }

      await useLoopStore.getState().startLoop(customConfig)

      expect(useLoopStore.getState().maxIterations).toBe(5)
    })

    it('sets status to failed on IPC error', async () => {
      mockInvoke.mockRejectedValue(new Error('IPC error'))

      await useLoopStore.getState().startLoop(defaultConfig)

      expect(useLoopStore.getState().status).toBe('failed')
    })
  })

  // ── pauseLoop ───────────────────────────────────────────────────────────

  describe('pauseLoop', () => {
    it('sets status to paused', async () => {
      useLoopStore.setState({ loopId: 'loop-1', status: 'running' })
      mockInvoke.mockResolvedValue(undefined)

      await useLoopStore.getState().pauseLoop()

      expect(useLoopStore.getState().status).toBe('paused')
    })

    it('calls pause_loop IPC with loopId', async () => {
      useLoopStore.setState({ loopId: 'loop-1', status: 'running' })
      mockInvoke.mockResolvedValue(undefined)

      await useLoopStore.getState().pauseLoop()

      expect(mockInvoke).toHaveBeenCalledWith('pause_loop', { loopId: 'loop-1' })
    })

    it('is a no-op when loopId is null', async () => {
      useLoopStore.setState({ loopId: null, status: 'idle' })

      await useLoopStore.getState().pauseLoop()

      expect(mockInvoke).not.toHaveBeenCalled()
      expect(useLoopStore.getState().status).toBe('idle')
    })

    it('keeps status as paused even when IPC fails', async () => {
      useLoopStore.setState({ loopId: 'loop-1', status: 'running' })
      mockInvoke.mockRejectedValue(new Error('IPC error'))

      await useLoopStore.getState().pauseLoop()

      expect(useLoopStore.getState().status).toBe('paused')
    })
  })

  // ── resumeLoop ──────────────────────────────────────────────────────────

  describe('resumeLoop', () => {
    it('sets status to running', async () => {
      useLoopStore.setState({ loopId: 'loop-1', status: 'paused' })
      mockInvoke.mockResolvedValue(undefined)

      await useLoopStore.getState().resumeLoop()

      expect(useLoopStore.getState().status).toBe('running')
    })

    it('calls resume_loop IPC with loopId', async () => {
      useLoopStore.setState({ loopId: 'loop-1', status: 'paused' })
      mockInvoke.mockResolvedValue(undefined)

      await useLoopStore.getState().resumeLoop()

      expect(mockInvoke).toHaveBeenCalledWith('resume_loop', { loopId: 'loop-1' })
    })

    it('is a no-op when loopId is null', async () => {
      useLoopStore.setState({ loopId: null, status: 'idle' })

      await useLoopStore.getState().resumeLoop()

      expect(mockInvoke).not.toHaveBeenCalled()
    })
  })

  // ── cancelLoop ──────────────────────────────────────────────────────────

  describe('cancelLoop', () => {
    it('sets status to cancelled', async () => {
      useLoopStore.setState({ loopId: 'loop-1', status: 'running' })
      mockInvoke.mockResolvedValue(undefined)

      await useLoopStore.getState().cancelLoop()

      expect(useLoopStore.getState().status).toBe('cancelled')
    })

    it('calls cancel_loop IPC with loopId', async () => {
      useLoopStore.setState({ loopId: 'loop-1', status: 'running' })
      mockInvoke.mockResolvedValue(undefined)

      await useLoopStore.getState().cancelLoop()

      expect(mockInvoke).toHaveBeenCalledWith('cancel_loop', { loopId: 'loop-1' })
    })

    it('is a no-op when loopId is null', async () => {
      useLoopStore.setState({ loopId: null })

      await useLoopStore.getState().cancelLoop()

      expect(mockInvoke).not.toHaveBeenCalled()
    })
  })

  // ── retryFromIteration ──────────────────────────────────────────────────

  describe('retryFromIteration', () => {
    it('sets status to running and updates currentIteration', async () => {
      useLoopStore.setState({ loopId: 'loop-1', status: 'paused' })
      mockInvoke.mockResolvedValue(undefined)

      await useLoopStore.getState().retryFromIteration(3)

      const state = useLoopStore.getState()
      expect(state.status).toBe('running')
      expect(state.currentIteration).toBe(3)
    })

    it('calls retry_loop IPC with loopId and fromIteration', async () => {
      useLoopStore.setState({ loopId: 'loop-1', status: 'paused' })
      mockInvoke.mockResolvedValue(undefined)

      await useLoopStore.getState().retryFromIteration(5)

      expect(mockInvoke).toHaveBeenCalledWith('retry_loop', {
        loopId: 'loop-1',
        fromIteration: 5,
      })
    })
  })

  // ── loadPrdJson ─────────────────────────────────────────────────────────

  describe('loadPrdJson', () => {
    it('reads prd.json via IPC and parses user stories into tasks', async () => {
      mockInvoke.mockResolvedValue(JSON.stringify({
        userStories: [
          { id: 'US-1', title: 'Login', description: 'User login', acceptanceCriteria: ['Works'], priority: 1, passes: false, notes: '' },
          { id: 'US-2', title: 'Logout', description: 'User logout', acceptanceCriteria: ['Works'], priority: 2, passes: false, notes: '' },
        ],
      }))

      await useLoopStore.getState().loadPrdJson('/project')

      expect(mockInvoke).toHaveBeenCalledWith('read_file', { path: '/project/prd.json' })
      const { tasks } = useLoopStore.getState()
      expect(tasks.length).toBe(2)
      expect(tasks[0].title).toBe('Login')
      expect(tasks[1].title).toBe('Logout')
    })

    it('handles missing acceptanceCriteria gracefully', async () => {
      mockInvoke.mockResolvedValue(JSON.stringify({
        userStories: [
          { id: 'US-1', title: 'Login', description: 'Desc', priority: 1, passes: false },
        ],
      }))

      await useLoopStore.getState().loadPrdJson('/project')

      const { tasks } = useLoopStore.getState()
      expect(tasks[0].acceptanceCriteria).toEqual([])
    })

    it('handles missing notes field gracefully', async () => {
      mockInvoke.mockResolvedValue(JSON.stringify({
        userStories: [
          { id: 'US-1', title: 'Login', description: 'Desc', acceptanceCriteria: [], priority: 1, passes: false },
        ],
      }))

      await useLoopStore.getState().loadPrdJson('/project')

      const { tasks } = useLoopStore.getState()
      expect(tasks[0].notes).toBe('')
    })

    it('handles IPC failure gracefully', async () => {
      mockInvoke.mockRejectedValue(new Error('File not found'))

      await expect(useLoopStore.getState().loadPrdJson('/project')).resolves.toBeUndefined()
      expect(useLoopStore.getState().tasks).toEqual([])
    })

    it('handles invalid JSON gracefully', async () => {
      mockInvoke.mockResolvedValue('invalid json')

      await expect(useLoopStore.getState().loadPrdJson('/project')).resolves.toBeUndefined()
      expect(useLoopStore.getState().tasks).toEqual([])
    })

    it('handles missing userStories field gracefully', async () => {
      mockInvoke.mockResolvedValue(JSON.stringify({}))

      await useLoopStore.getState().loadPrdJson('/project')

      expect(useLoopStore.getState().tasks).toEqual([])
    })
  })

  // ── updateTask ──────────────────────────────────────────────────────────

  describe('updateTask', () => {
    beforeEach(() => {
      useLoopStore.setState({
        tasks: [
          { id: 'task-1', title: 'Task 1', description: '', acceptanceCriteria: [], priority: 1, passes: false, notes: '' },
          { id: 'task-2', title: 'Task 2', description: '', acceptanceCriteria: [], priority: 2, passes: false, notes: '' },
        ],
      })
    })

    it('updates a task field by id', () => {
      useLoopStore.getState().updateTask('task-1', { passes: true })

      const task = useLoopStore.getState().tasks.find((t) => t.id === 'task-1')
      expect(task?.passes).toBe(true)
      expect(task?.title).toBe('Task 1') // unchanged
    })

    it('updates multiple fields at once', () => {
      useLoopStore.getState().updateTask('task-1', {
        title: 'Updated Title',
        passes: true,
        notes: 'Done',
      })

      const task = useLoopStore.getState().tasks.find((t) => t.id === 'task-1')
      expect(task?.title).toBe('Updated Title')
      expect(task?.passes).toBe(true)
      expect(task?.notes).toBe('Done')
    })

    it('does not modify other tasks', () => {
      useLoopStore.getState().updateTask('task-1', { passes: true })

      const task2 = useLoopStore.getState().tasks.find((t) => t.id === 'task-2')
      expect(task2?.passes).toBe(false)
    })

    it('silently ignores non-existent task ids', () => {
      useLoopStore.getState().updateTask('non-existent', { passes: true })
      const { tasks } = useLoopStore.getState()
      expect(tasks.length).toBe(2)
      expect(tasks.every((t) => t.passes === false)).toBe(true)
    })
  })

  // ── reset ───────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('resets all state to defaults', () => {
      // Set up non-default state
      useLoopStore.setState({
        status: 'completed',
        loopId: 'loop-123',
        tasks: [{ id: 't1', title: 'T', description: '', acceptanceCriteria: [], priority: 1, passes: true, notes: '' }],
        currentTask: { id: 't1', title: 'T', description: '', acceptanceCriteria: [], priority: 1, passes: true, notes: '' },
        currentAction: 'executing',
        currentIteration: 5,
        maxIterations: 10,
        iterations: [{ iteration: 1, taskId: 't1', action: 'ran', result: 'ok', durationMs: 100, timestamp: new Date(), success: true, filesModified: [], toolsUsed: [], learnings: [] }],
        progress: 50,
        startTime: new Date(),
        errorsEncountered: 2,
        consecutiveErrors: 1,
      })

      useLoopStore.getState().reset()

      const state = useLoopStore.getState()
      expect(state.status).toBe('idle')
      expect(state.loopId).toBeNull()
      expect(state.tasks).toEqual([])
      expect(state.currentTask).toBeNull()
      expect(state.currentAction).toBe('')
      expect(state.currentIteration).toBe(0)
      expect(state.iterations).toEqual([])
      expect(state.progress).toBe(0)
      expect(state.startTime).toBeNull()
      expect(state.errorsEncountered).toBe(0)
      expect(state.consecutiveErrors).toBe(0)
    })
  })
})
