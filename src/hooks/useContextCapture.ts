import { useEffect, useRef, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { useAgentStore } from '../stores/agentStore'

// --- Types ---

export type CaptureTrigger =
  | 'terminal_output'
  | 'agent_switch'
  | 'heartbeat'
  | 'git_activity'
  | 'file_saved'

export interface ContextSnapshot {
  id: string
  timestamp: string
  trigger: CaptureTrigger
  agentId: string
  outputTail: string
  branch: string | null
  openFiles: string[]
  decisions: string[]
  memorySize: number
}

interface CaptureConfig {
  outputThreshold: number    // chars since last capture to trigger (default: 1000)
  heartbeatInterval: number  // ms between heartbeats (default: 60000)
  dedupWindow: number        // ms to merge rapid snapshots (default: 5000)
  maxOutputTail: number      // max lines to keep in snapshot (default: 50)
}

const DEFAULT_CONFIG: CaptureConfig = {
  outputThreshold: 1000,
  heartbeatInterval: 60000,
  dedupWindow: 5000,
  maxOutputTail: 50,
}

// --- Git activity detection ---

const GIT_PATTERNS = /\b(git\s+(commit|push|pull|merge|branch|checkout|stash|rebase|status|diff|log))\b/

function detectGitActivity(data: string): boolean {
  return GIT_PATTERNS.test(data)
}

// --- Decision extraction ---

const DECISION_PATTERNS = [
  /\b(decided?|choosing?|selected?|going with|using|settled on)\b[:\s]+(.{10,80})/gi,
  /\b(TODO|FIXME|HACK|NOTE|IMPORTANT)\b[:\s]+(.{10,80})/gi,
]

function extractDecisions(data: string): string[] {
  const decisions: string[] = []
  for (const pattern of DECISION_PATTERNS) {
    let match
    while ((match = pattern.exec(data)) !== null) {
      decisions.push(match[0].trim())
    }
  }
  return decisions.slice(0, 5)
}

// --- Singleton state (persists across re-renders) ---

const captureState = {
  outputSinceLastCapture: 0,
  lastCaptureTime: Date.now(),
  lastOutputBuffer: '',
  pendingDecisions: [] as string[],
  pendingFiles: [] as string[],
  heartbeatTimer: null as ReturnType<typeof setInterval> | null,
  initialized: false,
}

// --- Hook ---

interface UseContextCaptureOptions {
  config?: Partial<CaptureConfig>
}

/**
 * Global context capture hook. Call once in App root.
 * Listens to all terminal output events and captures context snapshots.
 */
export function useContextCapture({ config: userConfig }: UseContextCaptureOptions = {}) {
  const config = { ...DEFAULT_CONFIG, ...userConfig }
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const prevAgentIdRef = useRef<string | null>(null)

  // Capture a context snapshot
  const capture = useCallback(
    async (trigger: CaptureTrigger, agentId: string, extra?: { output?: string; branch?: string }) => {
      const now = Date.now()

      // Dedup: skip if within dedup window and same trigger
      if (now - captureState.lastCaptureTime < config.dedupWindow && trigger !== 'heartbeat') {
        return
      }

      if (!agentId) return

      // Build snapshot
      const outputTail = extra?.output
        ? extra.output.split('\n').slice(-config.maxOutputTail).join('\n')
        : captureState.lastOutputBuffer.split('\n').slice(-config.maxOutputTail).join('\n')

      const snapshot = {
        trigger,
        agentId,
        outputTail,
        branch: extra?.branch || null,
        openFiles: [...captureState.pendingFiles],
        decisions: [...captureState.pendingDecisions],
        memorySize: outputTail.length,
      }

      try {
        await invoke('save_context_snapshot', { snapshot })
      } catch (e) {
        console.warn('Failed to save context snapshot:', e)
      }

      // Reset counters
      captureState.outputSinceLastCapture = 0
      captureState.lastCaptureTime = now
      captureState.pendingDecisions = []
      captureState.pendingFiles = []
      captureState.lastOutputBuffer = ''
    },
    [config]
  )

  // Listen for ALL terminal output events (workspace-level)
  useEffect(() => {
    let unlisten: UnlistenFn | null = null
    let cancelled = false

    const setup = async () => {
      try {
        unlisten = await listen<{ sessionId: string; data: string }>(
          'terminal-output',
          (event) => {
            const data = event.payload.data
            captureState.outputSinceLastCapture += data.length
            captureState.lastOutputBuffer += data

            // Keep buffer manageable
            if (captureState.lastOutputBuffer.length > 50000) {
              captureState.lastOutputBuffer = captureState.lastOutputBuffer.slice(-30000)
            }

            // Use active agent for capture
            const currentAgent = useAgentStore.getState().activeAgentId
            if (!currentAgent) return

            // Check git activity
            if (detectGitActivity(data)) {
              capture('git_activity', currentAgent, { output: data })
              return
            }

            // Check output threshold
            if (captureState.outputSinceLastCapture >= config.outputThreshold) {
              capture('terminal_output', currentAgent, { output: data })
            }

            // Extract decisions incrementally
            const decisions = extractDecisions(data)
            if (decisions.length > 0) {
              captureState.pendingDecisions.push(...decisions)
            }
          }
        )
        if (cancelled) { unlisten(); return }
      } catch (e) {
        console.error('Failed to set up context capture listener:', e)
      }
    }

    setup()

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [capture, config.outputThreshold])

  // Heartbeat timer
  useEffect(() => {
    if (captureState.heartbeatTimer) {
      clearInterval(captureState.heartbeatTimer)
    }

    captureState.heartbeatTimer = setInterval(() => {
      const currentAgent = useAgentStore.getState().activeAgentId
      if (currentAgent) {
        capture('heartbeat', currentAgent)
      }
    }, config.heartbeatInterval)

    return () => {
      if (captureState.heartbeatTimer) {
        clearInterval(captureState.heartbeatTimer)
      }
    }
  }, [capture, config.heartbeatInterval])

  // Track agent switches
  useEffect(() => {
    if (activeAgentId && prevAgentIdRef.current && activeAgentId !== prevAgentIdRef.current) {
      // Agent switched — capture context from previous agent
      capture('agent_switch', prevAgentIdRef.current)
    }
    prevAgentIdRef.current = activeAgentId
  }, [activeAgentId, capture])

  return { capture }
}
