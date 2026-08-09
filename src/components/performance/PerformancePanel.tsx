import { memo, useEffect } from 'react'
import { usePerformanceStore, type MemoryPressure } from '../../stores/performanceStore'
import {
  Activity,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Cpu,
  HardDrive,
  RefreshCw,
  BarChart3,
  Pause,
  Terminal,
  Sliders,
} from 'lucide-react'

/** Format bytes to a human-readable string. */
function formatMem(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb} MB`
}

/** Format a timestamp as a human-readable "time ago" string. */
function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

/** Color for a given pressure level. */
function pressureColor(p: MemoryPressure): string {
  switch (p) {
    case 'ok':
      return 'text-green-400'
    case 'warn':
      return 'text-yellow-400'
    case 'critical':
      return 'text-red-400'
  }
}

/** Icon for a given pressure level. */
function PressureIcon({ pressure }: { pressure: MemoryPressure }) {
  switch (pressure) {
    case 'ok':
      return <CheckCircle className={`w-4 h-4 ${pressureColor(pressure)}`} />
    case 'warn':
      return <AlertTriangle className={`w-4 h-4 ${pressureColor(pressure)}`} />
    case 'critical':
      return <AlertCircle className={`w-4 h-4 ${pressureColor(pressure)}`} />
  }
}

/** Memory bar — colored segment indicating fill level. */
function MemoryBar({ used, total, label, color }: { used: number; total: number; label: string; color: string }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="w-28 text-c-muted text-right">{label}</span>
      <div className="flex-1 h-2 bg-c-surface rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-24 text-c-text-dim font-mono text-right">
        {formatMem(used)} / {formatMem(total)}
      </span>
    </div>
  )
}

/** A single metric card. */
function MetricCard({
  icon,
  label,
  value,
  sub,
  color = 'text-c-text-dim',
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  color?: string
}) {
  return (
    <div className="flex items-center gap-2 p-2 rounded bg-c-surface/50 border border-c-border-strong/30">
      <div className="text-c-muted">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[9px] text-c-muted uppercase tracking-wide">{label}</div>
        <div className={`text-[13px] font-semibold ${color} font-mono`}>{value}</div>
        {sub && <div className="text-[9px] text-c-muted-light">{sub}</div>}
      </div>
    </div>
  )
}

export const PerformancePanel = memo(function PerformancePanel() {
  const {
    snapshot,
    isPolling,
    pressure,
    pressureHistory,
    jsHeapMB,
    memoryThreshold,
    activityThresholdMs,
    autoPauseEnabled,
    autoPauseEvents,
    terminalSessions,
    startPolling,
    stopPolling,
    refreshNow,
    setAutoPauseEnabled,
    setMemoryThreshold,
    setActivityThresholdMs,
  } = usePerformanceStore()

  // Auto-start polling on mount
  useEffect(() => {
    startPolling(5000)
    return () => stopPolling()
  }, [startPolling, stopPolling])

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-c-border">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-c-muted" />
          <span className="text-[11px] font-medium text-c-text">Performance</span>
          <PressureIcon pressure={pressure} />
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${isPolling ? 'bg-green-400 animate-pulse' : 'bg-c-muted-light'}`}
            title={isPolling ? 'Polling active' : 'Polling stopped'}
          />
          <button
            onClick={refreshNow}
            className="p-1 rounded hover:bg-c-surface text-c-muted hover:text-c-text-dim transition-colors"
            title="Refresh now"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Memory gauge */}
      <div className="px-3 py-3 space-y-1.5">
        <div className="text-[10px] font-medium text-c-muted mb-1">Memory Usage</div>

        {snapshot ? (
          <>
            {/* Process memory (Crew) */}
            <MemoryBar
              used={snapshot.process_memory_mb}
              total={snapshot.total_memory_mb || 2048}
              label="Crew"
              color={
                pressure === 'critical'
                  ? 'bg-red-500'
                  : pressure === 'warn'
                    ? 'bg-yellow-500'
                    : 'bg-mothership-500'
              }
            />

            {/* System memory */}
            <MemoryBar
              used={snapshot.used_memory_mb}
              total={snapshot.total_memory_mb}
              label="System RAM"
              color="bg-blue-500"
            />

            {/* Available memory */}
            <MemoryBar
              used={snapshot.total_memory_mb - snapshot.available_memory_mb}
              total={snapshot.total_memory_mb}
              label="Available"
              color="bg-green-500/60"
            />

            {/* Swap */}
            {snapshot.total_swap_mb > 0 && (
              <MemoryBar
                used={snapshot.used_swap_mb}
                total={snapshot.total_swap_mb}
                label="Swap"
                color="bg-purple-500/50"
              />
            )}
          </>
        ) : (
          <div className="text-[10px] text-c-muted-light py-4 text-center">
            {jsHeapMB !== null
              ? `JS Heap: ${formatMem(jsHeapMB)} (dev mode — limited data)`
              : 'Waiting for data...'}
          </div>
        )}
      </div>

      {/* Threshold indicator */}
      {snapshot && (
        <div
          className={`mx-3 mb-2 px-2 py-1 rounded text-[9px] flex items-center gap-1.5 ${
            pressure === 'critical'
              ? 'bg-red-900/20 text-red-300 border border-red-700/30'
              : pressure === 'warn'
                ? 'bg-yellow-900/20 text-yellow-300 border border-yellow-700/30'
                : 'bg-green-900/10 text-green-300 border border-green-700/20'
          }`}
        >
          <PressureIcon pressure={pressure} />
          {pressure === 'critical'
            ? `Critical — ${formatMem(snapshot.process_memory_mb)} used. ${autoPauseEnabled ? `Auto-pausing terminals over ${memoryThreshold} MB.` : ''}`
            : pressure === 'warn'
              ? `Warning — ${formatMem(snapshot.process_memory_mb)} used. Approaching ${memoryThreshold} MB threshold.`
              : `Healthy — ${formatMem(snapshot.process_memory_mb)} used. Under ${memoryThreshold} MB threshold.`}
        </div>
      )}

      {/* Auto-pause section */}
      <div className="px-3 pb-2">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5">
            <Terminal className="w-3 h-3 text-c-muted" />
            <span className="text-[10px] font-medium text-c-muted uppercase tracking-wide">
              Auto-Pause
            </span>
          </div>
          <button
            onClick={() => setAutoPauseEnabled(!autoPauseEnabled)}
            className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
              autoPauseEnabled ? 'bg-mothership-500' : 'bg-c-surface-strong'
            }`}
            title={autoPauseEnabled ? 'Auto-pause enabled' : 'Auto-pause disabled'}
          >
            <span
              className={`inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                autoPauseEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        {/* Memory threshold input */}
        <div className="flex items-center gap-2 mb-1.5">
          <Sliders className="w-2.5 h-2.5 text-c-muted" />
          <span className="text-[9px] text-c-muted uppercase tracking-wide">Mem Threshold</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={50}
              max={2000}
              step={10}
              value={memoryThreshold}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                if (!isNaN(val)) setMemoryThreshold(val)
              }}
              className="w-16 px-1 py-0.5 text-[10px] font-mono text-c-text bg-c-surface border border-c-border-strong/50 rounded text-center focus:outline-none focus:border-mothership-500 transition-colors"
            />
            <span className="text-[9px] text-c-muted-light">MB</span>
          </div>
        </div>

        {/* Idle window input */}
        <div className="flex items-center gap-2 mb-1.5">
          <Activity className="w-2.5 h-2.5 text-c-muted" />
          <span className="text-[9px] text-c-muted uppercase tracking-wide">Idle Window</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={5}
              max={600}
              step={5}
              value={Math.round(activityThresholdMs / 1000)}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                if (!isNaN(val)) setActivityThresholdMs(val * 1000)
              }}
              className="w-16 px-1 py-0.5 text-[10px] font-mono text-c-text bg-c-surface border border-c-border-strong/50 rounded text-center focus:outline-none focus:border-mothership-500 transition-colors"
            />
            <span className="text-[9px] text-c-muted-light">sec</span>
          </div>
        </div>

        {autoPauseEnabled && (
          <div className="text-[9px] text-c-muted-light">
            Pauses running terminals when Crew memory exceeds {memoryThreshold} MB
            and terminal has been idle for {Math.round(activityThresholdMs / 1000)}s
          </div>
        )}

        {/* Active terminal indicator */}
        {terminalSessions.length > 0 && (() => {
          const activeCount = terminalSessions.filter((s) => s.isActive).length
          const runningCount = terminalSessions.filter((s) => s.status === 'Running').length
          const idleCount = runningCount - activeCount
          return (
            <div className="mt-1.5 flex items-center gap-2 text-[9px]">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <span className="text-green-400 font-medium">{activeCount}</span>
                <span className="text-c-muted-light">active</span>
              </div>
              {idleCount > 0 && (
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-c-muted-light" />
                  <span className="text-c-muted-light font-medium">{idleCount}</span>
                  <span className="text-c-muted-light">idle</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <span className="text-c-muted-light">·</span>
                <span className="text-c-muted-light">{terminalSessions.length} total</span>
              </div>
            </div>
          )
        })()}

        {/* Auto-pause event history */}
        {autoPauseEvents.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {autoPauseEvents.slice(0, 3).map((event) => (
              <div
                key={event.timestamp}
                className="flex items-center gap-1.5 px-1.5 py-1 rounded bg-yellow-900/10 border border-yellow-700/20 text-[9px]"
              >
                <Pause className="w-2.5 h-2.5 text-yellow-400" />
                <span className="text-yellow-300">
                  Paused {event.count} terminal{event.count !== 1 ? 's' : ''}
                </span>
                <span className="text-c-muted-light ml-auto">
                  {formatTimeAgo(event.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Metric cards */}
      {snapshot && (
        <div className="px-3 pb-3 grid grid-cols-2 gap-1.5">
          <MetricCard
            icon={<Cpu className="w-3 h-3" />}
            label="CPU"
            value={`${snapshot.cpu_usage.toFixed(1)}%`}
            sub={`${snapshot.cpu_count} cores`}
          />
          <MetricCard
            icon={<HardDrive className="w-3 h-3" />}
            label="Memory Fraction"
            value={`${(snapshot.process_memory_fraction * 100).toFixed(1)}%`}
            sub={`of ${formatMem(snapshot.total_memory_mb)}`}
            color={snapshot.over_threshold ? 'text-yellow-400' : 'text-c-text-dim'}
          />
          <MetricCard
            icon={<BarChart3 className="w-3 h-3" />}
            label="JS Heap"
            value={jsHeapMB !== null ? formatMem(jsHeapMB) : 'N/A'}
            sub="Browser memory"
          />
          <MetricCard
            icon={<Terminal className="w-3 h-3" />}
            label="Auto-Pauses"
            value={String(autoPauseEvents.length)}
            sub={autoPauseEvents.length > 0
              ? `${autoPauseEvents[0].count} terminals paused`
              : 'No events yet'}
            color={autoPauseEvents.length > 0 ? 'text-yellow-400' : 'text-c-text-dim'}
          />
        </div>
      )}

      {/* Pressure history (last 60 entries = 5 min) */}
      {pressureHistory.length > 0 && (
        <div className="px-3 pb-3">
          <div className="text-[9px] text-c-muted uppercase tracking-wide mb-1">
            Pressure History (last 5 min)
          </div>
          <div className="flex gap-0.5 items-end h-6">
            {pressureHistory.map((p, i) => (
              <div
                key={i}
                className={`flex-1 rounded-t-sm ${
                  p === 'critical' ? 'bg-red-500' : p === 'warn' ? 'bg-yellow-500' : 'bg-green-500/40'
                }`}
                style={{
                  height: p === 'critical' ? '100%' : p === 'warn' ? '60%' : '30%',
                }}
                title={`${i * 5}s ago: ${p}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Info note for dev mode */}
      {!snapshot && !(typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) && (
        <div className="px-3 text-[9px] text-c-muted-light italic">
          Performance data available in desktop app only.
        </div>
      )}
    </div>
  )
})

