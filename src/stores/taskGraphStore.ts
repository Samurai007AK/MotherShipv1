import { create } from 'zustand'
import type { TaskGraph, TaskNode, TaskEdge, GraphLayout } from '../types/taskGraph'

interface TaskGraphState {
  graphs: TaskGraph[]
  activeGraphId: string | null
  layout: GraphLayout
  selectedNodeId: string | null

  // Graph actions
  createGraph: (name: string) => string
  deleteGraph: (id: string) => void
  setActiveGraph: (id: string) => void

  // Node actions
  addNode: (graphId: string, node: Omit<TaskNode, 'id'>) => string
  updateNode: (graphId: string, nodeId: string, updates: Partial<TaskNode>) => void
  removeNode: (graphId: string, nodeId: string) => void

  // Edge actions
  addEdge: (graphId: string, edge: Omit<TaskEdge, 'id'>) => string
  removeEdge: (graphId: string, edgeId: string) => void

  // Selection
  selectNode: (nodeId: string | null) => void

  // Layout
  setLayout: (layout: GraphLayout) => void

  // Utilities
  getSuccessors: (graphId: string, nodeId: string) => TaskNode[]
  getPredecessors: (graphId: string, nodeId: string) => TaskNode[]
}

let idCounter = 0
function generateId(): string {
  idCounter += 1
  return `graph-${Date.now()}-${idCounter}`
}

export const useTaskGraphStore = create<TaskGraphState>()((set, get) => ({
  graphs: [],
  activeGraphId: null,
  layout: 'dagre',
  selectedNodeId: null,

  createGraph: (name) => {
    const id = generateId()
    const graph: TaskGraph = {
      id,
      name,
      nodes: [],
      edges: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    set((state) => ({
      graphs: [...state.graphs, graph],
      activeGraphId: id,
    }))
    return id
  },

  deleteGraph: (id) => {
    set((state) => ({
      graphs: state.graphs.filter((g) => g.id !== id),
      activeGraphId: state.activeGraphId === id ? null : state.activeGraphId,
    }))
  },

  setActiveGraph: (id) => set({ activeGraphId: id }),

  addNode: (graphId, nodeData) => {
    const nodeId = generateId()
    const node: TaskNode = { ...nodeData, id: nodeId }
    set((state) => ({
      graphs: state.graphs.map((g) =>
        g.id === graphId
          ? { ...g, nodes: [...g.nodes, node], updatedAt: new Date() }
          : g
      ),
    }))
    return nodeId
  },

  updateNode: (graphId, nodeId, updates) => {
    set((state) => ({
      graphs: state.graphs.map((g) =>
        g.id === graphId
          ? {
              ...g,
              nodes: g.nodes.map((n) =>
                n.id === nodeId ? { ...n, ...updates } : n
              ),
              updatedAt: new Date(),
            }
          : g
      ),
    }))
  },

  removeNode: (graphId, nodeId) => {
    set((state) => ({
      graphs: state.graphs.map((g) =>
        g.id === graphId
          ? {
              ...g,
              nodes: g.nodes.filter((n) => n.id !== nodeId),
              edges: g.edges.filter(
                (e) => e.source !== nodeId && e.target !== nodeId
              ),
              updatedAt: new Date(),
            }
          : g
      ),
    }))
  },

  addEdge: (graphId, edgeData) => {
    const edgeId = generateId()
    const edge: TaskEdge = { ...edgeData, id: edgeId }
    set((state) => ({
      graphs: state.graphs.map((g) =>
        g.id === graphId
          ? { ...g, edges: [...g.edges, edge], updatedAt: new Date() }
          : g
      ),
    }))
    return edgeId
  },

  removeEdge: (graphId, edgeId) => {
    set((state) => ({
      graphs: state.graphs.map((g) =>
        g.id === graphId
          ? { ...g, edges: g.edges.filter((e) => e.id !== edgeId), updatedAt: new Date() }
          : g
      ),
    }))
  },

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

  setLayout: (layout) => set({ layout }),

  getSuccessors: (graphId, nodeId) => {
    const graph = get().graphs.find((g) => g.id === graphId)
    if (!graph) return []
    const targetIds = graph.edges
      .filter((e) => e.source === nodeId)
      .map((e) => e.target)
    return graph.nodes.filter((n) => targetIds.includes(n.id))
  },

  getPredecessors: (graphId, nodeId) => {
    const graph = get().graphs.find((g) => g.id === graphId)
    if (!graph) return []
    const sourceIds = graph.edges
      .filter((e) => e.target === nodeId)
      .map((e) => e.source)
    return graph.nodes.filter((n) => sourceIds.includes(n.id))
  },
}))
