import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TaskGraph } from '../../components/task-graph/TaskGraph'
import { useTaskGraphStore } from '../../stores/taskGraphStore'
import { useAgentStore, type Agent } from '../../stores/agentStore'

// ── jsdom polyfills ────────────────────────────────────────────────────────

beforeAll(() => {
  // SVG elements get clientWidth/Height from D3 fallback (600/400) but keep
  // the polyfill anyway in case anything reads scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn()
})

// ── Mock Tauri invoke (required by setup pattern) ──────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// ── Mock data ──────────────────────────────────────────────────────────────

const MOCK_AGENTS: Agent[] = [
  { id: 'claude', name: 'Claude', provider: 'claude', role: 'software-engineer', status: 'idle', description: 'Coding assistant', category: 'engineering', model: 'claude-sonnet' },
  { id: 'codex', name: 'Codex', provider: 'codex', role: 'software-engineer', status: 'idle', description: 'Code review', category: 'engineering', model: 'codex-mini' },
]

function buildGraph(id: string, name: string, withNodes = false) {
  useTaskGraphStore.setState({ activeGraphId: id })
  useTaskGraphStore.setState((s) => ({
    graphs: [
      ...s.graphs,
      {
        id,
        name,
        nodes: withNodes
          ? [
              { id: 'n-1', label: 'Design API', status: 'completed', agentId: 'claude' },
              { id: 'n-2', label: 'Implement feature', status: 'running', agentId: 'codex' },
            ]
          : [],
        edges: withNodes ? [{ id: 'e-1', source: 'n-1', target: 'n-2', label: 'blocks' }] : [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  }))
}

// ── Store fixture helper ───────────────────────────────────────────────────

function clearStores() {
  useTaskGraphStore.setState({
    graphs: [],
    activeGraphId: null,
    layout: 'dagre',
    selectedNodeId: null,
  })
  useAgentStore.setState({
    agents: [],
    activeAgentId: null,
    recentAgentIds: [],
  })
}

function renderGraph() {
  return render(<TaskGraph />)
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('TaskGraph', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    clearStores()
  })

  // ── Header ───────────────────────────────────────────────────────────────

  describe('header', () => {
    it('renders the Task Graph title', () => {
      renderGraph()
      expect(screen.getByText('Task Graph')).toBeInTheDocument()
    })

    it('renders a GitBranch icon next to the title', () => {
      renderGraph()
      expect(document.querySelector('.lucide-git-branch')).toBeInTheDocument()
    })
  })

  // ── Empty state ──────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('shows "No graphs" when there are no graphs', () => {
      renderGraph()
      expect(screen.getByText('No graphs')).toBeInTheDocument()
    })

    it('does not show the Node/Edge action buttons when there is no active graph', () => {
      renderGraph()
      expect(screen.queryByText('Node')).not.toBeInTheDocument()
      expect(screen.queryByText('Edge')).not.toBeInTheDocument()
    })

    it('renders an SVG canvas even with no graph', () => {
      renderGraph()
      expect(document.querySelector('svg')).toBeInTheDocument()
    })

    it('renders the empty-task text inside the SVG when the active graph has no nodes', () => {
      buildGraph('g-1', 'Empty Graph', false)
      renderGraph()
      expect(screen.getByText('No tasks yet. Add nodes to build a graph.')).toBeInTheDocument()
    })
  })

  // ── Graph selector ───────────────────────────────────────────────────────

  describe('graph selector', () => {
    it('shows a <select> populated with graph names when graphs exist', () => {
      buildGraph('g-1', 'Sprint 1', false)
      buildGraph('g-2', 'Sprint 2', false)
      renderGraph()
      const select = document.querySelector('select') as HTMLSelectElement
      expect(select).toBeInTheDocument()
      expect(screen.getByText('Sprint 1')).toBeInTheDocument()
      expect(screen.getByText('Sprint 2')).toBeInTheDocument()
    })

    it('switches the active graph when a different option is chosen', () => {
      buildGraph('g-1', 'Sprint 1', false)
      buildGraph('g-2', 'Sprint 2', false)
      renderGraph()
      const select = document.querySelector('select') as HTMLSelectElement
      fireEvent.change(select, { target: { value: 'g-2' } })
      expect(useTaskGraphStore.getState().activeGraphId).toBe('g-2')
    })
  })

  // ── Action buttons ───────────────────────────────────────────────────────

  describe('action buttons', () => {
    it('shows Node and Edge action buttons when a graph is active', () => {
      buildGraph('g-1', 'G', false)
      renderGraph()
      expect(screen.getByText('Node')).toBeInTheDocument()
      expect(screen.getByText('Edge')).toBeInTheDocument()
    })

    it('does not show the Delete button when no node is selected', () => {
      buildGraph('g-1', 'G', true)
      renderGraph()
      expect(screen.queryByText('Delete')).not.toBeInTheDocument()
    })

    it('shows the Delete button when a node is selected', () => {
      buildGraph('g-1', 'G', true)
      useTaskGraphStore.setState({ selectedNodeId: 'n-1' })
      renderGraph()
      expect(screen.getByText('Delete')).toBeInTheDocument()
    })
  })

  // ── Add Node form ────────────────────────────────────────────────────────

  describe('add node form', () => {
    it('does not show the form by default', () => {
      buildGraph('g-1', 'G', false)
      renderGraph()
      expect(screen.queryByPlaceholderText('Task label')).not.toBeInTheDocument()
    })

    it('shows the form when the Node button is clicked', () => {
      buildGraph('g-1', 'G', false)
      renderGraph()
      fireEvent.click(screen.getByText('Node'))
      expect(screen.getByPlaceholderText('Task label')).toBeInTheDocument()
      expect(screen.getByText('Add')).toBeInTheDocument()
      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })

    it('hides the form when Cancel is clicked', () => {
      buildGraph('g-1', 'G', false)
      renderGraph()
      fireEvent.click(screen.getByText('Node'))
      fireEvent.click(screen.getByText('Cancel'))
      expect(screen.queryByPlaceholderText('Task label')).not.toBeInTheDocument()
    })

    it('hides the form when Escape is pressed in the label input', () => {
      buildGraph('g-1', 'G', false)
      renderGraph()
      fireEvent.click(screen.getByText('Node'))
      const input = screen.getByPlaceholderText('Task label')
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(screen.queryByPlaceholderText('Task label')).not.toBeInTheDocument()
    })

    it('offers agents in the agent dropdown', () => {
      buildGraph('g-1', 'G', false)
      useAgentStore.setState({ agents: MOCK_AGENTS })
      renderGraph()
      fireEvent.click(screen.getByText('Node'))
      expect(screen.getByText('No agent')).toBeInTheDocument()
      expect(screen.getByText('Claude')).toBeInTheDocument()
      expect(screen.getByText('Codex')).toBeInTheDocument()
    })

    it('adds a node and closes the form when Add is clicked with a label', () => {
      buildGraph('g-1', 'G', false)
      renderGraph()
      fireEvent.click(screen.getByText('Node'))
      fireEvent.change(screen.getByPlaceholderText('Task label'), {
        target: { value: 'New task' },
      })
      fireEvent.click(screen.getByText('Add'))
      const graph = useTaskGraphStore.getState().graphs.find((g) => g.id === 'g-1')
      expect(graph?.nodes.length).toBe(1)
      expect(graph?.nodes[0].label).toBe('New task')
      expect(graph?.nodes[0].status).toBe('pending')
      expect(graph?.nodes[0].agentId).toBeUndefined()
      expect(screen.queryByPlaceholderText('Task label')).not.toBeInTheDocument()
    })

    it('does not call addNode when the label is empty', () => {
      buildGraph('g-1', 'G', false)
      renderGraph()
      fireEvent.click(screen.getByText('Node'))
      fireEvent.click(screen.getByText('Add'))
      const graph = useTaskGraphStore.getState().graphs.find((g) => g.id === 'g-1')
      // No node should have been added, and the form should stay open.
      expect(graph?.nodes.length).toBe(0)
      expect(screen.getByPlaceholderText('Task label')).toBeInTheDocument()
    })

    it('submits the form on Enter and assigns the selected agent', () => {
      buildGraph('g-1', 'G', false)
      useAgentStore.setState({ agents: MOCK_AGENTS })
      renderGraph()
      fireEvent.click(screen.getByText('Node'))
      const labelInput = screen.getByPlaceholderText('Task label')
      fireEvent.change(labelInput, { target: { value: 'Investigate' } })
      // Select the second option (Claude) in the agent <select>
      const selects = document.querySelectorAll('select')
      const agentSelect = Array.from(selects).find((s) =>
        Array.from(s.options).some((o) => o.value === 'claude')
      ) as HTMLSelectElement
      fireEvent.change(agentSelect, { target: { value: 'claude' } })
      fireEvent.keyDown(labelInput, { key: 'Enter' })
      const graph = useTaskGraphStore.getState().graphs.find((g) => g.id === 'g-1')
      expect(graph?.nodes[0].agentId).toBe('claude')
    })
  })

  // ── Edge mode ────────────────────────────────────────────────────────────

  describe('edge mode', () => {
    it('toggles edge mode on when the Edge button is clicked', () => {
      buildGraph('g-1', 'G', false)
      renderGraph()
      fireEvent.click(screen.getByText('Edge'))
      expect(screen.getByText('Cancel Edge')).toBeInTheDocument()
    })

    it('shows the "click source node" hint when entering edge mode', () => {
      buildGraph('g-1', 'G', false)
      renderGraph()
      fireEvent.click(screen.getByText('Edge'))
      expect(screen.getByText('Click source node to start edge')).toBeInTheDocument()
    })

    it('toggles edge mode off when the Cancel Edge button is clicked', () => {
      buildGraph('g-1', 'G', false)
      renderGraph()
      fireEvent.click(screen.getByText('Edge'))
      fireEvent.click(screen.getByText('Cancel Edge'))
      expect(screen.getByText('Edge')).toBeInTheDocument()
      expect(screen.queryByText('Click source node to start edge')).not.toBeInTheDocument()
    })
  })

  // ── Delete ───────────────────────────────────────────────────────────────

  describe('delete selected', () => {
    it('removes the selected node when Delete is clicked', () => {
      buildGraph('g-1', 'G', true)
      useTaskGraphStore.setState({ selectedNodeId: 'n-1' })
      renderGraph()
      const before = useTaskGraphStore.getState().graphs.find((g) => g.id === 'g-1')?.nodes.length
      expect(before).toBe(2)
      fireEvent.click(screen.getByText('Delete'))
      const after = useTaskGraphStore.getState().graphs.find((g) => g.id === 'g-1')?.nodes.length
      expect(after).toBe(1)
      // Delete also clears the selection.
      expect(useTaskGraphStore.getState().selectedNodeId).toBeNull()
    })
  })

  // ── Legend ───────────────────────────────────────────────────────────────

  describe('legend', () => {
    it('renders the status legend with all statuses', () => {
      renderGraph()
      expect(screen.getByText('Pending')).toBeInTheDocument()
      expect(screen.getByText('Running')).toBeInTheDocument()
      expect(screen.getByText('Completed')).toBeInTheDocument()
      expect(screen.getByText('Error')).toBeInTheDocument()
    })
  })

  // ── Arrowhead marker ─────────────────────────────────────────────────────

  describe('svg canvas', () => {
    it('defines an arrowhead marker for edges', () => {
      renderGraph()
      expect(document.querySelector('#arrowhead')).toBeInTheDocument()
    })
  })
})
