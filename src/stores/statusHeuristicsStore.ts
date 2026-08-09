import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { useAgentStore, type AgentStatus } from './agentStore'

// ── Status detection heuristics ───────────────────────────────────────

const WORKING_KEYWORDS = [
  'generating', 'analyzing', 'processing', 'thinking', 'compiling',
  'building', 'writing', 'searching', 'fetching', 'downloading',
  'installing', 'running', 'executing', 'testing', 'checking',
]

const BLOCKED_KEYWORDS = [
  'waiting', 'pending', 'blocked', 'stuck', 'hang on',
  'please wait', 'in progress...', 'rate limit', 'timeout',
]

const DONE_KEYWORDS = [
  'done', 'complete', 'finished', 'success', 'completed',
  '✅ done', '✅ complete', '✓ done', 'summary:',
  'here\'s what i did', 'i have completed',
]

const ERROR_KEYWORDS = [
  'error:', 'failed:', 'exception:', 'unexpected error',
  'something went wrong', 'unable to', 'could not',
  'permission denied', 'command not found', 'not found',
  'syntax error', 'compile error', 'test failed',
  'non-zero exit', 'crashed', 'panic:', 'fatal:',
]

function matchesAny(text: string, patterns: string[]): boolean {
  const lower = text.toLowerCase()
  return patterns.some((p) => lower.includes(p))
}

/** Detect heuristic status from a line of terminal output */
export function detectStatusFromOutput(line: string): AgentStatus | null {
  if (matchesAny(line, ERROR_KEYWORDS)) return 'error'
  if (matchesAny(line, DONE_KEYWORDS)) return 'idle'
  if (matchesAny(line, BLOCKED_KEYWORDS)) return 'running'
  if (matchesAny(line, WORKING_KEYWORDS)) return 'running'
  return null
}

// ── Per-agent output buffers ──────────────────────────────────────────

interface AgentOutputBuffer {
  agentId: string
  recentOutput: string[]
  lastStatus: AgentStatus | null
  lastActivity: number
}

// ── Store ─────────────────────────────────────────────────────────────

interface StatusHeuristicsState {
  buffers: Record<string, AgentOutputBuffer>
  isEnabled: boolean
  idleTimeoutSeconds: number

  // Actions
  feedOutput: (agentId: string, line: string) => void
  setEnabled: (enabled: boolean) => void
  setIdleTimeout: (seconds: number) => void
  getAgentStatus: (agentId: string) => AgentStatus | null
  clearBuffer: (agentId: string) => void
  runPollCheck: () => void
}

const MAX_BUFFER_LINES = 30

// ── Rate-limited IPC dispatch ─────────────────────────────────────────
// Throttles invoke calls to at most once per 500ms per agent.
// During fast terminal output (e.g. `npm install`), this prevents flooding Tauri's IPC.

const RATE_LIMIT_MS = 500
const invokeQueue = new Map<string, { timer: ReturnType<typeof setTimeout>; lastLine: string }>()

/** @internal Reset the rate-limiter queue and poll interval (for testing) */
export function __resetRateLimiter() {
  for (const [, entry] of invokeQueue) {
    clearTimeout(entry.timer)
  }
  invokeQueue.clear()
  stopStatusPolling()
}

function sendToRustBackend(agentId: string, line: string) {
  const existing = invokeQueue.get(agentId)
  if (existing) {
    // Update the last line and reset the timer
    clearTimeout(existing.timer)
    existing.timer = setTimeout(() => {
      invoke('feed_terminal_status', { agentId, line: existing.lastLine }).catch(() => {})
      invokeQueue.delete(agentId)
    }, RATE_LIMIT_MS)
    existing.lastLine = line
  } else {
    // Fire immediately for the first call, then throttle subsequent ones
    invoke('feed_terminal_status', { agentId, line }).catch(() => {})
    const timer = setTimeout(() => {
      invokeQueue.delete(agentId)
    }, RATE_LIMIT_MS)
    invokeQueue.set(agentId, { timer, lastLine: line })
  }
}

export const useStatusHeuristicsStore = create<StatusHeuristicsState>()(
  (set, get) => ({
    buffers: {},
    isEnabled: true,
    idleTimeoutSeconds: 30,

    feedOutput: (agentId, line) => {
      if (!get().isEnabled) return

      const buffer = get().buffers[agentId] || {
        agentId,
        recentOutput: [],
        lastStatus: null,
        lastActivity: Date.now(),
      }

      buffer.recentOutput.push(line)
      if (buffer.recentOutput.length > MAX_BUFFER_LINES) {
        buffer.recentOutput.shift()
      }
      buffer.lastActivity = Date.now()

      // Detect status from this line
      const detected = detectStatusFromOutput(line)
      if (detected) {
        buffer.lastStatus = detected
        // Update the agent store status
        useAgentStore.getState().updateAgentStatus(agentId, detected)
      } else if (buffer.recentOutput.length > 0) {
        // If we've received output recently, agent is running
        buffer.lastStatus = 'running'
        useAgentStore.getState().updateAgentStatus(agentId, 'running')
      }

      set((state) => ({
        buffers: { ...state.buffers, [agentId]: buffer },
      }))

      // Rate-limited send to Rust backend for server-side analysis
      // Throttled to at most once per 500ms per agent to avoid IPC flood
      sendToRustBackend(agentId, line)
    },

    setEnabled: (enabled) => set({ isEnabled: enabled }),

    setIdleTimeout: (seconds) => set({ idleTimeoutSeconds: seconds }),

    getAgentStatus: (agentId) => {
      const buffer = get().buffers[agentId]
      return buffer?.lastStatus || null
    },

    clearBuffer: (agentId) => {
      set((state) => {
        const { [agentId]: _, ...rest } = state.buffers
        return { buffers: rest }
      })
    },

    runPollCheck: () => {
      const { buffers, idleTimeoutSeconds } = get()
      const now = Date.now()

      for (const [agentId, buffer] of Object.entries(buffers)) {
        if (buffer.lastStatus === 'running') {
          const idle = (now - buffer.lastActivity) / 1000
          if (idle > idleTimeoutSeconds) {
            // Mark as idle if no output for timeout period
            useAgentStore.getState().updateAgentStatus(agentId, 'idle')
            set((state) => ({
              buffers: {
                ...state.buffers,
                [agentId]: { ...buffer, lastStatus: 'idle' },
              },
            }))
          }
        }
      }
    },
  })
)

// ── Polling interval for idle detection ──────────────────────────────

let pollInterval: ReturnType<typeof setInterval> | null = null

export function startStatusPolling(intervalMs = 5000) {
  if (pollInterval) return
  pollInterval = setInterval(() => {
    useStatusHeuristicsStore.getState().runPollCheck()
  }, intervalMs)
}

export function stopStatusPolling() {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}
