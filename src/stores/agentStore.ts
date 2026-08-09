import { create } from 'zustand'

export type AgentStatus = 'running' | 'idle' | 'error' | 'offline'

/** The AI provider backing this agent (kept for backend model routing) */
export type AgentProvider = 'claude' | 'codex' | 'gemini' | 'opencode' | 'file'

/** Engineering role this agent fills on the team */
export type EngineeringRole =
  | 'software-engineer'
  | 'devops-engineer'
  | 'security-engineer'
  | 'data-engineer'
  | 'ml-engineer'
  | 'qa-engineer'
  | 'tech-lead'

/** Team category derived from role */
export type TeamCategory = 'engineering' | 'operations' | 'quality' | 'data-ai'

export interface Agent {
  id: string
  name: string
  provider: AgentProvider
  role: EngineeringRole
  status: AgentStatus
  description: string
  category: TeamCategory
  model?: string
  /** Custom system prompt for AI chat mode behavior */
  systemPrompt?: string
  lastActive?: Date
}

// ── Role metadata ──────────────────────────────────────────────────────────

export interface RoleMeta {
  label: string
  color: string
  icon: string
  category: TeamCategory
  systemPrompt: string
}

export const ROLE_META: Record<EngineeringRole, RoleMeta> = {
  'software-engineer': {
    label: 'Software Engineer',
    color: 'bg-violet-500',
    icon: '💻',
    category: 'engineering',
    systemPrompt:
      'You are a senior software engineer. Write clean, well-structured, production-quality code. Follow SOLID principles, use appropriate design patterns, write meaningful tests, and consider edge cases. When implementing features, break them into small, testable units. Always verify your work compiles and tests pass before considering a task complete.',
  },
  'devops-engineer': {
    label: 'DevOps Engineer',
    color: 'bg-orange-500',
    icon: '🔧',
    category: 'operations',
    systemPrompt:
      'You are a DevOps/SRE engineer. Focus on build systems, CI/CD pipelines, deployment automation, container orchestration, infrastructure as code, monitoring, and reliability. When making changes, consider their impact on deployment, rollback strategies, and operational safety. Prefer idempotent, declarative configurations.',
  },
  'security-engineer': {
    label: 'Security Engineer',
    color: 'bg-red-500',
    icon: '🛡️',
    category: 'operations',
    systemPrompt:
      'You are a security engineer. Review code for vulnerabilities (OWASP Top 10, injection, XSS, CSRF, auth bypass), enforce secure defaults, check for hardcoded secrets, validate input/output, and ensure proper access controls. Flag security issues with severity levels and provide remediation steps. Never approve code with known security flaws.',
  },
  'data-engineer': {
    label: 'Data Engineer',
    color: 'bg-sky-500',
    icon: '📊',
    category: 'data-ai',
    systemPrompt:
      'You are a data engineer. Focus on data pipelines, ETL/ELT processes, database schema design, data modeling, migrations, query optimization, and data quality. When working with databases, always use parameterized queries, write migrations carefully, and consider backward compatibility.',
  },
  'ml-engineer': {
    label: 'ML Engineer',
    color: 'bg-emerald-500',
    icon: '🧠',
    category: 'data-ai',
    systemPrompt:
      'You are an ML/AI engineer. Focus on model development, training pipelines, feature engineering, evaluation metrics, model serving, and MLOps. Write reproducible experiments, track hyperparameters, use proper train/validation/test splits, and consider model performance, latency, and resource constraints.',
  },
  'qa-engineer': {
    label: 'QA Engineer',
    color: 'bg-teal-500',
    icon: '✅',
    category: 'quality',
    systemPrompt:
      'You are a QA engineer. Write comprehensive tests (unit, integration, e2e), design test strategies, identify edge cases, set up test fixtures, and ensure code coverage. When testing, cover happy paths, error cases, boundary conditions, and concurrent scenarios. Fail tests should include clear diagnostic messages.',
  },
  'tech-lead': {
    label: 'Tech Lead',
    color: 'bg-amber-500',
    icon: '👑',
    category: 'engineering',
    systemPrompt:
      'You are a tech lead / architect. Review code for architectural soundness, consistency with existing patterns, scalability, and maintainability. When making decisions, weigh trade-offs explicitly. Ensure changes follow established conventions, don\'t introduce unnecessary complexity, and are documented appropriately. Coach the team through code reviews.',
  },
}

export function getRoleMeta(role: EngineeringRole): RoleMeta {
  return ROLE_META[role]
}

/** Helper to get all available roles as an array */
export function getAllRoles(): { id: EngineeringRole; meta: RoleMeta }[] {
  return (Object.keys(ROLE_META) as EngineeringRole[]).map((id) => ({
    id,
    meta: ROLE_META[id],
  }))
}

export function getRoleColor(role: EngineeringRole): string {
  return ROLE_META[role].color
}

// ── Provider colors (kept for WarRoom/ExecutionPanel backward compat) ─────

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

// ── Default team members ───────────────────────────────────────────────────

const DEFAULT_AGENTS: Agent[] = [
  {
    id: 'se-1',
    name: 'Software Engineer',
    provider: 'claude',
    role: 'software-engineer',
    status: 'idle',
    description: 'Implements features, writes code, fixes bugs',
    category: 'engineering',
    model: 'claude-sonnet-4-20250514',
    systemPrompt: ROLE_META['software-engineer'].systemPrompt,
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
    systemPrompt: ROLE_META['software-engineer'].systemPrompt,
  },
  {
    id: 'tl-1',
    name: 'Tech Lead',
    provider: 'claude',
    role: 'tech-lead',
    status: 'idle',
    description: 'Architecture review, code quality, trade-off decisions',
    category: 'engineering',
    model: 'claude-sonnet-4-20250514',
    systemPrompt: ROLE_META['tech-lead'].systemPrompt,
  },
  {
    id: 'devops-1',
    name: 'DevOps Engineer',
    provider: 'claude',
    role: 'devops-engineer',
    status: 'idle',
    description: 'CI/CD, deployment, infrastructure, monitoring',
    category: 'operations',
    model: 'claude-sonnet-4-20250514',
    systemPrompt: ROLE_META['devops-engineer'].systemPrompt,
  },
  {
    id: 'sec-1',
    name: 'Security Engineer',
    provider: 'gemini',
    role: 'security-engineer',
    status: 'idle',
    description: 'Vulnerability review, auth, compliance, secrets scanning',
    category: 'operations',
    model: 'gemini-2.5-pro',
    systemPrompt: ROLE_META['security-engineer'].systemPrompt,
  },
  {
    id: 'qa-1',
    name: 'QA Engineer',
    provider: 'gemini',
    role: 'qa-engineer',
    status: 'idle',
    description: 'Test strategy, unit/integration/E2E tests, coverage',
    category: 'quality',
    model: 'gemini-2.5-flash',
    systemPrompt: ROLE_META['qa-engineer'].systemPrompt,
  },
  {
    id: 'de-1',
    name: 'Data Engineer',
    provider: 'claude',
    role: 'data-engineer',
    status: 'idle',
    description: 'Pipelines, database schema, migrations, query optimization',
    category: 'data-ai',
    model: 'claude-sonnet-4-20250514',
    systemPrompt: ROLE_META['data-engineer'].systemPrompt,
  },
  {
    id: 'ml-1',
    name: 'ML Engineer',
    provider: 'gemini',
    role: 'ml-engineer',
    status: 'idle',
    description: 'Model development, training, evaluation, serving',
    category: 'data-ai',
    model: 'gemini-2.5-pro',
    systemPrompt: ROLE_META['ml-engineer'].systemPrompt,
  },
]

// ── Store ──────────────────────────────────────────────────────────────────

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
