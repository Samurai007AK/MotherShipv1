import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { getMemoryUsage } from '../lib/performance'

export interface PerformanceSnapshot {
  total_memory_mb: number
  used_memory_mb: number
  available_memory_mb: number
  process_memory_mb: number
  process_memory_fraction: number
  total_swap_mb: number
  used_swap_mb: number
  cpu_count: number
  cpu_usage: number
  over_threshold: boolean
}

export type MemoryPressure = 'ok' | 'warn' | 'critical'

export interface AutoPauseEvent {
  timestamp: number
  pausedSessionIds: string[]
  count: number
}

/** A terminal session with computed active/idle status. */
export interface TerminalSessionInfo {
  id: string
  agentId: string
  status: string
  lastActivityAt?: string
  isActive: boolean
}

interface PerformanceState {
  snapshot: PerformanceSnapshot | null
  isPolling: boolean
  pollIntervalMs: number
  jsHeapMB: number | null

  // Pressure state
  pressure: MemoryPressure
  pressureHistory: MemoryPressure[]

  // Threshold state
  memoryThreshold: number
  activityThresholdMs: number

  // Auto-pause state
  autoPauseEnabled: boolean
  autoPauseEvents: AutoPauseEvent[]
  wasOverThreshold: boolean

  // Terminal session tracking (for active/idle indicators)
  terminalSessions: TerminalSessionInfo[]

  // Actions
  startPolling: (intervalMs?: number) => void
  stopPolling: () => void
  refreshNow: () => Promise<void>
  clearPressureHistory: () => void
  setAutoPauseEnabled: (enabled: boolean) => void
  setMemoryThreshold: (mb: number) => void
  setActivityThresholdMs: (ms: number) => void
}

/** Read a number from localStorage with a fallback default. */
function readInitialNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key)
    if (raw !== null) {
      const val = Number(raw)
      if (!isNaN(val) && val > 0) return val
    }
  } catch {}
  return fallback
}

/** Read a threshold from localStorage and clamp it within [min, max]. */
function readInitialThreshold(key: string, fallback: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, readInitialNumber(key, fallback)))
}

const INITIAL_MEMORY_THRESHOLD = readInitialThreshold('mothership-perf-memory-threshold', 200, 50, 2000)
const INITIAL_ACTIVITY_THRESHOLD = readInitialThreshold('mothership-perf-activity-threshold', 60000, 5000, 600_000)

/** Check if we're running inside a Tauri desktop environment. */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

let pollTimer: ReturnType<typeof setInterval> | null = null

function determinePressure(snapshot: PerformanceSnapshot): MemoryPressure {
  if (snapshot.process_memory_mb >= 300) return 'critical'
  if (snapshot.process_memory_mb >= 150) return 'warn'
  return 'ok'
}

/**
 * Check whether a session has had activity recently (within the configured
 * `activityThresholdMs`). If `lastActivityAt` is missing, we conservatively
 * assume it's idle.
 */
function isRecentlyActive(
  session: { lastActivityAt?: string },
  activityThresholdMs: number
): boolean {
  if (!session.lastActivityAt) return false
  const elapsed = Date.now() - new Date(session.lastActivityAt).getTime()
  return elapsed < activityThresholdMs
}

/**
 * Raw session type returned from the IPC call.
 */
type RawSession = {
  id: string
  agentId: string
  status: string | { Error: string }
  lastActivityAt?: string
}

/**
 * Fetch the list of terminal sessions via IPC and compute active/idle status
 * for each session using the configured activity threshold. Returns both the
 * raw IPC response and the enriched session list.
 */
async function fetchTerminalSessions(): Promise<{
  raw: RawSession[]
  enriched: TerminalSessionInfo[]
}> {
  if (!isTauri()) return { raw: [], enriched: [] }

  try {
    const sessions = await invoke<RawSession[]>('list_terminal_sessions')
    const activityThresholdMs = usePerformanceStore.getState().activityThresholdMs

    const enriched: TerminalSessionInfo[] = sessions.map((s) => ({
      id: s.id,
      agentId: s.agentId,
      status: typeof s.status === 'string' ? s.status : 'Error',
      lastActivityAt: s.lastActivityAt,
      isActive: s.status === 'Running' && isRecentlyActive(s, activityThresholdMs),
    }))

    return { raw: sessions, enriched }
  } catch (e) {
    console.error('Failed to list terminal sessions:', e)
    return { raw: [], enriched: [] }
  }
}

/**
 * Pause idle terminal sessions (no recent activity) via IPC.
 * Takes the raw session list already fetched (no duplicate IPC call).
 * Only call when in Tauri (desktop) mode.
 */
async function autoPauseIdleTerminals(
  sessions: RawSession[]
): Promise<{ pausedSessionIds: string[]; count: number }> {
  if (!isTauri()) return { pausedSessionIds: [], count: 0 }

  try {
    const activityThresholdMs = usePerformanceStore.getState().activityThresholdMs

    // Only pause sessions that are Running AND have been idle past the activity threshold
    const idleSessions = sessions.filter(
      (s) => s.status === 'Running' && !isRecentlyActive(s, activityThresholdMs)
    )

    const pausedSessionIds: string[] = []
    await Promise.allSettled(
      idleSessions.map(async (session) => {
        try {
          await invoke('pause_terminal_session', { sessionId: session.id })
          pausedSessionIds.push(session.id)
        } catch (e) {
          console.error(`Failed to auto-pause terminal ${session.id}:`, e)
        }
      })
    )

    return { pausedSessionIds, count: pausedSessionIds.length }
  } catch (e) {
    console.error('Failed to auto-pause terminals:', e)
    return { pausedSessionIds: [], count: 0 }
  }
}

export const usePerformanceStore = create<PerformanceState>()((set, get) => ({
  snapshot: null,
  isPolling: false,
  pollIntervalMs: 5000,
  jsHeapMB: null,
  pressure: 'ok',
  pressureHistory: [],
  memoryThreshold: INITIAL_MEMORY_THRESHOLD,
  activityThresholdMs: INITIAL_ACTIVITY_THRESHOLD,
  autoPauseEnabled: true,
  autoPauseEvents: [],
  wasOverThreshold: false,
  terminalSessions: [],

  startPolling: (intervalMs?: number) => {
    const { isPolling } = get()
    if (isPolling) return

    const ms = intervalMs ?? get().pollIntervalMs

    // Immediate first refresh
    get().refreshNow()

    // Start interval
    pollTimer = setInterval(() => {
      get().refreshNow()
    }, ms)

    set({ isPolling: true, pollIntervalMs: ms })
  },

  stopPolling: () => {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    set({ isPolling: false })
  },

  refreshNow: async () => {
    // Get JS heap from browser
    const heap = getMemoryUsage()
    const jsHeapMB = heap ? Math.round(heap.usedJSHeapSize / (1024 * 1024)) : null
    const { memoryThreshold } = get()

    if (!isTauri()) {
      // Dev mode — set mock snapshot with only JS heap data
      set({
        snapshot: {
          total_memory_mb: 0,
          used_memory_mb: 0,
          available_memory_mb: 0,
          process_memory_mb: jsHeapMB ?? 0,
          process_memory_fraction: 0,
          total_swap_mb: 0,
          used_swap_mb: 0,
          cpu_count: 0,
          cpu_usage: 0,
          over_threshold: (jsHeapMB ?? 0) > memoryThreshold,
        },
        jsHeapMB,
        terminalSessions: [],
      })
      return
    }

    try {
      const snapshot = await invoke<PerformanceSnapshot>('get_performance_snapshot')

      // Recalculate over_threshold using the configurable threshold
      const overThreshold = snapshot.process_memory_mb > memoryThreshold
      const adjustedSnapshot: PerformanceSnapshot = { ...snapshot, over_threshold: overThreshold }

      const pressure = determinePressure(adjustedSnapshot)
      const { autoPauseEnabled, wasOverThreshold } = get()

      // Fetch terminal sessions for active/idle tracking (always, for the UI indicator)
      const { raw: rawSessions, enriched: terminalSessions } = await fetchTerminalSessions()

      // Auto-pause: trigger once when crossing from below to above threshold
      if (autoPauseEnabled && adjustedSnapshot.over_threshold && !wasOverThreshold) {
        const result = await autoPauseIdleTerminals(rawSessions)
        const event: AutoPauseEvent = {
          timestamp: Date.now(),
          pausedSessionIds: result.pausedSessionIds,
          count: result.count,
        }
        set((state) => ({
          autoPauseEvents: [event, ...state.autoPauseEvents].slice(0, 10), // keep last 10 events
          wasOverThreshold: true,
        }))
      }

      // Reset flag when memory drops below threshold
      if (!adjustedSnapshot.over_threshold && wasOverThreshold) {
        set({ wasOverThreshold: false })
      }

      set((state) => {
        const pressureHistory = [...state.pressureHistory, pressure].slice(-60)
        return {
          snapshot: adjustedSnapshot,
          jsHeapMB,
          pressure,
          pressureHistory,
          terminalSessions,
        }
      })
    } catch (e) {
      console.error('Failed to get performance snapshot:', e)
    }
  },

  clearPressureHistory: () => {
    set({ pressureHistory: [] })
  },

  setAutoPauseEnabled: (enabled: boolean) => {
    set({ autoPauseEnabled: enabled })
  },

  setMemoryThreshold: (mb: number) => {
    // Clamp between 50 MB and 2000 MB (2 GB)
    const clamped = Math.max(50, Math.min(2000, mb))
    try {
      localStorage.setItem('mothership-perf-memory-threshold', String(clamped))
    } catch {}
    set({ memoryThreshold: clamped })
  },

  setActivityThresholdMs: (ms: number) => {
    // Clamp between 5000 ms (5s) and 600000 ms (10 min)
    const clamped = Math.max(5000, Math.min(600_000, ms))
    try {
      localStorage.setItem('mothership-perf-activity-threshold', String(clamped))
    } catch {}
    set({ activityThresholdMs: clamped })
  },
}))
