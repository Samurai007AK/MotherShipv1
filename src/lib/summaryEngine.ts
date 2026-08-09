/**
 * Crew — Summary Engine Client
 *
 * Communicates with the summary-engine Python sidecar via Tauri commands.
 * Falls back to template-based summaries when Ollama is unavailable.
 */

import { invoke } from '@tauri-apps/api/core'

// --- Types ---

export interface SummaryResult {
  summary: string
  key_decisions: string[]
  open_todos: string[]
  files_touched: string[]
  current_state: string
  model_used: string
}

export interface ContextSnapshot {
  trigger: string
  agent_id: string
  output_tail: string
  branch?: string
  open_files?: string[]
  decisions?: string[]
  memory_size?: number
}

// --- Client ---

/**
 * Generate a summary from context snapshots.
 * Tries Ollama first, falls back to template-based summary.
 */
export async function generateSummary(
  snapshots: ContextSnapshot[],
  handoffTarget: string = 'next agent',
  style: 'brief' | 'detailed' | 'bullet' = 'brief'
): Promise<SummaryResult> {
  try {
    const result = await invoke<SummaryResult>('summarize_context', {
      snapshots,
      handoffTarget,
      style,
    })
    return result
  } catch (e) {
    console.warn('Summary engine unavailable, using fallback:', e)
    return templateSummary(snapshots)
  }
}

/**
 * Check if the summary engine sidecar is healthy.
 */
export async function checkSummaryHealth(): Promise<{
  status: string
  ollama_available: boolean
  models: string[]
}> {
  try {
    return await invoke('check_summary_health')
  } catch {
    return { status: 'unavailable', ollama_available: false, models: [] }
  }
}

/**
 * Template-based summary fallback (no LLM needed).
 */
function templateSummary(snapshots: ContextSnapshot[]): SummaryResult {
  const allFiles = new Set<string>()
  const allBranches = new Set<string>()
  const allDecisions: string[] = []

  for (const snap of snapshots) {
    snap.open_files?.forEach((f) => allFiles.add(f))
    if (snap.branch) allBranches.add(snap.branch)
    snap.decisions?.forEach((d) => allDecisions.push(d))
  }

  const summaryParts: string[] = []
  if (allBranches.size > 0) {
    summaryParts.push(`Branches: ${[...allBranches].join(', ')}`)
  }
  if (allFiles.size > 0) {
    summaryParts.push(`Files touched: ${[...allFiles].slice(0, 10).join(', ')}`)
  }

  const summary = summaryParts.length > 0
    ? summaryParts.join('; ')
    : 'No context data captured'

  return {
    summary,
    key_decisions: allDecisions.slice(0, 5),
    open_todos: [],
    files_touched: [...allFiles].slice(0, 10),
    current_state: `Session with ${snapshots.length} snapshots`,
    model_used: 'template',
  }
}
