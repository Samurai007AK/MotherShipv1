import { describe, it, expect, beforeEach } from 'vitest'
import { useTaskGraphStore } from '../../stores/taskGraphStore'

describe('taskGraphStore', () => {
  beforeEach(() => {
    useTaskGraphStore.setState({
      graphs: [],
      activeGraphId: null,
      layout: 'dagre',
      selectedNodeId: null,
    })
  })

  it('creates a graph', () => {
    const graphId = useTaskGraphStore.getState().createGraph('Test Graph')
    const { graphs, activeGraphId } = useTaskGraphStore.getState()
    expect(graphs.length).toBe(1)
    expect(graphs[0].name).toBe('Test Graph')
    expect(activeGraphId).toBe(graphId)
  })

  it('adds a node', () => {
    const graphId = useTaskGraphStore.getState().createGraph('G')
    useTaskGraphStore.getState().addNode(graphId, {
      label: 'Task 1',
      status: 'pending',
    })
    const graph = useTaskGraphStore.getState().graphs.find((g) => g.id === graphId)
    expect(graph?.nodes.length).toBe(1)
    expect(graph?.nodes[0].label).toBe('Task 1')
  })

  it('updates a node', () => {
    const graphId = useTaskGraphStore.getState().createGraph('G')
    const nodeId = useTaskGraphStore.getState().addNode(graphId, {
      label: 'Original',
      status: 'pending',
    })
    useTaskGraphStore.getState().updateNode(graphId, nodeId, { status: 'running' })
    const graph = useTaskGraphStore.getState().graphs.find((g) => g.id === graphId)
    expect(graph?.nodes[0].status).toBe('running')
  })

  it('adds an edge', () => {
    const graphId = useTaskGraphStore.getState().createGraph('G')
    const n1 = useTaskGraphStore.getState().addNode(graphId, { label: 'A', status: 'pending' })
    const n2 = useTaskGraphStore.getState().addNode(graphId, { label: 'B', status: 'pending' })
    useTaskGraphStore.getState().addEdge(graphId, { source: n1, target: n2 })
    const graph = useTaskGraphStore.getState().graphs.find((g) => g.id === graphId)
    expect(graph?.edges.length).toBe(1)
    expect(graph?.edges[0].source).toBe(n1)
    expect(graph?.edges[0].target).toBe(n2)
  })

  it('gets successors', () => {
    const graphId = useTaskGraphStore.getState().createGraph('G')
    const n1 = useTaskGraphStore.getState().addNode(graphId, { label: 'A', status: 'pending' })
    const n2 = useTaskGraphStore.getState().addNode(graphId, { label: 'B', status: 'pending' })
    useTaskGraphStore.getState().addEdge(graphId, { source: n1, target: n2 })
    const successors = useTaskGraphStore.getState().getSuccessors(graphId, n1)
    expect(successors.length).toBe(1)
    expect(successors[0].id).toBe(n2)
  })

  it('selects a node', () => {
    useTaskGraphStore.getState().selectNode('node-1')
    expect(useTaskGraphStore.getState().selectedNodeId).toBe('node-1')
  })

  it('removes a node and its edges', () => {
    const graphId = useTaskGraphStore.getState().createGraph('G')
    const n1 = useTaskGraphStore.getState().addNode(graphId, { label: 'A', status: 'pending' })
    const n2 = useTaskGraphStore.getState().addNode(graphId, { label: 'B', status: 'pending' })
    useTaskGraphStore.getState().addEdge(graphId, { source: n1, target: n2 })
    useTaskGraphStore.getState().removeNode(graphId, n1)
    const graph = useTaskGraphStore.getState().graphs.find((g) => g.id === graphId)
    expect(graph?.nodes.length).toBe(1)
    expect(graph?.edges.length).toBe(0)
  })
})
