import { describe, it, expect, beforeEach } from 'vitest'
import { useWarRoomStore } from '../../stores/warRoomStore'

describe('warRoomStore', () => {
  beforeEach(() => {
    useWarRoomStore.setState({
      sessions: [],
      activeSessionId: null,
      view: 'broadcast',
      taskChains: [],
      activeChainId: null,
    })
  })

  it('creates a session', () => {
    const sessionId = useWarRoomStore.getState().createSession('Test Session')
    const { sessions, activeSessionId } = useWarRoomStore.getState()
    expect(sessions.length).toBe(1)
    expect(sessions[0].name).toBe('Test Session')
    expect(activeSessionId).toBe(sessionId)
  })

  it('deletes a session', () => {
    const sessionId = useWarRoomStore.getState().createSession()
    useWarRoomStore.getState().deleteSession(sessionId)
    expect(useWarRoomStore.getState().sessions.length).toBe(0)
  })

  it('sets active session', () => {
    const id1 = useWarRoomStore.getState().createSession('S1')
    useWarRoomStore.getState().createSession('S2')
    useWarRoomStore.getState().setActiveSession(id1)
    expect(useWarRoomStore.getState().activeSessionId).toBe(id1)
  })

  it('broadcasts to agents', () => {
    const sessionId = useWarRoomStore.getState().createSession()
    useWarRoomStore.getState().broadcastToAgents(
      'Test prompt',
      ['agent1', 'agent2'],
      { agent1: 'claude', agent2: 'codex' }
    )
    const session = useWarRoomStore.getState().sessions.find((s) => s.id === sessionId)
    expect(session?.broadcasts.length).toBe(1)
    expect(session?.responses.length).toBe(2)
  })

  it('sets view mode', () => {
    useWarRoomStore.getState().setView('side_by_side')
    expect(useWarRoomStore.getState().view).toBe('side_by_side')
  })

  it('creates task chain', () => {
    useWarRoomStore.getState().createTaskChain('Test Chain', [
      { agentId: 'claude', provider: 'claude', prompt: 'Step 1' },
      { agentId: 'codex', provider: 'codex', prompt: 'Step 2' },
    ])
    const { taskChains } = useWarRoomStore.getState()
    expect(taskChains.length).toBe(1)
    expect(taskChains[0].steps.length).toBe(2)
  })

  it('updates chain step', () => {
    const chainId = useWarRoomStore.getState().createTaskChain('Chain', [
      { agentId: 'claude', provider: 'claude', prompt: 'Do something' },
    ])
    const chain = useWarRoomStore.getState().taskChains[0]
    useWarRoomStore.getState().updateChainStep(chainId, chain.steps[0].id, {
      status: 'completed',
      output: 'Done!',
    })
    const updated = useWarRoomStore.getState().taskChains[0]
    expect(updated.steps[0].status).toBe('completed')
    expect(updated.steps[0].output).toBe('Done!')
  })
})
