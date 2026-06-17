import type { AgentProvider } from '../stores/agentStore'

// War Room broadcast: send same prompt to multiple agents
export interface WarRoomBroadcast {
  id: string
  prompt: string
  agentIds: string[]
  createdAt: Date
  status: 'pending' | 'in_progress' | 'completed' | 'error'
}

// Individual agent response within a broadcast
export interface WarRoomResponse {
  id: string
  broadcastId: string
  agentId: string
  provider: AgentProvider
  content: string
  status: 'pending' | 'streaming' | 'completed' | 'error'
  error?: string
  startedAt?: Date
  completedAt?: Date
  tokenCount?: number
}

// War Room session: groups broadcasts and responses
export interface WarRoomSession {
  id: string
  name: string
  broadcasts: WarRoomBroadcast[]
  responses: WarRoomResponse[]
  createdAt: Date
  updatedAt: Date
}

// Task chaining: output of one agent becomes input of another
export interface TaskChain {
  id: string
  name: string
  steps: TaskChainStep[]
  status: 'pending' | 'in_progress' | 'completed' | 'error'
  createdAt: Date
}

export interface TaskChainStep {
  id: string
  agentId: string
  provider: AgentProvider
  prompt: string
  status: 'pending' | 'running' | 'completed' | 'error'
  output?: string
  error?: string
}

// View mode for War Room
export type WarRoomView = 'broadcast' | 'side_by_side' | 'chain'
