import { useEffect, useRef, memo, useState } from 'react'
import * as d3 from 'd3'
import { useTaskGraphStore } from '../../stores/taskGraphStore'
import { useAgentStore } from '../../stores/agentStore'
import type { TaskNode } from '../../types/taskGraph'
import {
  Plus,
  Trash2,
  GitBranch,
} from 'lucide-react'

const STATUS_COLORS: Record<TaskNode['status'], string> = {
  pending: '#71717a', // zinc-500
  running: '#a78bfa', // violet-400
  completed: '#4ade80', // green-400
  error: '#f87171', // red-400
  cancelled: '#52525b', // zinc-600
}

const AGENT_COLORS: Record<string, string> = {
  claude: '#60a5fa', // blue-400
  codex: '#4ade80', // green-400
  gemini: '#c084fc', // purple-400
  opencode: '#fb923c', // orange-400
}

interface D3Node extends d3.SimulationNodeDatum {
  id: string
  label: string
  agentId?: string
  status: TaskNode['status']
}

interface D3Link extends d3.SimulationLinkDatum<D3Node> {
  id: string
  label?: string
}

export const TaskGraph = memo(function TaskGraph() {
  const svgRef = useRef<SVGSVGElement>(null)
  const {
    graphs,
    activeGraphId,
    layout,
    selectedNodeId,
    selectNode,
    addNode,
    removeNode,
    addEdge,
  } = useTaskGraphStore()
  const { agents } = useAgentStore()

  const activeGraph = graphs.find((g) => g.id === activeGraphId)

  const [showAddNode, setShowAddNode] = useState(false)
  const [newNodeLabel, setNewNodeLabel] = useState('')
  const [newNodeAgent, setNewNodeAgent] = useState('')
  const [edgeMode, setEdgeMode] = useState(false)
  const [edgeSource, setEdgeSource] = useState<string | null>(null)

  // D3 rendering
  useEffect(() => {
    if (!svgRef.current || !activeGraph) return

    const svg = d3.select(svgRef.current)
    const width = svgRef.current.clientWidth || 600
    const height = svgRef.current.clientHeight || 400

    // Clear previous
    svg.selectAll('*').remove()

    // Create zoom behavior
    const g = svg.append('g')
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
      })
    svg.call(zoom)

    // Prepare nodes and links
    const nodes: D3Node[] = activeGraph.nodes.map((n) => ({ ...n }))
    const links: D3Link[] = activeGraph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
    }))

    if (nodes.length === 0) {
      g.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#71717a')
        .attr('font-size', '12px')
        .text('No tasks yet. Add nodes to build a graph.')
      return
    }

    // Create simulation
    const simulation = d3
      .forceSimulation<D3Node>(nodes)
      .force(
        'link',
        d3.forceLink<D3Node, D3Link>(links)
          .id((d) => d.id)
          .distance(120)
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('y', d3.forceY<D3Node>().strength(0.1))

    // Draw edges
    const linkGroup = g.append('g').attr('class', 'links')
    const link = linkGroup
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', '#3f3f46')
      .attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#arrowhead)')

    // Draw edge labels
    const linkLabel = linkGroup
      .selectAll('text')
      .data(links)
      .enter()
      .append('text')
      .attr('fill', '#71717a')
      .attr('font-size', '9px')
      .attr('text-anchor', 'middle')
      .text((d) => d.label || '')

    // Draw nodes
    const nodeGroup = g.append('g').attr('class', 'nodes')
    const node = nodeGroup
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('cursor', 'pointer')
      .call(
        d3.drag<SVGGElement, D3Node>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on('drag', (event, d) => {
            d.fx = event.x
            d.fy = event.y
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null
            d.fy = null
          })
      )
      .on('click', (event, d) => {
        event.stopPropagation()
        if (edgeMode) {
          if (!edgeSource) {
            setEdgeSource(d.id)
          } else if (edgeSource !== d.id) {
            addEdge(activeGraph.id, { source: edgeSource, target: d.id })
            setEdgeSource(null)
            setEdgeMode(false)
          }
        } else {
          selectNode(selectedNodeId === d.id ? null : d.id)
        }
      })

    // Node circle
    node
      .append('circle')
      .attr('r', 20)
      .attr('fill', (d) => {
        const agentColor = d.agentId
          ? AGENT_COLORS[d.agentId] || '#71717a'
          : '#71717a'
        return agentColor
      })
      .attr('stroke', (d) =>
        selectedNodeId === d.id ? '#f4f4f5' : '#27272a'
      )
      .attr('stroke-width', (d) => (selectedNodeId === d.id ? 2 : 1))

    // Status indicator
    node
      .append('circle')
      .attr('cx', 14)
      .attr('cy', -14)
      .attr('r', 5)
      .attr('fill', (d) => STATUS_COLORS[d.status])

    // Node label
    node
      .append('text')
      .attr('dy', 32)
      .attr('text-anchor', 'middle')
      .attr('fill', '#d4d4d8')
      .attr('font-size', '10px')
      .text((d) => d.label.slice(0, 15) + (d.label.length > 15 ? '...' : ''))

    // Tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as D3Node).x || 0)
        .attr('y1', (d) => (d.source as D3Node).y || 0)
        .attr('x2', (d) => (d.target as D3Node).x || 0)
        .attr('y2', (d) => (d.target as D3Node).y || 0)

      linkLabel
        .attr('x', (d) =>
          (((d.source as D3Node).x || 0) + ((d.target as D3Node).x || 0)) / 2
        )
        .attr('y', (d) =>
          (((d.source as D3Node).y || 0) + ((d.target as D3Node).y || 0)) / 2
        )

      node.attr('transform', (d) => `translate(${d.x || 0},${d.y || 0})`)
    })

    // Cleanup
    return () => {
      simulation.stop()
    }
  }, [activeGraph, layout, selectedNodeId, edgeMode, edgeSource])

  const handleAddNode = () => {
    if (!activeGraph || !newNodeLabel.trim()) return
    addNode(activeGraph.id, {
      label: newNodeLabel,
      agentId: newNodeAgent || undefined,
      status: 'pending',
    })
    setNewNodeLabel('')
    setNewNodeAgent('')
    setShowAddNode(false)
  }

  const handleDeleteSelected = () => {
    if (!activeGraph || !selectedNodeId) return
    removeNode(activeGraph.id, selectedNodeId)
    selectNode(null)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-2 border-b border-c-border">
        <div className="flex items-center gap-2 mb-2">
          <GitBranch className="w-4 h-4 text-mothership-500" />
          <span className="text-xs font-medium text-c-primary">Task Graph</span>
        </div>

        {/* Graph selector */}
        <div className="flex gap-1 mb-2">
          {graphs.length === 0 ? (
            <span className="text-[10px] text-c-secondary">No graphs</span>
          ) : (
            <select
              value={activeGraphId || ''}
              onChange={(e) => {
                const store = useTaskGraphStore.getState()
                store.setActiveGraph(e.target.value)
              }}
              className="flex-1 bg-transparent text-[10px] text-c-secondary border border-c-border rounded px-2 py-1 focus:outline-none focus:border-mothership-500"
            >
              {graphs.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Actions */}
        {activeGraph && (
          <div className="flex gap-1">
            <button
              onClick={() => setShowAddNode(true)}
              className="flex items-center gap-1 px-2 py-1 text-[10px] text-c-secondary hover:text-c-primary rounded hover:bg-surface-hover transition-colors"
            >
              <Plus className="w-3 h-3" />
              Node
            </button>
            <button
              onClick={() => {
                setEdgeMode(!edgeMode)
                setEdgeSource(null)
              }}
              className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors ${
                edgeMode
                  ? 'bg-mothership-500/20 text-mothership-400'
                  : 'text-c-secondary hover:text-c-primary hover:bg-surface-hover'
              }`}
            >
              <GitBranch className="w-3 h-3" />
              {edgeMode ? 'Cancel Edge' : 'Edge'}
            </button>
            {selectedNodeId && (
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-red-400 hover:text-red-300 rounded hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      {/* Add Node Form */}
      {showAddNode && (
        <div className="p-2 border-b border-c-border bg-surface-subtle">
          <input
            value={newNodeLabel}
            onChange={(e) => setNewNodeLabel(e.target.value)}
            placeholder="Task label"
            className="w-full bg-transparent text-xs text-c-primary placeholder-c-secondary border border-c-border rounded px-2 py-1 mb-2 focus:outline-none focus:border-mothership-500"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddNode()
              if (e.key === 'Escape') setShowAddNode(false)
            }}
          />
          <select
            value={newNodeAgent}
            onChange={(e) => setNewNodeAgent(e.target.value)}
            className="w-full bg-transparent text-xs text-c-secondary border border-c-border rounded px-2 py-1 mb-2 focus:outline-none"
          >
            <option value="">No agent</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              onClick={handleAddNode}
              className="px-3 py-1 bg-mothership-500 text-white text-[10px] rounded hover:bg-mothership-600 transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => setShowAddNode(false)}
              className="px-3 py-1 text-c-secondary text-[10px] rounded hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Edge Mode Indicator */}
      {edgeMode && (
        <div className="px-2 py-1 bg-mothership-500/10 border-b border-c-border text-[10px] text-mothership-400">
          {edgeSource
            ? 'Click target node to create edge'
            : 'Click source node to start edge'}
        </div>
      )}

      {/* SVG Canvas */}
      <div className="flex-1 relative">
        <svg
          ref={svgRef}
          className="w-full h-full bg-surface-base"
          onClick={() => {
            if (edgeMode) {
              setEdgeSource(null)
            }
          }}
        />

        {/* Arrowhead marker definition */}
        <svg className="absolute w-0 h-0">
          <defs>
            <marker
              id="arrowhead"
              viewBox="0 0 10 7"
              refX="10"
              refY="3.5"
              markerWidth="8"
              markerHeight="6"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#3f3f46" />
            </marker>
          </defs>
        </svg>
      </div>

      {/* Legend */}
      <div className="p-2 border-t border-c-border">
        <div className="flex flex-wrap gap-3 text-[9px] text-c-secondary">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-zinc-500" />
            Pending
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-violet-400" />
            Running
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            Completed
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            Error
          </span>
        </div>
      </div>
    </div>
  )
})
