import { useState, memo } from 'react'
import { useWarRoomStore } from '../../stores/warRoomStore'
import { useAgentStore, type AgentProvider } from '../../stores/agentStore'
import { useExecutionEngineStore } from '../../stores/executionEngineStore'
import { useMemoryStore } from '../../stores/memoryStore'
import {
  Radio,
  LayoutGrid,
  Link,
  Plus,
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronRight,
  Play,
  X,
} from 'lucide-react'

const PROVIDER_LABELS: Record<AgentProvider, string> = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
  opencode: 'OpenCode',
  file: 'File',
}

const PROVIDER_COLORS: Record<AgentProvider, string> = {
  claude: 'text-blue-400 border-blue-400/30',
  codex: 'text-green-400 border-green-400/30',
  gemini: 'text-purple-400 border-purple-400/30',
  opencode: 'text-orange-400 border-orange-400/30',
  file: 'text-zinc-400 border-zinc-400/30',
}

export const WarRoom = memo(function WarRoom() {
  const {
    sessions,
    activeSessionId,
    view,
    taskChains,
    activeChainId,
    createSession,
    setActiveSession,
    setView,
    createTaskChain,
    setActiveChain,
  } = useWarRoomStore()

  const { agents } = useAgentStore()

  const activeSession = sessions.find((s) => s.id === activeSessionId)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-2 border-b border-c-border">
        <div className="flex items-center gap-2 mb-2">
          <Radio className="w-4 h-4 text-mothership-500" />
          <span className="text-xs font-medium text-c-primary">War Room</span>
        </div>

        {/* View Tabs */}
        <div className="flex gap-1 mb-2">
          <button
            onClick={() => setView('broadcast')}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors ${
              view === 'broadcast'
                ? 'bg-mothership-500/20 text-mothership-400'
                : 'text-c-secondary hover:bg-surface-hover'
            }`}
          >
            <Radio className="w-3 h-3" />
            Broadcast
          </button>
          <button
            onClick={() => setView('side_by_side')}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors ${
              view === 'side_by_side'
                ? 'bg-mothership-500/20 text-mothership-400'
                : 'text-c-secondary hover:bg-surface-hover'
            }`}
          >
            <LayoutGrid className="w-3 h-3" />
            Side by Side
          </button>
          <button
            onClick={() => setView('chain')}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors ${
              view === 'chain'
                ? 'bg-mothership-500/20 text-mothership-400'
                : 'text-c-secondary hover:bg-surface-hover'
            }`}
          >
            <Link className="w-3 h-3" />
            Chain
          </button>
        </div>

        {/* Session List */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => createSession()}
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-c-secondary hover:text-c-primary rounded hover:bg-surface-hover transition-colors"
          >
            <Plus className="w-3 h-3" />
            New
          </button>
          {sessions.length > 0 && (
            <select
              value={activeSessionId || ''}
              onChange={(e) => setActiveSession(e.target.value)}
              className="flex-1 bg-transparent text-[10px] text-c-secondary border border-c-border rounded px-2 py-1 focus:outline-none focus:border-mothership-500"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {view === 'broadcast' && (
          <BroadcastView session={activeSession} agents={agents} />
        )}
        {view === 'side_by_side' && (
          <SideBySideView session={activeSession} agents={agents} />
        )}
        {view === 'chain' && (
          <ChainView
            chains={taskChains}
            activeChainId={activeChainId}
            agents={agents}
            onCreateChain={createTaskChain}
            onSetActiveChain={setActiveChain}
          />
        )}
      </div>
    </div>
  )
})

// Broadcast View: send same prompt to multiple agents, see all responses
function BroadcastView({
  session,
  agents,
}: {
  session: ReturnType<typeof useWarRoomStore.getState>['sessions'][0] | undefined
  agents: ReturnType<typeof useAgentStore.getState>['agents']
}) {
  const { broadcastToAgents } = useWarRoomStore()
  const startGroup = useExecutionEngineStore((s) => s.startGroup)
  const setActiveTab = useMemoryStore((s) => s.setActiveTab)
  const [prompt, setPrompt] = useState('')
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set())
  const [isStartingEngine, setIsStartingEngine] = useState(false)

  const toggleAgent = (id: string) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBroadcast = () => {
    if (!prompt.trim() || selectedAgents.size === 0) return

    const providers: Record<string, AgentProvider> = {}
    agents.forEach((a) => {
      if (selectedAgents.has(a.id)) providers[a.id] = a.provider
    })

    broadcastToAgents(prompt, Array.from(selectedAgents), providers)
    setPrompt('')
  }

  const handleRunInEngine = async () => {
    if (!prompt.trim() || selectedAgents.size === 0 || isStartingEngine) return

    setIsStartingEngine(true)

    const groupId = await startGroup({
      name: `War Room: ${prompt.slice(0, 40)}${prompt.length > 40 ? '...' : ''}`,
      agents: Array.from(selectedAgents).map((agentId) => ({
        agent_id: agentId,
        prompt: prompt.trim(),
      })),
      initial_context: undefined,
    })

    if (groupId) {
      // Switch to the Execution tab to show real-time progress
      setActiveTab('execution')
    }

    setIsStartingEngine(false)
  }

  // Get responses for current broadcast
  const latestBroadcast = session?.broadcasts[session.broadcasts.length - 1]
  const responses = session?.responses.filter(
    (r) => r.broadcastId === latestBroadcast?.id
  ) || []

  return (
    <div className="flex flex-col h-full">
      {/* Agent Selector */}
      <div className="p-2 border-b border-c-border">
        <div className="text-[10px] text-c-secondary mb-1">Select agents:</div>
        <div className="flex flex-wrap gap-1">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => toggleAgent(agent.id)}
              className={`flex items-center gap-1 px-2 py-0.5 text-[10px] rounded border transition-colors ${
                selectedAgents.has(agent.id)
                  ? `${PROVIDER_COLORS[agent.provider]} bg-surface-hover`
                  : 'text-c-secondary border-c-border hover:border-c-muted'
              }`}
            >
              {selectedAgents.has(agent.id) && (
                <CheckCircle2 className="w-2.5 h-2.5" />
              )}
              {agent.name}
            </button>
          ))}
        </div>
      </div>

      {/* Prompt Input */}
      <div className="p-2 border-b border-c-border">
        <div className="flex gap-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Broadcast to selected agents..."
            className="flex-1 bg-transparent text-xs text-c-primary placeholder-c-secondary border border-c-border rounded px-2 py-1 resize-none focus:outline-none focus:border-mothership-500"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleBroadcast()
              }
            }}
          />
          <button
            onClick={handleBroadcast}
            disabled={!prompt.trim() || selectedAgents.size === 0}
            className="px-3 py-1 bg-mothership-500 text-white text-[10px] rounded hover:bg-mothership-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Broadcast (stub responses)"
          >
            <Send className="w-3 h-3" />
          </button>
          <button
            onClick={handleRunInEngine}
            disabled={!prompt.trim() || selectedAgents.size === 0 || isStartingEngine}
            className="flex items-center gap-1 px-3 py-1 bg-green-600/80 text-white text-[10px] rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Run in Execution Engine (real parallel execution)"
          >
            {isStartingEngine ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Play className="w-3 h-3" />
            )}
            Run in Engine
          </button>
        </div>
      </div>

      {/* Responses */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {responses.length === 0 && (
          <div className="text-center text-c-secondary text-[10px] py-8">
            Select agents and broadcast a prompt to see responses
          </div>
        )}
        {responses.map((response) => {
          const agent = agents.find((a) => a.id === response.agentId)
          return (
            <div
              key={response.id}
              className="border border-c-border rounded p-2"
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`text-[10px] font-medium ${PROVIDER_COLORS[response.provider]}`}
                >
                  {agent?.name || response.agentId}
                </span>
                <span className="text-[10px] text-c-secondary">
                  {PROVIDER_LABELS[response.provider]}
                </span>
                {response.status === 'streaming' && (
                  <Loader2 className="w-3 h-3 text-mothership-400 animate-spin" />
                )}
                {response.status === 'completed' && (
                  <CheckCircle2 className="w-3 h-3 text-green-400" />
                )}
                {response.status === 'error' && (
                  <AlertCircle className="w-3 h-3 text-red-400" />
                )}
              </div>
              <div className="text-xs text-c-primary whitespace-pre-wrap">
                {response.content || (
                  <span className="text-c-secondary italic">
                    {response.status === 'pending' ? 'Waiting...' : 'No content'}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Side by Side View: view all agent responses in columns
function SideBySideView({
  session,
  agents,
}: {
  session: ReturnType<typeof useWarRoomStore.getState>['sessions'][0] | undefined
  agents: ReturnType<typeof useAgentStore.getState>['agents']
}) {
  // Group responses by broadcast
  const broadcasts = session?.broadcasts || []
  const responses = session?.responses || []

  return (
    <div className="flex flex-col h-full overflow-auto p-2">
      {broadcasts.length === 0 && (
        <div className="text-center text-c-secondary text-[10px] py-8">
          No broadcasts yet. Use Broadcast view to send prompts.
        </div>
      )}
      {broadcasts.map((broadcast) => {
        const broadcastResponses = responses.filter(
          (r) => r.broadcastId === broadcast.id
        )
        return (
          <div key={broadcast.id} className="mb-4">
            <div className="text-[10px] text-c-secondary mb-2 px-1">
              {broadcast.prompt.slice(0, 80)}
              {broadcast.prompt.length > 80 && '...'}
            </div>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${broadcastResponses.length}, 1fr)` }}>
              {broadcastResponses.map((response) => {
                const agent = agents.find((a) => a.id === response.agentId)
                return (
                  <div
                    key={response.id}
                    className="border border-c-border rounded p-2 min-h-[100px]"
                  >
                    <div className="flex items-center gap-1 mb-1">
                      <span
                        className={`text-[10px] font-medium ${PROVIDER_COLORS[response.provider]}`}
                      >
                        {agent?.name || response.agentId}
                      </span>
                      {response.status === 'streaming' && (
                        <Loader2 className="w-2.5 h-2.5 text-mothership-400 animate-spin" />
                      )}
                    </div>
                    <div className="text-[10px] text-c-primary whitespace-pre-wrap">
                      {response.content || (
                        <span className="text-c-secondary italic">Pending</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Chain View: sequential agent tasks
function ChainView({
  chains,
  activeChainId,
  agents,
  onCreateChain,
  onSetActiveChain,
}: {
  chains: ReturnType<typeof useWarRoomStore.getState>['taskChains']
  activeChainId: string | null
  agents: ReturnType<typeof useAgentStore.getState>['agents']
  onCreateChain: (name: string, steps: { agentId: string; provider: AgentProvider; prompt: string }[]) => string
  onSetActiveChain: (id: string | null) => void
}) {
  const { executeChain } = useWarRoomStore()
  const setActiveTab = useMemoryStore((s) => s.setActiveTab)
  const [showCreate, setShowCreate] = useState(false)
  const [chainName, setChainName] = useState('')
  const [steps, setSteps] = useState<{ agentId: string; prompt: string }[]>([
    { agentId: '', prompt: '' },
  ])

  const handleCreate = () => {
    if (!chainName.trim() || steps.every((s) => !s.agentId || !s.prompt)) return

    const chainSteps = steps
      .filter((s) => s.agentId && s.prompt)
      .map((s) => ({
        agentId: s.agentId,
        provider: agents.find((a) => a.id === s.agentId)?.provider || 'claude',
        prompt: s.prompt,
      }))

    onCreateChain(chainName, chainSteps)
    setShowCreate(false)
    setChainName('')
    setSteps([{ agentId: '', prompt: '' }])
  }

  const addStep = () => setSteps([...steps, { agentId: '', prompt: '' }])
  const removeStep = (index: number) => setSteps(steps.filter((_, i) => i !== index))
  const updateStep = (index: number, field: 'agentId' | 'prompt', value: string) => {
    const newSteps = [...steps]
    newSteps[index] = { ...newSteps[index], [field]: value }
    setSteps(newSteps)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chain List */}
      <div className="p-2 border-b border-c-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-c-secondary">Task Chains</span>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-c-secondary hover:text-c-primary rounded hover:bg-surface-hover transition-colors"
          >
            <Plus className="w-3 h-3" />
            New Chain
          </button>
        </div>

        {chains.length === 0 && (
          <div className="text-[10px] text-c-secondary py-2">
            No task chains yet
          </div>
        )}

        {chains.map((chain) => (
          <div
            key={chain.id}
            onClick={() => onSetActiveChain(chain.id)}
            className={`flex items-center gap-2 px-2 py-1 text-[10px] rounded cursor-pointer transition-colors ${
              activeChainId === chain.id
                ? 'bg-mothership-500/20 text-mothership-400'
                : 'text-c-secondary hover:bg-surface-hover'
            }`}
          >
            {chain.status === 'completed' && (
              <CheckCircle2 className="w-3 h-3 text-green-400" />
            )}
            {chain.status === 'in_progress' && (
              <Loader2 className="w-3 h-3 text-mothership-400 animate-spin" />
            )}
            {chain.status === 'pending' && (
              <ChevronRight className="w-3 h-3" />
            )}
            {chain.status === 'error' && (
              <AlertCircle className="w-3 h-3 text-red-400" />
            )}
            <span className="flex-1 truncate">{chain.name}</span>
            <span className="text-c-muted">{chain.steps.length} steps</span>
          </div>
        ))}
      </div>

      {/* Create Chain Form */}
      {showCreate && (
        <div className="p-2 border-b border-c-border bg-surface-subtle">
          <input
            value={chainName}
            onChange={(e) => setChainName(e.target.value)}
            placeholder="Chain name"
            className="w-full bg-transparent text-xs text-c-primary placeholder-c-secondary border border-c-border rounded px-2 py-1 mb-2 focus:outline-none focus:border-mothership-500"
          />
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {steps.map((step, index) => (
              <div key={index} className="flex gap-2">
                <select
                  value={step.agentId}
                  onChange={(e) => updateStep(index, 'agentId', e.target.value)}
                  className="w-24 bg-transparent text-[10px] text-c-secondary border border-c-border rounded px-1 py-0.5 focus:outline-none"
                >
                  <option value="">Agent</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <input
                  value={step.prompt}
                  onChange={(e) => updateStep(index, 'prompt', e.target.value)}
                  placeholder="Task prompt"
                  className="flex-1 bg-transparent text-[10px] text-c-primary placeholder-c-secondary border border-c-border rounded px-2 py-0.5 focus:outline-none"
                />
                {steps.length > 1 && (
                  <button
                    onClick={() => removeStep(index)}
                    className="text-c-secondary hover:text-red-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={addStep}
              className="px-2 py-1 text-[10px] text-c-secondary hover:text-c-primary rounded hover:bg-surface-hover transition-colors"
            >
              + Add Step
            </button>
            <button
              onClick={handleCreate}
              className="px-3 py-1 bg-mothership-500 text-white text-[10px] rounded hover:bg-mothership-600 transition-colors"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Active Chain Detail */}
      <div className="flex-1 overflow-y-auto p-2">
        {(() => {
          const chain = chains.find((c) => c.id === activeChainId)
          if (!chain) {
            return (
              <div className="text-center text-c-secondary text-[10px] py-8">
                Select a chain to view details
              </div>
            )
          }

          return (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-medium text-c-primary">
                  {chain.name}
                </span>
                {chain.status === 'pending' && (
                  <button
                    onClick={() => executeChain(chain.id)}
                    className="px-2 py-0.5 bg-mothership-500 text-white text-[10px] rounded hover:bg-mothership-600 transition-colors"
                  >
                    Run Chain
                  </button>
                )}
                {chain.status === 'in_progress' && (
                  <button
                    onClick={() => setActiveTab('execution')}
                    className="flex items-center gap-1 px-2 py-0.5 bg-green-600/70 text-white text-[10px] rounded hover:bg-green-600 transition-colors"
                  >
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    View Progress
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {chain.steps.map((step, index) => {
                  const agent = agents.find((a) => a.id === step.agentId)
                  return (
                    <div key={step.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium border ${
                            step.status === 'completed'
                              ? 'border-green-400 text-green-400'
                              : step.status === 'running'
                              ? 'border-mothership-400 text-mothership-400'
                              : step.status === 'error'
                              ? 'border-red-400 text-red-400'
                              : 'border-c-border text-c-secondary'
                          }`}
                        >
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-medium text-c-primary">
                              {agent?.name || step.agentId}
                            </span>
                            {step.status === 'running' && (
                              <Loader2 className="w-2.5 h-2.5 text-mothership-400 animate-spin" />
                            )}
                          </div>
                          <div className="text-[10px] text-c-secondary">
                            {step.prompt}
                          </div>
                        </div>
                      </div>
                      {step.output && (
                        <div className="ml-8 mt-1 p-2 bg-surface-subtle rounded text-[10px] text-c-primary whitespace-pre-wrap max-h-24 overflow-y-auto">
                          {step.output}
                        </div>
                      )}
                      {step.error && (
                        <div className="ml-8 mt-1 p-2 bg-red-500/10 rounded text-[10px] text-red-400">
                          {step.error}
                        </div>
                      )}
                      {index < chain.steps.length - 1 && (
                        <div className="ml-3 w-px h-2 bg-c-border" />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
