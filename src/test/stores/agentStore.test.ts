import { describe, it, expect, beforeEach } from 'vitest'
import { useAgentStore, type Agent } from '../../stores/agentStore'

describe('agentStore', () => {
  beforeEach(() => {
    // Reset store state
    useAgentStore.setState({
      agents: useAgentStore.getState().agents,
      activeAgentId: null,
      recentAgentIds: [],
    })
  })

  it('has default agents', () => {
    const { agents } = useAgentStore.getState()
    expect(agents.length).toBeGreaterThanOrEqual(5)
    expect(agents[0]).toHaveProperty('id')
    expect(agents[0]).toHaveProperty('name')
    expect(agents[0]).toHaveProperty('provider')
    expect(agents[0]).toHaveProperty('status')
  })

  it('sets active agent', () => {
    const { agents } = useAgentStore.getState()
    useAgentStore.getState().setActiveAgent(agents[0].id)
    expect(useAgentStore.getState().activeAgentId).toBe(agents[0].id)
  })

  it('registers new agent', () => {
    const newAgent: Agent = {
      id: 'test-agent',
      name: 'Test Agent',
      provider: 'claude',
      status: 'idle',
      description: 'Test',
      category: 'coding',
    }
    useAgentStore.getState().registerAgent(newAgent)
    const { agents } = useAgentStore.getState()
    expect(agents.find((a) => a.id === 'test-agent')).toBeDefined()
  })

  it('updates agent status', () => {
    const { agents } = useAgentStore.getState()
    useAgentStore.getState().updateAgentStatus(agents[0].id, 'running')
    const updated = useAgentStore.getState().agents.find((a) => a.id === agents[0].id)
    expect(updated?.status).toBe('running')
  })

  it('removes agent', () => {
    const { agents } = useAgentStore.getState()
    const initialCount = agents.length
    useAgentStore.getState().removeAgent(agents[0].id)
    expect(useAgentStore.getState().agents.length).toBe(initialCount - 1)
  })

  it('records recent agents', () => {
    const { agents } = useAgentStore.getState()
    useAgentStore.getState().recordRecentAgent(agents[0].id)
    useAgentStore.getState().recordRecentAgent(agents[1].id)
    const { recentAgentIds } = useAgentStore.getState()
    expect(recentAgentIds).toContain(agents[0].id)
    expect(recentAgentIds).toContain(agents[1].id)
  })
})
