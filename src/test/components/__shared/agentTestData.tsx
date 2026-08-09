import { render } from '@testing-library/react'
import { AgentSidebar } from '../../../components/agents/AgentSidebar'
import { useAgentStore, type Agent } from '../../../stores/agentStore'

// ── Default agents (mirrors store DEFAULT_AGENTS) ─────────────────────────

export const DEFAULT_AGENTS: Agent[] = [
  { id: 'se-1', name: 'Software Engineer', provider: 'claude', role: 'software-engineer', status: 'idle', description: 'Implements features, writes code, fixes bugs', category: 'engineering', model: 'claude-sonnet-4-20250514' },
  { id: 'se-2', name: 'Software Engineer #2', provider: 'codex', role: 'software-engineer', status: 'idle', description: 'Secondary engineer for parallel tasks', category: 'engineering', model: 'codex-mini' },
  { id: 'tl-1', name: 'Tech Lead', provider: 'claude', role: 'tech-lead', status: 'idle', description: 'Architecture review, code quality, trade-off decisions', category: 'engineering', model: 'claude-sonnet-4-20250514' },
  { id: 'devops-1', name: 'DevOps Engineer', provider: 'claude', role: 'devops-engineer', status: 'idle', description: 'CI/CD, deployment, infrastructure, monitoring', category: 'operations', model: 'claude-sonnet-4-20250514' },
  { id: 'sec-1', name: 'Security Engineer', provider: 'gemini', role: 'security-engineer', status: 'idle', description: 'Vulnerability review, auth, compliance, secrets scanning', category: 'operations', model: 'gemini-2.5-pro' },
  { id: 'qa-1', name: 'QA Engineer', provider: 'gemini', role: 'qa-engineer', status: 'idle', description: 'Test strategy, unit/integration/E2E tests, coverage', category: 'quality', model: 'gemini-2.5-flash' },
  { id: 'de-1', name: 'Data Engineer', provider: 'claude', role: 'data-engineer', status: 'idle', description: 'Pipelines, database schema, migrations, query optimization', category: 'data-ai', model: 'claude-sonnet-4-20250514' },
  { id: 'ml-1', name: 'ML Engineer', provider: 'gemini', role: 'ml-engineer', status: 'idle', description: 'Model development, training, evaluation, serving', category: 'data-ai', model: 'gemini-2.5-pro' },
]

// ── Helpers ────────────────────────────────────────────────────────────────

export function renderSidebar() {
  return render(<AgentSidebar />)
}

export function resetStore() {
  useAgentStore.setState({
    activeAgentId: null,
    agents: DEFAULT_AGENTS,
    reorderAgents: useAgentStore.getState().reorderAgents,
  })
}
