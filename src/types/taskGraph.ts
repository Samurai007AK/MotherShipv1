// Task dependency graph types
export interface TaskNode {
  id: string
  label: string
  agentId?: string
  status: 'pending' | 'running' | 'completed' | 'error' | 'cancelled'
  x?: number
  y?: number
}

export interface TaskEdge {
  id: string
  source: string // source node id
  target: string // target node id
  label?: string
}

export interface TaskGraph {
  id: string
  name: string
  nodes: TaskNode[]
  edges: TaskEdge[]
  createdAt: Date
  updatedAt: Date
}

// Layout options
export type GraphLayout = 'dagre' | 'force' | 'tree'
