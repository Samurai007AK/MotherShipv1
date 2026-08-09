import { useState, useEffect, useCallback } from 'react'
import { useWorktreeStore, type PortAllocation } from '../../stores/worktreeStore'
import { X, Globe, Trash2, ExternalLink, Copy, RefreshCw, Wifi } from 'lucide-react'

// --- Individual Port Row ---

function PortRow({
  allocation,
  worktreeName,
  onRelease,
  onCopy,
}: {
  allocation: PortAllocation
  worktreeName: string
  onRelease: () => void
  onCopy: () => void
}) {
  const url = `http://localhost:${allocation.port}`

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-c-surface/40 border border-c-border-strong/20 hover:bg-c-surface/60 transition-colors group">
      {/* Status dot */}
      <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />

      {/* Port info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-c-text-dim">{allocation.service}</span>
          <span className="text-[10px] font-mono text-mothership-400 font-medium">{allocation.port}</span>
        </div>
        <div className="flex items-center gap-2 text-[9px] text-c-muted-light mt-0.5">
          <span>{worktreeName}</span>
          <span>·</span>
          <span>{new Date(allocation.allocated_at).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 rounded hover:bg-c-surface-hover/50 text-c-muted hover:text-mothership-400 transition-colors"
          title={`Open ${url}`}
        >
          <ExternalLink className="w-3 h-3" />
        </a>
        <button
          onClick={onCopy}
          className="p-1 rounded hover:bg-c-surface-hover/50 text-c-muted hover:text-c-text-dim transition-colors"
          title="Copy URL"
        >
          <Copy className="w-3 h-3" />
        </button>
        <button
          onClick={onRelease}
          className="p-1 rounded hover:bg-c-surface-hover/50 text-c-muted hover:text-red-400 transition-colors"
          title="Release port"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

// --- Empty State ---

function EmptyPortsState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <Wifi className="w-8 h-8 text-c-muted-light mb-3" />
      <p className="text-xs text-c-muted-light font-medium">No forwarded ports</p>
      <p className="text-[10px] text-c-muted mt-1 max-w-xs">
        Ports are automatically allocated when you start a service in a worktree workspace
      </p>
    </div>
  )
}

// --- Main Ports Dialog ---

export function PortsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { worktrees, listWorktreePorts, releaseWorktreePort } = useWorktreeStore()
  const [allPorts, setAllPorts] = useState<
    (PortAllocation & { worktreeName: string })[]
  >([])
  const [loading, setLoading] = useState(false)

  const loadAllPorts = useCallback(async () => {
    setLoading(true)
    try {
      const results: (PortAllocation & { worktreeName: string })[] = []
      for (const wt of worktrees) {
        try {
          const ports = await listWorktreePorts(wt.projectRoot, wt.id)
          for (const p of ports) {
            results.push({ ...p, worktreeName: wt.branchName })
          }
        } catch {
          // Skip worktrees that can't be queried
        }
      }
      setAllPorts(results)
    } catch (e) {
      console.error('Failed to load ports:', e)
    } finally {
      setLoading(false)
    }
  }, [worktrees, listWorktreePorts])

  // Load ports when dialog opens
  useEffect(() => {
    if (open) {
      loadAllPorts()
    }
  }, [open, loadAllPorts])

  const handleRelease = async (allocation: PortAllocation & { worktreeName: string }) => {
    try {
      const wt = worktrees.find((w) => w.id === allocation.worktree_id)
      if (wt) {
        await releaseWorktreePort(wt.projectRoot, allocation.worktree_id, allocation.service)
        setAllPorts((prev) => prev.filter((p) => p.port !== allocation.port || p.service !== allocation.service))
      }
    } catch (e) {
      console.error('Failed to release port:', e)
    }
  }

  const handleCopy = async (allocation: PortAllocation) => {
    try {
      await navigator.clipboard.writeText(`http://localhost:${allocation.port}`)
    } catch {
      // Fallback if clipboard API unavailable
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-lg bg-c-card border border-c-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-c-border">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-mothership-400" />
            <span className="text-xs font-semibold text-c-text">Port Forwarding</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadAllPorts}
              disabled={loading}
              className="p-1 rounded hover:bg-c-surface/50 text-c-muted hover:text-c-text-dim transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-c-surface/50 text-c-muted hover:text-c-text-dim transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="max-h-[400px] overflow-y-auto p-3 space-y-2">
          {allPorts.length > 0 ? (
            allPorts.map((p) => (
              <PortRow
                key={`${p.worktree_id}-${p.service}`}
                allocation={p}
                worktreeName={p.worktreeName}
                onRelease={() => handleRelease(p)}
                onCopy={() => handleCopy(p)}
              />
            ))
          ) : (
            <EmptyPortsState />
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-c-border bg-c-surface/30">
          <div className="flex items-center justify-between text-[9px] text-c-muted-light">
            <span>{allPorts.length} active {allPorts.length === 1 ? 'port' : 'ports'}</span>
            <span>Port range: 40000-50000</span>
          </div>
        </div>
      </div>
    </div>
  )
}
