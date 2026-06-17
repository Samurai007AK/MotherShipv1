import { create } from 'zustand'

export type AgentStatus = 'running' | 'idle' | 'error' | 'offline'

export type AgentProvider = 'claude' | 'codex' | 'gemini' | 'opencode' | 'file'

export type AgentCategory = 'coding' | 'research' | 'ops' | 'creative'

export interface Agent {
  id: string
  name: string
  provider: AgentProvider
  status: AgentStatus
  description: string
  category: AgentCategory
  model?: string
  /** Custom system prompt for AI chat mode behavior */
  systemPrompt?: string
  lastActive?: Date
}

const PROVIDER_COLORS: Record<AgentProvider, string> = {
  claude: 'bg-agent-claude',
  codex: 'bg-agent-codex',
  gemini: 'bg-agent-gemini',
  opencode: 'bg-agent-opencode',
  file: 'bg-blue-500',
}

const STATUS_COLORS: Record<AgentStatus, string> = {
  running: 'bg-status-running',
  idle: 'bg-status-idle',
  error: 'bg-status-error',
  offline: 'bg-zinc-600',
}

export function getProviderColor(provider: AgentProvider): string {
  return PROVIDER_COLORS[provider]
}

export function getStatusColor(status: AgentStatus): string {
  return STATUS_COLORS[status]
}

// Default agents to populate the sidebar
const DEFAULT_AGENTS: Agent[] = [
  {
    id: 'claude',
    name: 'Claude',
    provider: 'claude',
    status: 'idle',
    description: 'Anthropic Claude — deep reasoning, long context',
    category: 'coding',
    model: 'claude-sonnet-4-20250514',
  },
  {
    id: 'codex',
    name: 'Codex',
    provider: 'codex',
    status: 'idle',
    description: 'OpenAI Codex — code generation, fast iteration',
    category: 'coding',
    model: 'codex-mini',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    provider: 'gemini',
    status: 'idle',
    description: 'Google Gemini — multimodal, broad knowledge',
    category: 'coding',
    model: 'gemini-2.5-pro',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    provider: 'opencode',
    status: 'offline',
    description: 'Open source coding agent — local inference',
    category: 'coding',
  },
  {
    id: 'researcher',
    name: 'Researcher',
    provider: 'claude',
    status: 'idle',
    description: 'Deep research and analysis across codebases and docs',
    category: 'research',
    model: 'claude-sonnet-4-20250514',
  },
  {
    id: 'writer',
    name: 'Writer',
    provider: 'claude',
    status: 'idle',
    description: 'Documentation, README, and technical writing',
    category: 'creative',
    model: 'claude-sonnet-4-20250514',
  },
  {
    id: 'debugger',
    name: 'Debugger',
    provider: 'codex',
    status: 'idle',
    description: 'Bug detection, root cause analysis, and fixes',
    category: 'coding',
    model: 'codex-mini',
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    provider: 'gemini',
    status: 'idle',
    description: 'Code review, quality checks, and best practices',
    category: 'coding',
    model: 'gemini-2.5-flash',
  },
  {
    id: 'devops',
    name: 'DevOps',
    provider: 'claude',
    status: 'idle',
    description: 'Build systems, CI/CD, deployment, and infrastructure',
    category: 'ops',
    model: 'claude-sonnet-4-20250514',
  },
  {
    id: 'designer',
    name: 'Designer',
    provider: 'gemini',
    status: 'idle',
    description: 'UI/UX design, Tailwind styling, and visual polish',
    category: 'creative',
    model: 'gemini-2.5-flash',
  },
]

interface AgentState {
  agents: Agent[]
  activeAgentId: string | null
  recentAgentIds: string[]

  // Actions
  setActiveAgent: (id: string) => void
  registerAgent: (agent: Agent) => void
  removeAgent: (id: string) => void
  updateAgentStatus: (id: string, status: AgentStatus) => void
  reorderAgents: (fromIndex: number, toIndex: number) => void
  recordRecentAgent: (id: string) => void
}

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem('mothership-recent-agents')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveRecent(ids: string[]) {
  try {
    localStorage.setItem('mothership-recent-agents', JSON.stringify(ids))
  } catch {
    // Ignore storage errors
  }
}

const MAX_RECENT = 5

export const useAgentStore = create<AgentState>()((set) => ({
  agents: DEFAULT_AGENTS,
  activeAgentId: null,
  recentAgentIds: loadRecent(),

  setActiveAgent: (id) => set({ activeAgentId: id }),

  registerAgent: (agent) =>
    set((state) => {
      const exists = state.agents.find((a) => a.id === agent.id)
      if (exists) {
        return {
          agents: state.agents.map((a) => (a.id === agent.id ? agent : a)),
        }
      }
      return { agents: [...state.agents, agent] }
    }),

  removeAgent: (id) =>
    set((state) => ({
      agents: state.agents.filter((a) => a.id !== id),
      activeAgentId: state.activeAgentId === id ? null : state.activeAgentId,
    })),

  updateAgentStatus: (id, status) =>
    set((state) => ({
      agents: state.agents.map((a) =>
        a.id === id ? { ...a, status, lastActive: new Date() } : a
      ),
    })),

  reorderAgents: (fromIndex, toIndex) =>
    set((state) => {
      const agents = [...state.agents]
      const [moved] = agents.splice(fromIndex, 1)
      agents.splice(toIndex, 0, moved)
      return { agents }
    }),

  recordRecentAgent: (id) =>
    set((state) => {
      const filtered = state.recentAgentIds.filter((rid) => rid !== id)
      const updated = [id, ...filtered].slice(0, MAX_RECENT)
      saveRecent(updated)
      return { recentAgentIds: updated }
    }),
}))
