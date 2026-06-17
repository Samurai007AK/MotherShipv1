import { useState, memo } from 'react'
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
} from 'lucide-react'

export interface BrowserTab {
  id: string
  url: string
  title: string
  favicon?: string
}

export const BrowserConnector = memo(function BrowserConnector() {
  const [tabs, setTabs] = useState<BrowserTab[]>([
    { id: '1', url: 'https://example.com', title: 'Example' },
  ])
  const [activeTabId, setActiveTabId] = useState<string>('1')
  const [inputUrl, setInputUrl] = useState('')

  const activeTab = tabs.find((t) => t.id === activeTabId)

  const handleNavigate = (url: string) => {
    if (!url) return

    // Add protocol if missing
    let finalUrl = url
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      // Check if it looks like a URL
      if (url.includes('.') && !url.includes(' ')) {
        finalUrl = `https://${url}`
      } else {
        // Treat as search query
        finalUrl = `https://www.google.com/search?q=${encodeURIComponent(url)}`
      }
    }

    setTabs((prev) =>
      prev.map((t) =>
        t.id === activeTabId ? { ...t, url: finalUrl, title: finalUrl } : t
      )
    )
    setInputUrl(finalUrl)
  }

  const handleAddTab = () => {
    const newTab: BrowserTab = {
      id: Date.now().toString(),
      url: 'about:blank',
      title: 'New Tab',
    }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(newTab.id)
    setInputUrl('')
  }

  const handleCloseTab = (id: string) => {
    if (tabs.length === 1) return
    setTabs((prev) => prev.filter((t) => t.id !== id))
    if (activeTabId === id) {
      setActiveTabId(tabs.find((t) => t.id !== id)?.id || '')
    }
  }

  const handleCopyUrl = () => {
    if (activeTab) {
      navigator.clipboard.writeText(activeTab.url)
    }
  }

  const handleOpenExternal = () => {
    if (activeTab) {
      window.open(activeTab.url, '_blank')
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab Bar */}
      <div className="flex items-center border-b border-c-border bg-surface-subtle">
        <div className="flex overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`flex items-center gap-1 px-3 py-1.5 text-[10px] border-r border-c-border cursor-pointer min-w-[100px] max-w-[150px] ${
                activeTabId === tab.id
                  ? 'bg-surface-base text-c-primary'
                  : 'text-c-secondary hover:bg-surface-hover'
              }`}
            >
              <Globe className="w-3 h-3 flex-shrink-0" />
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
        <button className="p-1 text-c-secondary hover:text-c-primary hover:bg-surface-hover rounded transition-colors">
          <ArrowLeft className="w-3 h-3" />
        </button>
        <button className="p-1 text-c-secondary hover:text-c-primary hover:bg-surface-hover rounded transition-colors">
          <ArrowRight className="w-3 h-3" />
        </button>
        <button
          onClick={() => handleNavigate(activeTab?.url || '')}
          className="p-1 text-c-secondary hover:text-c-primary hover:bg-surface-hover rounded transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
        <button
          onClick={() => handleNavigate('https://www.google.com')}
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

      {/* Browser Content Area */}
      <div className="flex-1 relative bg-white">
        {/* Placeholder content - in production, this would be a WebView */}
        <div className="flex flex-col items-center justify-center h-full text-c-secondary">
          <Globe className="w-12 h-12 mb-4 opacity-50" />
          <p className="text-sm mb-2">Browser View</p>
          <p className="text-xs text-center max-w-[300px] mb-4">
            Navigate to a URL using the address bar above. The browser panel
            will capture page content for context.
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
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-2 py-0.5 border-t border-c-border text-[9px] text-c-secondary">
        <span className="truncate max-w-[50%]">{activeTab?.url}</span>
        <div className="flex items-center gap-2">
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
