import { useState, memo, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAgentStore, getProviderColor, type Agent } from '../../stores/agentStore'
import { useMemoryStore, type HandoffPack, type MemoryNote } from '../../stores/memoryStore'
import { ArrowRight, CheckCircle, Loader2, X, Send, Sparkles } from 'lucide-react'

// --- HandoffDialog ---
// Modal for compiling and sending context from one agent to another.

interface HandoffDialogProps {
  isOpen: boolean
  sourceAgentId: string
  onClose: () => void
  onHandoffComplete?: (handoff: HandoffPack) => void
}

// --- CrewAI Handoff Runner ---

interface CrewaiHandoffResult {
  source_agent_id: string
  target_agent_id: string
  entry_count: number
  summary: string
  key_decisions: string[]
  open_todos: string[]
  files_touched: string[]
  current_state: string
  enriched: boolean
  model_used: string
}

async function runCrewaiHandoff(
  sourceAgentId: string,
  targetAgentId: string,
  entries: MemoryNote[]
): Promise<CrewaiHandoffResult | null> {
  try {
    const result = await invoke<CrewaiHandoffResult>('crewai_handoff', {
      request: {
        source_agent_id: sourceAgentId,
        target_agent_id: targetAgentId,
        entries: entries.slice(0, 20).map((e) => ({
          id: e.id,
          content: e.content,
          agent_id: e.agentId || null,
          entry_type: e.entryType,
          tags: e.tags,
          files_referenced: e.filesReferenced,
          created_at: e.createdAt,
        })),
      },
    })
    return result
  } catch (e) {
    console.error('CrewAI handoff failed:', e)
    return null
  }
}

export const HandoffDialog = memo(function HandoffDialog({
  isOpen,
  sourceAgentId,
  onClose,
  onHandoffComplete,
}: HandoffDialogProps) {
  const agents = useAgentStore((s) => s.agents)
  const notes = useMemoryStore((s) => s.notes)
  const compileHandoff = useMemoryStore((s) => s.compileHandoff)
  const addNote = useMemoryStore((s) => s.addNote)
  const [targetAgentId, setTargetAgentId] = useState<string | null>(null)
  const [isCompiling, setIsCompiling] = useState(false)
  const [result, setResult] = useState<HandoffPack | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [useCrewAI, setUseCrewAI] = useState(false)

  if (!isOpen) return null

  const sourceAgent = agents.find((a) => a.id === sourceAgentId)
  const targetAgent = targetAgentId ? agents.find((a) => a.id === targetAgentId) : null
  const availableTargets = agents.filter((a) => a.id !== sourceAgentId)

  const handleCompile = async () => {
    if (!targetAgentId) return
    setIsCompiling(true)
    setError(null)
    try {
      if (useCrewAI) {
        // Use CrewAI Flow for orchestrated handoff
        const result = await runCrewaiHandoff(sourceAgentId, targetAgentId, notes)
        if (result) {
          // Create a handoff pack from the CrewAI result
          const handoffPack: HandoffPack = {
            id: `handoff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            sourceAgentId: result.source_agent_id,
            targetAgentId: result.target_agent_id,
            entries: notes.slice(0, 20),
            summary: result.summary,
            createdAt: new Date().toISOString(),
          }
          setResult(handoffPack)
          onHandoffComplete?.(handoffPack)

          // Record key decisions and TODOs as notes
          for (const decision of result.key_decisions) {
            addNote(`[Decision] ${decision}`, sourceAgentId, ['handoff', 'decision'])
          }
          for (const todo of result.open_todos) {
            addNote(`[TODO] ${todo}`, targetAgentId, ['handoff', 'todo'])
          }
        } else {
          setError('CrewAI handoff failed — try manual mode')
        }
      } else {
        // Standard manual handoff
        const handoff = await compileHandoff(sourceAgentId, targetAgentId)
        if (handoff) {
          setResult(handoff)
          onHandoffComplete?.(handoff)
        } else {
          setError('Failed to compile handoff context')
        }
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setIsCompiling(false)
    }
  }

  const handleClose = () => {
    setTargetAgentId(null)
    setResult(null)
    setError(null)
    setUseCrewAI(false)
    onClose()
  }

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-c-bg/80 backdrop-blur-sm" onClick={handleClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-md bg-c-card border border-c-border-strong/50 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-c-border">
          <div className="flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-mothership-400" />
            <h2 className="text-sm font-medium text-c-text">Context Handoff</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-c-surface text-c-muted hover:text-c-text transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {result ? (
            // Success state
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-400" />
              </div>
              <h3 className="text-sm font-medium text-c-text">Handoff Complete</h3>
              <p className="text-xs text-c-muted text-center leading-relaxed max-w-xs">
                {result.entries.length} context entries compiled from{' '}
                <strong>{sourceAgent?.name}</strong> → <strong>{targetAgent?.name}</strong>
              </p>

              {/* Summary preview */}
              <div className="w-full mt-2 p-3 bg-c-surface rounded-lg border border-c-border">
                <p className="text-[10px] font-medium text-c-muted mb-1">Summary</p>
                <p className="text-[11px] text-c-text-dim leading-relaxed whitespace-pre-line">
                  {result.summary.length > 300
                    ? `${result.summary.slice(0, 300)}…`
                    : result.summary}
                </p>
              </div>

              <button
                onClick={handleClose}
                className="mt-2 px-4 py-2 text-xs font-medium bg-mothership-600 text-white rounded-lg hover:bg-mothership-500 transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            // Selection state
            <>
              {/* Source agent */}
              <div className="mb-4">
                <p className="text-[10px] font-medium text-c-muted mb-2">From</p>
                {sourceAgent && <AgentBadge agent={sourceAgent} />}
              </div>

              {/* Arrow */}
              <div className="flex justify-center mb-4">
                <ArrowRight className="w-5 h-5 text-c-muted-light rotate-90" />
              </div>

              {/* Target agent selection */}
              <div className="mb-4">
                <p className="text-[10px] font-medium text-c-muted mb-2">To</p>
                <div className="grid grid-cols-2 gap-2">
                  {availableTargets.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => setTargetAgentId(agent.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-left ${
                        targetAgentId === agent.id
                          ? 'border-mothership-500 bg-mothership-600/10'
                          : 'border-c-border hover:border-c-border-strong hover:bg-c-surface/50'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${getProviderColor(agent.provider)}`}
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-c-text-dim truncate">
                          {agent.name}
                        </div>
                        <div className="text-[9px] text-c-muted-light truncate">
                          {agent.status}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded text-[11px] text-red-400">
                  {error}
                </div>
              )}

              {/* CrewAI toggle */}
              <div className="mb-3 flex items-center gap-2">
                <button
                  onClick={() => setUseCrewAI(!useCrewAI)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] transition-all ${
                    useCrewAI
                      ? 'border-mothership-500 bg-mothership-600/10 text-mothership-400'
                      : 'border-c-border text-c-muted hover:border-c-border-strong'
                  }`}
                >
                  <Sparkles className={`w-3 h-3 ${useCrewAI ? 'text-mothership-400' : 'text-c-muted-light'}`} />
                  {useCrewAI ? 'CrewAI Orchestration' : 'Manual Handoff'}
                </button>
                <span className="text-[9px] text-c-muted-light">
                  {useCrewAI
                    ? 'AI-powered context analysis & routing'
                    : 'Basic context compilation'}
                </span>
              </div>

              {/* Action */}
              <button
                onClick={handleCompile}
                disabled={!targetAgentId || isCompiling}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium rounded-lg transition-colors ${
                  useCrewAI
                    ? 'bg-gradient-to-r from-mothership-600 to-purple-600 text-white hover:from-mothership-500 hover:to-purple-500 disabled:opacity-40'
                    : 'bg-mothership-600 text-white hover:bg-mothership-500 disabled:opacity-40'
                }`}
              >
                {isCompiling ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {useCrewAI ? 'Running CrewAI Flow…' : 'Compiling context…'}
                  </>
                ) : (
                  <>
                    {useCrewAI ? <Sparkles className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                    {useCrewAI ? 'Orchestrate Handoff' : 'Compile & Send Handoff'}
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
})

// --- Agent Badge ---

function AgentBadge({ agent }: { agent: Agent }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-c-surface border border-c-border">
      <span
        className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${getProviderColor(agent.provider)}`}
      />
      <div>
        <div className="text-xs font-medium text-c-text-dim">{agent.name}</div>
        <div className="text-[9px] text-c-muted-light">{agent.description}</div>
      </div>
    </div>
  )
}
