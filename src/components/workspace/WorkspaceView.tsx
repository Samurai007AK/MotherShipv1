import { useEffect, useRef, useCallback, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAgentStore, getProviderColor, type Agent } from '../../stores/agentStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useMemoryStore } from '../../stores/memoryStore'
import { SplitPaneContainer } from '../terminal/SplitPane'
import { TerminalPane, type TerminalPaneHandle } from '../terminal/TerminalPane'
import { X, Terminal, SplitSquareHorizontal, Paperclip } from 'lucide-react'

// --- Tab Bar ---

function TabBar() {
  const { tabs, activeTabId, setActiveTab, removeTab, addSplitPane } = useWorkspaceStore()

  return (
    <div className="flex items-center border-b border-c-border bg-c-card">
      {tabs.map((tab) => {
        const isActive = tab.agentId === activeTabId
        return (
          <div
            key={tab.agentId}
            className={`group flex items-center gap-1.5 px-3 py-2 text-[11px] cursor-pointer border-r border-c-border transition-colors ${
              isActive
                ? 'bg-c-surface text-c-text'
                : 'text-c-muted hover:text-c-muted-light hover:bg-c-surface/50'
            }`}
            onClick={() => setActiveTab(tab.agentId)}
          >
            <span
              className={`w-2 h-2 rounded-full ${getProviderColor(tab.provider as Agent['provider'])} ${
                tab.isConnected ? 'opacity-100' : 'opacity-40'
              }`}
            />
            <span className="font-medium">{tab.agentName}</span>
            {tab.isConnected && (
              <span className="w-1.5 h-1.5 rounded-full bg-status-running animate-pulse-dot" />
            )}
            {/* Split button — only show on active tab */}
            {isActive && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  addSplitPane(tab.agentId, 'horizontal')
                }}
                className="ml-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-c-surface-hover text-c-muted hover:text-mothership-400 transition-all"
                title="Split terminal (Ctrl+\)"
              >
                <SplitSquareHorizontal className="w-2.5 h-2.5" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                removeTab(tab.agentId)
              }}
              className="ml-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-c-surface-hover text-c-muted hover:text-c-text-dim transition-all"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        )
      })}

      {tabs.length === 0 && (
        <div className="px-3 py-2 text-[11px] text-c-muted-light">No open terminals</div>
      )}
    </div>
  )
}

// --- Empty State ---

function EmptyState() {
  const { agents, activeAgentId, setActiveAgent } = useAgentStore()
  const { addTab } = useWorkspaceStore()

  const handleOpenTerminal = (agent: Agent) => {
    setActiveAgent(agent.id)
    addTab(agent.id, agent.name, agent.provider)
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-c-muted">
      <Terminal className="w-12 h-12 mb-4 text-c-muted-light" />
      <h2 className="text-sm font-medium text-c-muted mb-1">No Active Workspace</h2>
      <p className="text-xs text-c-muted-light mb-6 max-w-xs text-center">
        Select an agent from the sidebar or open a terminal to get started.
      </p>

      <div className="grid grid-cols-2 gap-2 max-w-sm">
        {agents.slice(0, 4).map((agent) => (
          <button
            key={agent.id}
            onClick={() => handleOpenTerminal(agent)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-c-border hover:border-c-border-strong hover:bg-c-surface/50 transition-all text-left ${
              activeAgentId === agent.id ? 'border-mothership-500/50 bg-c-surface/30' : ''
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${getProviderColor(agent.provider)}`}
            />
            <div className="min-w-0">
              <div className="text-xs font-medium text-c-text-dim truncate">{agent.name}</div>
              <div className="text-[10px] text-c-muted-light truncate">{agent.status}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-6 text-[10px] text-c-muted-light flex items-center gap-3">
        <span className="flex items-center gap-1">
          <kbd className="px-1 py-0.5 bg-c-surface rounded text-[9px] font-mono">Ctrl+T</kbd>
          new terminal
        </span>
        <span className="flex items-center gap-1">
          <kbd className="px-1 py-0.5 bg-c-surface rounded text-[9px] font-mono">Ctrl+\</kbd>
          split pane
        </span>
      </div>
    </div>
  )
}

// --- Main Component ---

export function WorkspaceView() {
  const { tabs, activeTabId, addSplitPane, getSplitPanes } = useWorkspaceStore()
  const agents = useAgentStore((s) => s.agents)
  const addNote = useMemoryStore((s) => s.addNote)
  const terminalRefs = useRef<Map<string, TerminalPaneHandle>>(new Map())
  const spawnedRef = useRef<Set<string>>(new Set())
  const dragCounterRef = useRef(0)
  const [isDragging, setIsDragging] = useState(false)

  // Register a terminal handle ref callback
  const registerRef = useCallback((agentId: string, handle: TerminalPaneHandle | null) => {
    if (handle) {
      terminalRefs.current.set(agentId, handle)
    } else {
      terminalRefs.current.delete(agentId)
    }
  }, [])

  // Auto-spawn terminal when a new tab appears
  useEffect(() => {
    // Use a small timeout to let TerminalPane mount and register its ref
    const timer = setTimeout(() => {
      for (const tab of tabs) {
        if (!spawnedRef.current.has(tab.agentId)) {
          spawnedRef.current.add(tab.agentId)
          const handle = terminalRefs.current.get(tab.agentId)
          if (handle) {
            handle.spawn()
          }
        }
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [tabs])

  // Clean up spawnedRef when tabs are removed
  useEffect(() => {
    const activeIds = new Set(tabs.map((t) => t.agentId))
    for (const id of spawnedRef.current) {
      if (!activeIds.has(id)) {
        spawnedRef.current.delete(id)
      }
    }
  }, [tabs])

  // Close terminal when tab is removed
  const prevTabsRef = useRef<string[]>([])
  useEffect(() => {
    const prevIds = new Set(prevTabsRef.current)
    const currIds = new Set(tabs.map((t) => t.agentId))
    for (const id of prevIds) {
      if (!currIds.has(id)) {
        const handle = terminalRefs.current.get(id)
        if (handle) {
          handle.close().catch(() => {})
        }
        terminalRefs.current.delete(id)
        spawnedRef.current.delete(id)
      }
    }
    prevTabsRef.current = tabs.map((t) => t.agentId)
  }, [tabs])

  // --- Keyboard shortcuts (1a.2d.3) ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+\ or Cmd+\ — split current terminal
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault()
        if (activeTabId) {
          addSplitPane(activeTabId, 'horizontal')
        }
      }

      // Ctrl+T or Cmd+T — new terminal for active agent (handled by sidebar)
      // Ctrl+W or Cmd+W — close current tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault()
        if (activeTabId) {
          useWorkspaceStore.getState().removeTab(activeTabId)
        }
      }

      // Ctrl+1-9 — switch to tab by index
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const index = parseInt(e.key) - 1
        const tabsState = useWorkspaceStore.getState().tabs
        if (index < tabsState.length) {
          useWorkspaceStore.getState().setActiveTab(tabsState[index].agentId)
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [activeTabId, addSplitPane])

  // --- Drag-drop file attachment (2.4) ---
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounterRef.current = 0

    const files = e.dataTransfer.files
    if (files.length === 0) return

    const currentAgent = useAgentStore.getState().activeAgentId
    if (!currentAgent) return

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      // Note: In Tauri, file.path gives the full path
      const filePath = (file as any).path || file.name

      try {
        // Attach file via Rust command
        const attached = await invoke<{
          path: string
          directory: string
          filename: string
          size: number
        }>('attach_file', { filePath })

        // Record in memory
        addNote(
          `Attached file: ${attached.filename} (${formatFileSize(attached.size)})`,
          currentAgent,
          ['file-attachment', attached.filename.split('.').pop() || '']
        )
      } catch (err) {
        console.error('Failed to attach file:', err)
      }
    }
  }, [addNote])

  return (
    <main
      className="flex-1 flex flex-col min-w-0 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-mothership-600/10 backdrop-blur-sm border-2 border-dashed border-mothership-500/50 rounded-lg pointer-events-none">
          <div className="flex flex-col items-center gap-2 p-6 rounded-xl bg-c-card/90 border border-c-border shadow-lg">
            <Paperclip className="w-8 h-8 text-mothership-400" />
            <p className="text-sm font-medium text-c-text">Drop files to attach</p>
            <p className="text-xs text-c-muted">Files will be recorded in memory</p>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <TabBar />

      {/* Content */}
      {tabs.length > 0 ? (
        <div className="flex-1 relative">
          {tabs.map((tab) => {
            const isVisible = tab.agentId === activeTabId
            const splitPanes = getSplitPanes(tab.agentId)

            return (
              <div
                key={tab.agentId}
                className={`absolute inset-0 ${
                  isVisible ? 'z-10' : 'z-0 pointer-events-none'
                }`}
                style={{
                  visibility: isVisible ? 'visible' : 'hidden',
                }}
              >
                {splitPanes.length > 0 ? (
                  <SplitPaneContainer
                    tabId={tab.agentId}
                    primaryAgentId={tab.agentId}
                    splitPanes={splitPanes}
                    visible={isVisible}
                    onRegisterRef={registerRef}
                    onExit={(agentId) => {
                      useWorkspaceStore.getState().setConnected(agentId, false)
                    }}
                    onError={(agentId, message) => {
                      console.error(`Terminal error for ${agentId}:`, message)
                    }}
                  />
                ) : (
                  <TerminalPane
                    agentId={tab.agentId}
                    visible={isVisible}
                    model={agents.find((a) => a.id === tab.agentId)?.model}
                    ref={(handle) => registerRef(tab.agentId, handle)}
                    onExit={() => {
                      useWorkspaceStore.getState().setConnected(tab.agentId, false)
                    }}
                    onError={(message) => {
                      console.error(`Terminal error for ${tab.agentId}:`, message)
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState />
      )}
    </main>
  )
}

// --- Helpers ---

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
