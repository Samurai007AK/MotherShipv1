import { memo, useEffect } from 'react'
import { useUpdateStore } from '../../stores/updateStore'
import { Download, X, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react'

/** A slim banner displayed at the top of the app when an update is available. */
export const UpdateBanner = memo(function UpdateBanner() {
  const { update, lastChecked, checkForUpdates, installUpdate, dismissUpdate } = useUpdateStore()

  // Check for updates on mount, but only once per session
  useEffect(() => {
    if (lastChecked === null) {
      // Don't block — fire and forget
      checkForUpdates()
    }
  }, [lastChecked, checkForUpdates])

  if (!update.available && !update.error) return null

  return (
    <div className="flex items-center justify-between px-4 py-1.5 bg-mothership-700/20 border-b border-mothership-600/30">
      <div className="flex items-center gap-2 text-[11px]">
        {update.downloading ? (
          <>
            <RefreshCw className="w-3 h-3 text-mothership-400 animate-spin" />
            <span className="text-c-text-dim">
              Downloading update{update.downloadProgress > 0 ? ` — ${Math.round(update.downloadProgress * 100)}%` : '...'}
            </span>
          </>
        ) : update.error ? (
          <>
            <AlertCircle className="w-3 h-3 text-red-400" />
            <span className="text-red-300">Update check failed: {update.error}</span>
          </>
        ) : (
          <>
            <CheckCircle className="w-3 h-3 text-green-400" />
            <span className="text-c-text-dim">
              v{update.version} available
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {update.available && !update.downloading && (
          <>
            <button
              onClick={installUpdate}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-mothership-600/30 text-mothership-300 hover:bg-mothership-600/50 hover:text-mothership-200 transition-colors"
            >
              <Download className="w-2.5 h-2.5" />
              Install
            </button>
            <button
              onClick={checkForUpdates}
              className="p-0.5 rounded hover:bg-c-surface text-c-muted hover:text-c-text-dim transition-colors"
              title="Check again"
            >
              <RefreshCw className="w-2.5 h-2.5" />
            </button>
          </>
        )}
        {update.error && (
          <button
            onClick={checkForUpdates}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-c-surface text-c-muted hover:text-c-text-dim transition-colors"
          >
            <RefreshCw className="w-2.5 h-2.5" />
            Retry
          </button>
        )}
        <button
          onClick={dismissUpdate}
          className="p-0.5 rounded hover:bg-c-surface text-c-muted hover:text-c-text-dim transition-colors"
          title="Dismiss"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  )
})

/** A manual "Check for Updates" button for the status bar or settings area. */
export const UpdateCheckButton = memo(function UpdateCheckButton() {
  const { update, lastChecked, checkForUpdates } = useUpdateStore()

  const handleCheck = () => {
    checkForUpdates()
  }

  return (
    <button
      onClick={handleCheck}
      className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] text-c-muted hover:text-c-text-dim hover:bg-c-surface transition-colors"
      title={lastChecked ? `Last checked: ${new Date(lastChecked).toLocaleTimeString()}` : 'Check for updates'}
    >
      {update.downloading ? (
        <RefreshCw className="w-3 h-3 animate-spin" />
      ) : (
        <RefreshCw className="w-3 h-3" />
      )}
      <span>Updates</span>
      {update.available && (
        <span className="px-1 py-0.5 text-[8px] font-medium bg-green-600/30 text-green-400 rounded">
          {update.version}
        </span>
      )}
      {update.error && (
        <span className="px-1 py-0.5 text-[8px] font-medium bg-red-600/30 text-red-400 rounded">
          Error
        </span>
      )}
    </button>
  )
})
