import { useState, useCallback, memo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  Globe,
  ExternalLink,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  Home,
  Bookmark,
  X,
  Plus,
  Copy,
  Camera,
  ExternalLink as ExternalLinkIcon,
  Square,
  Monitor,
} from 'lucide-react'

export interface BrowserTab {
  id: string
  url: string
  title: string
  windowLabel?: string  // Tauri WebView window label, if opened
}

/** Check if we're running inside a Tauri desktop environment. */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export const BrowserConnector = memo(function BrowserConnector() {
  const [tabs, setTabs] = useState<BrowserTab[]>([
    { id: '1', url: 'https://example.com', title: 'Example' },
  ])
  const [activeTabId, setActiveTabId] = useState<string>('1')
  const [inputUrl, setInputUrl] = useState('')
  const [openingTabId, setOpeningTabId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activeTab = tabs.find((t) => t.id === activeTabId)
  const desktop = isTauri()

  const formatUrl = useCallback((url: string): string => {
    if (!url) return ''
    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (url.includes('.') && !url.includes(' ')) {
        return `https://${url}`
      } else {
        // Treat as search query
        return `https://www.google.com/search?q=${encodeURIComponent(url)}`
      }
    }
    return url
  }, [])

  const openInWebView = useCallback(async (tabId: string, url: string) => {
    if (!desktop) return
    setOpeningTabId(tabId)
    setError(null)

    try {
      const result = await invoke<{ label: string; url: string; title: string }>(
        'create_browser_window',
        { tabId, url }
      )

      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId
            ? { ...t, url: result.url, title: result.title, windowLabel: result.label }
            : t
        )
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(`Failed to open browser: ${msg}`)
      console.error('Browser window error:', e)
    } finally {
      setOpeningTabId(null)
    }
  }, [desktop])

  const handleNavigate = useCallback(async (rawUrl: string) => {
    if (!rawUrl) return

    const finalUrl = formatUrl(rawUrl)

    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTabId ? { ...t, url: finalUrl, title: finalUrl } : t
      )
    )
    setInputUrl(finalUrl)
    setError(null)

    // If tab already has a Tauri window, navigate it
    const tab = tabs.find((t) => t.id === activeTabId)
    if (tab?.windowLabel && desktop) {
      try {
        await invoke('navigate_browser_window', { tabId: activeTabId, url: finalUrl })
      } catch (e) {
        console.error('Navigation error:', e)
        // If navigation fails (e.g. window was closed), re-open
        await openInWebView(activeTabId, finalUrl)
      }
    } else if (desktop) {
      // First navigation — open the WebView window
      await openInWebView(activeTabId, finalUrl)
    }
  }, [activeTabId, formatUrl, desktop, tabs, openInWebView])

  const handleAddTab = useCallback(() => {
    const newTab: BrowserTab = {
      id: Date.now().toString(),
      url: 'about:blank',
      title: 'New Tab',
    }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(newTab.id)
    setInputUrl('')
    setError(null)
  }, [])

  const handleCloseTab = useCallback(async (id: string) => {
    if (tabs.length === 1) return

    const tab = tabs.find((t) => t.id === id)

    // Close the Tauri WebView window if it was open
    if (tab?.windowLabel && desktop) {
      try {
        await invoke('close_browser_window', { tabId: id })
      } catch (e) {
        console.error('Failed to close browser window:', e)
      }
    }

    setTabs((prev) => prev.filter((t) => t.id !== id))
    if (activeTabId === id) {
      const remaining = tabs.filter((t) => t.id !== id)
      setActiveTabId(remaining[remaining.length - 1]?.id || '')
    }
  }, [tabs, activeTabId, desktop])

  const handleRefresh = useCallback(async () => {
    if (!activeTab) return
    setError(null)
    const tab = tabs.find((t) => t.id === activeTabId)
    if (tab?.windowLabel && desktop) {
      try {
        await invoke('navigate_browser_window', { tabId: activeTabId, url: tab.url })
      } catch (e) {
        console.error('Refresh error:', e)
      }
    } else {
      // Re-navigate in-place
      handleNavigate(activeTab.url)
    }
  }, [activeTab, activeTabId, tabs, desktop, handleNavigate])

  const handleCopyUrl = useCallback(() => {
    if (activeTab) {
      navigator.clipboard.writeText(activeTab.url)
    }
  }, [activeTab])

  const handleOpenExternal = useCallback(() => {
    if (activeTab) {
      window.open(activeTab.url, '_blank')
    }
  }, [activeTab])

  const handleDomNavigate = useCallback((url: string) => {
    setInputUrl(url)
    handleNavigate(url)
  }, [handleNavigate])

  return (
    <div className="flex flex-col h-full">
      {/* Tab Bar */}
      <div className="flex items-center border-b border-c-border bg-surface-subtle">
        <div className="flex overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => {
                setActiveTabId(tab.id)
                setInputUrl(tab.url === 'about:blank' ? '' : tab.url)
                setError(null)
              }}
              className={`flex items-center gap-1 px-3 py-1.5 text-[10px] border-r border-c-border cursor-pointer min-w-[100px] max-w-[150px] ${
                activeTabId === tab.id
                  ? 'bg-surface-base text-c-primary'
                  : 'text-c-secondary hover:bg-surface-hover'
              }`}
            >
              {tab.windowLabel ? (
                <Monitor className="w-3 h-3 flex-shrink-0 text-green-400" />
              ) : (
                <Globe className="w-3 h-3 flex-shrink-0" />
              )}
              <span className="truncate flex-1">{tab.title}</span>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCloseTab(tab.id)
                  }}
                  className="text-c-secondary hover:text-c-primary"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={handleAddTab}
          className="p-1.5 text-c-secondary hover:text-c-primary hover:bg-surface-hover transition-colors"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {/* Navigation Bar */}
      <div className="flex items-center gap-1 p-1 border-b border-c-border">
        <button
          className="p-1 text-c-secondary hover:text-c-primary hover:bg-surface-hover rounded transition-colors disabled:opacity-30"
          disabled
        >
          <ArrowLeft className="w-3 h-3" />
        </button>
        <button
          className="p-1 text-c-secondary hover:text-c-primary hover:bg-surface-hover rounded transition-colors disabled:opacity-30"
          disabled
        >
          <ArrowRight className="w-3 h-3" />
        </button>
        <button
          onClick={handleRefresh}
          className="p-1 text-c-secondary hover:text-c-primary hover:bg-surface-hover rounded transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
        <button
          onClick={() => handleDomNavigate('https://www.google.com')}
          className="p-1 text-c-secondary hover:text-c-primary hover:bg-surface-hover rounded transition-colors"
        >
          <Home className="w-3 h-3" />
        </button>

        {/* URL Bar */}
        <div className="flex-1 flex items-center gap-1 bg-surface-base border border-c-border rounded px-2 py-0.5">
          <Globe className="w-3 h-3 text-c-secondary flex-shrink-0" />
          <input
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNavigate(inputUrl)
            }}
            placeholder="Enter URL or search..."
            className="flex-1 bg-transparent text-[10px] text-c-primary placeholder-c-secondary focus:outline-none"
          />
          {inputUrl && (
            <button
              onClick={() => setInputUrl('')}
              className="text-c-secondary hover:text-c-primary"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </div>

        <button
          onClick={handleCopyUrl}
          className="p-1 text-c-secondary hover:text-c-primary hover:bg-surface-hover rounded transition-colors"
          title="Copy URL"
        >
          <Copy className="w-3 h-3" />
        </button>
        <button
          onClick={handleOpenExternal}
          className="p-1 text-c-secondary hover:text-c-primary hover:bg-surface-hover rounded transition-colors"
          title="Open in system browser"
        >
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="px-3 py-1.5 bg-red-900/20 border-b border-red-700/30 text-[10px] text-red-300 flex items-center gap-2">
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-200"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </div>
      )}

      {/* Browser Content Area */}
      <div className="flex-1 relative bg-white dark:bg-gray-900">
        {activeTab?.windowLabel ? (
          /* Real WebView is open in a separate window — show status */
          <div className="flex flex-col items-center justify-center h-full text-c-secondary">
            <Monitor className="w-10 h-10 mb-3 text-green-400/60" />
            <p className="text-sm mb-1 text-c-primary">Browser Window Open</p>
            <p className="text-xs text-center max-w-[300px] mb-4 text-c-muted">
              {activeTab.url}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  // Focus the existing Tauri window
                  if (desktop && activeTab.windowLabel) {
                    invoke('navigate_browser_window', {
                      tabId: activeTab.id,
                      url: activeTab.url,
                    }).catch(() => {})
                  }
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-[10px] bg-surface-subtle border border-c-border rounded hover:bg-surface-hover transition-colors"
              >
                <Square className="w-3 h-3" />
                Focus Window
              </button>
              <button
                onClick={handleOpenExternal}
                className="flex items-center gap-1 px-3 py-1.5 text-[10px] bg-surface-subtle border border-c-border rounded hover:bg-surface-hover transition-colors"
              >
                <ExternalLinkIcon className="w-3 h-3" />
                Open Externally
              </button>
            </div>
          </div>
        ) : openingTabId ? (
          /* Loading state while opening WebView */
          <div className="flex flex-col items-center justify-center h-full text-c-secondary">
            <div className="w-6 h-6 border-2 border-mothership-400 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-xs">Opening browser window...</p>
          </div>
        ) : desktop ? (
          /* Desktop — not yet navigated to any URL */
          <div className="flex flex-col items-center justify-center h-full text-c-secondary">
            <Globe className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-sm mb-2 text-c-primary">Browser Panel</p>
            <p className="text-xs text-center max-w-[300px] mb-4 text-c-muted">
              Enter a URL in the address bar above to open a real Tauri WebView
              window. Each tab creates a separate browser window for your agents.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleCopyUrl}
                className="flex items-center gap-1 px-3 py-1.5 text-[10px] bg-surface-subtle border border-c-border rounded hover:bg-surface-hover transition-colors"
              >
                <Copy className="w-3 h-3" />
                Copy URL
              </button>
              <button
                onClick={handleOpenExternal}
                className="flex items-center gap-1 px-3 py-1.5 text-[10px] bg-surface-subtle border border-c-border rounded hover:bg-surface-hover transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Open Externally
              </button>
            </div>
          </div>
        ) : (
          /* Dev mode (no Tauri) — show placeholder */
          <div className="flex flex-col items-center justify-center h-full text-c-secondary">
            <Globe className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-sm mb-2 text-c-primary">Browser View (Dev)</p>
            <p className="text-xs text-center max-w-[300px] mb-4 text-c-muted">
              Navigate to a URL using the address bar above. In the desktop app,
              this opens a real Tauri WebView window. In dev mode, use the
              "Open Externally" button to view in your system browser.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleCopyUrl}
                className="flex items-center gap-1 px-3 py-1.5 text-[10px] bg-surface-subtle border border-c-border rounded hover:bg-surface-hover transition-colors"
              >
                <Copy className="w-3 h-3" />
                Copy URL
              </button>
              <button
                onClick={handleOpenExternal}
                className="flex items-center gap-1 px-3 py-1.5 text-[10px] bg-surface-subtle border border-c-border rounded hover:bg-surface-hover transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Open Externally
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-2 py-0.5 border-t border-c-border text-[9px] text-c-secondary">
        <span className="truncate max-w-[50%]">{activeTab?.url}</span>
        <div className="flex items-center gap-2">
          {desktop && activeTab?.windowLabel && (
            <span className="flex items-center gap-1 text-green-400">
              <Monitor className="w-2.5 h-2.5" />
              WebView
            </span>
          )}
          <button
            className="flex items-center gap-1 hover:text-c-primary transition-colors"
            title="Capture screenshot"
          >
            <Camera className="w-2.5 h-2.5" />
            Capture
          </button>
          <button
            className="flex items-center gap-1 hover:text-c-primary transition-colors"
            title="Bookmark page"
          >
            <Bookmark className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>
    </div>
  )
})
