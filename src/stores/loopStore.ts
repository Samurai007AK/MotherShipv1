import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

// --- Domain types (mirrored in the Rust backend) ---

export interface Task {
  id: string
  title: string
  description: string
  acceptanceCriteria: string[]
  priority: number
  passes: boolean
  notes: string
  iterationCompleted?: number
  filesModified?: string[]
}

export interface IterationRecord {
  iteration: number
  taskId: string
  action: string
  result: string
  durationMs: number
  timestamp: Date
  success: boolean
  filesModified: string[]
  toolsUsed: string[]
  learnings: string[]
  gateReportId?: string
}

export interface LoopMetrics {
  totalIterations: number
  totalTimeMs: number
  avgIterationMs: number
  successRate: number
  tasksCompleted: number
  tasksTotal: number
  errorsEncountered: number
  recoveriesAttempted: number
  recoveriesSuccessful: number
}

export type LoopStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

// --- Checkpoint types (Session Time-Travel) ---

export interface EffectEntry {
  id: string
  tool: string
  input: string
  output: string
  timestamp: string
  input_hash: string
  success: boolean
}

export interface LoopCheckpoint {
  id: string
  loop_id: string
  label: string
  timestamp: string
  iteration: number
  branch: string
  parent_id: string | null
  note: string | null
  // Full state + effect log can be loaded separately
}

// --- Code Review types (OpenCodeReview integration) ---

export interface CodeReviewIssue {
  file: string
  line: number
  column: number
  severity: string
  message: string
  rule: string | null
  suggestion: string | null
  isBlocking: boolean
}

export interface CodeReviewResult {
  passed: boolean
  issues: CodeReviewIssue[]
  suggestions: CodeReviewIssue[]
  score: number | null
  filesReviewed: number
  summary: string
  details: string
  ocrAvailable: boolean
}

// --- Store ---

interface LoopState {
  // Status
  status: LoopStatus
  loopId: string | null

  // Tasks
  tasks: Task[]
  currentTask: Task | null
  currentAction: string

  // Iterations
  currentIteration: number
  maxIterations: number
  iterations: IterationRecord[]

  // Progress
  progress: number
  startTime: Date | null

  // Errors
  errorsEncountered: number
  consecutiveErrors: number

  // Checkpoints (Session Time-Travel)
  checkpoints: LoopCheckpoint[]
  currentEffectLog: EffectEntry[]

  // Actions
  startLoop: (config: LoopConfig) => Promise<void>
  pauseLoop: () => Promise<void>
  resumeLoop: () => Promise<void>
  cancelLoop: () => Promise<void>
  retryFromIteration: (iteration: number) => Promise<void>
  loadPrdJson: (projectPath: string) => Promise<void>
  updateTask: (taskId: string, updates: Partial<Task>) => void
  reset: () => void

  // Session Time-Travel actions
  saveCheckpoint: (label: string, note?: string) => Promise<void>
  listCheckpoints: () => Promise<void>
  restoreCheckpoint: (checkpointId: string) => Promise<void>
  forkFromCheckpoint: (checkpointId: string, branchLabel: string) => Promise<void>
  loadEffectLog: () => Promise<void>

  // Code Review actions
  lastCodeReview: CodeReviewResult | null
  runCodeReview: (projectPath: string) => Promise<void>
}

export interface LoopConfig {
  agentId: string
  projectPath: string
  maxIterations: number
  timeoutMs: number
  qualityGateCommands: { typecheck?: string; test?: string; lint?: string }
  autoCommit: boolean
  syncToAgentsMd: boolean
  autoArchive: boolean
}

export const useLoopStore = create<LoopState>()((set, get) => ({
  status: 'idle',
  loopId: null,
  tasks: [],
  currentTask: null,
  currentAction: '',
  currentIteration: 0,
  maxIterations: 20,
  iterations: [],
  progress: 0,
  startTime: null,
  errorsEncountered: 0,
  consecutiveErrors: 0,
  checkpoints: [],
  currentEffectLog: [],
  lastCodeReview: null,

  startLoop: async (config) => {
    set({
      status: 'running',
      currentIteration: 0,
      iterations: [],
      progress: 0,
      startTime: new Date(),
      errorsEncountered: 0,
      consecutiveErrors: 0,
      maxIterations: config.maxIterations,
    })
    try {
      await invoke('start_loop', {
        loopId: `loop-${Date.now()}`,
        config,
      })
    } catch (e) {
      set({ status: 'failed' })
      console.error('Failed to start loop:', e)
    }
  },

  pauseLoop: async () => {
    const { loopId } = get()
    if (!loopId) return
    set({ status: 'paused' })
    try {
      await invoke('pause_loop', { loopId })
    } catch (e) {
      console.error('Failed to pause loop:', e)
    }
  },

  resumeLoop: async () => {
    const { loopId } = get()
    if (!loopId) return
    set({ status: 'running' })
    try {
      await invoke('resume_loop', { loopId })
    } catch (e) {
      console.error('Failed to resume loop:', e)
    }
  },

  cancelLoop: async () => {
    const { loopId } = get()
    if (!loopId) return
    set({ status: 'cancelled' })
    try {
      await invoke('cancel_loop', { loopId })
    } catch (e) {
      console.error('Failed to cancel loop:', e)
    }
  },

  retryFromIteration: async (iteration) => {
    const { loopId } = get()
    if (!loopId) return
    set({ status: 'running', currentIteration: iteration })
    try {
      await invoke('retry_loop', { loopId, fromIteration: iteration })
    } catch (e) {
      console.error('Failed to retry loop:', e)
    }
  },

  loadPrdJson: async (projectPath) => {
    try {
      const content = await invoke<string>('read_file', { path: `${projectPath}/prd.json` })
      const prd = JSON.parse(content)
      const tasks: Task[] = (prd.userStories || []).map((s: Record<string, unknown>) => ({
        id: s.id as string,
        title: s.title as string,
        description: s.description as string,
        acceptanceCriteria: (s.acceptanceCriteria as string[]) || [],
        priority: s.priority as number,
        passes: s.passes as boolean,
        notes: (s.notes as string) || '',
      }))
      set({ tasks })
    } catch (e) {
      console.error('Failed to load prd.json:', e)
    }
  },

  updateTask: (taskId, updates) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)),
    }))
  },

  // ── Session Time-Travel actions ───────────────────────────────────

  saveCheckpoint: async (label, note) => {
    try {
      await invoke('save_loop_checkpoint', { label, note: note || null })
      // Refresh the checkpoint list
      await get().listCheckpoints()
    } catch (e) {
      console.error('Failed to save checkpoint:', e)
    }
  },

  listCheckpoints: async () => {
    try {
      const checkpoints = await invoke<LoopCheckpoint[]>('list_loop_checkpoints')
      set({ checkpoints })
    } catch (e) {
      console.error('Failed to list checkpoints:', e)
    }
  },

  restoreCheckpoint: async (checkpointId) => {
    try {
      await invoke('restore_loop_checkpoint', { checkpointId })
      set({ status: 'running' })
      // Reload effect log after restore
      await get().loadEffectLog()
    } catch (e) {
      console.error('Failed to restore checkpoint:', e)
    }
  },

  forkFromCheckpoint: async (checkpointId, branchLabel) => {
    try {
      await invoke('fork_loop_checkpoint', { checkpointId, branchLabel })
      // Refresh checkpoints to show the new fork
      await get().listCheckpoints()
    } catch (e) {
      console.error('Failed to fork from checkpoint:', e)
    }
  },

  loadEffectLog: async () => {
    try {
      const log = await invoke<{ entries: EffectEntry[] }>('get_loop_effect_log')
      set({ currentEffectLog: log.entries || [] })
    } catch (e) {
      console.error('Failed to load effect log:', e)
    }
  },

  runCodeReview: async (projectPath) => {
    try {
      const result = await invoke<CodeReviewResult | null>('run_code_review', { projectPath })
      set({ lastCodeReview: result })
    } catch (e) {
      console.error('Failed to run code review:', e)
    }
  },

  reset: () => {
    set({
      status: 'idle',
      loopId: null,
      tasks: [],
      currentTask: null,
      currentAction: '',
      currentIteration: 0,
      iterations: [],
      progress: 0,
      startTime: null,
      errorsEncountered: 0,
      consecutiveErrors: 0,
      checkpoints: [],
      currentEffectLog: [],
    })
  },
}))
