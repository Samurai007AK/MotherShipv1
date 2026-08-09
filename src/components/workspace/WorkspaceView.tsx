import { useEffect, useRef, useCallback, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAgentStore, getProviderColor, type Agent } from '../../stores/agentStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useWorktreeStore } from '../../stores/worktreeStore'
import { useMemoryStore } from '../../stores/memoryStore'
import { SplitPaneContainer } from '../terminal/SplitPane'
import { TerminalPane, type TerminalPaneHandle } from '../terminal/TerminalPane'
import { WorktreeManager } from './WorktreeManager'
import { WelcomeScreen } from './WelcomeScreen'
import { EditorPanel } from '../editor/EditorPanel'
import { X, Terminal, SplitSquareHorizontal, Paperclip, GitBranch, FileCode } from 'lucide-react'

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

// --- Main Component ---

export function WorkspaceView() {
  const { tabs, activeTabId, addSplitPane, getSplitPanes } = useWorkspaceStore()
  const agents = useAgentStore((s) => s.agents)
  const addNote = useMemoryStore((s) => s.addNote)
  const { workspaceView, setWorkspaceView } = useWorktreeStore()
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

      // Ctrl+T or Cmd+T — new terminal for the currently active agent
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault()
        const agentStore = useAgentStore.getState()
        const activeAgent = agentStore.activeAgentId
          ? agentStore.agents.find((a) => a.id === agentStore.activeAgentId)
          : null
        if (activeAgent) {
          // If this agent already has a tab, just switch to it
          const tabsState = useWorkspaceStore.getState().tabs
          const existingTab = tabsState.find((t) => t.agentId === activeAgent.id)
          if (existingTab) {
            useWorkspaceStore.getState().setActiveTab(activeAgent.id)
          } else {
            useWorkspaceStore.getState().addTab(
              activeAgent.id,
              activeAgent.name,
              activeAgent.provider,
            )
          }
        }
      }

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

    // Determine the target directory from the first dropped file
    let targetDir: string | null = null

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

        // Use the directory of the first file for CWD update
        if (i === 0 && attached.directory) {
          targetDir = attached.directory
        }
      } catch (err) {
        console.error('Failed to attach file:', err)
      }
    }

    // Update terminal CWD to the file's directory
    if (targetDir) {
      const handle = terminalRefs.current.get(currentAgent)
      const sid = handle?.sessionId

      if (sid) {
        // Send cd command to the running shell with path quoted for spaces
        invoke('write_terminal_input', { sessionId: sid, data: `cd "${targetDir}"\n` })
          .catch((e) => console.error('Failed to cd in terminal:', e))
      }

      // Update the tab's workingDir for future sessions
      useWorkspaceStore.getState().setWorkingDir(currentAgent, targetDir)
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

      {/* View toggle + Tab bar */}
      {workspaceView === 'terminal' && <TabBar />}
      <div className="flex items-center border-b border-c-border bg-c-card px-2 py-1 gap-2">
        <button
          onClick={() => setWorkspaceView('terminal')}
          className={`flex items-center gap-1 px-2 py-0.5 text-[10px] rounded transition-colors ${
            workspaceView === 'terminal'
              ? 'bg-mothership-500/15 text-mothership-400 font-medium'
              : 'text-c-muted-light hover:text-c-text hover:bg-c-surface/50'
          }`}
        >
          <Terminal className="w-3 h-3" />
          Terminals
        </button>
        <button
          onClick={() => setWorkspaceView('worktrees')}
          className={`flex items-center gap-1 px-2 py-0.5 text-[10px] rounded transition-colors ${
            workspaceView === 'worktrees'
              ? 'bg-mothership-500/15 text-mothership-400 font-medium'
              : 'text-c-muted-light hover:text-c-text hover:bg-c-surface/50'
          }`}
        >
          <GitBranch className="w-3 h-3" />
          Worktrees
        </button>
        <button
          onClick={() => setWorkspaceView('editor')}
          className={`flex items-center gap-1 px-2 py-0.5 text-[10px] rounded transition-colors ${
            workspaceView === 'editor'
              ? 'bg-mothership-500/15 text-mothership-400 font-medium'
              : 'text-c-muted-light hover:text-c-text hover:bg-c-surface/50'
          }`}
        >
          <FileCode className="w-3 h-3" />
          Editor
        </button>
      </div>

      {/* Content */}
      {workspaceView === 'editor' ? (
        <EditorPanel />
      ) : workspaceView === 'worktrees' ? (
        <WorktreeManager />
      ) : tabs.length > 0 ? (
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
                    primaryWorkingDir={tab.workingDir}
                    splitPanes={splitPanes}
                    visible={isVisible}
                    onRegisterRef={registerRef}
                    onExit={(agentId, code) => {
                      useWorkspaceStore.getState().setConnected(agentId, false)
                      if (code !== 0) {
                        useAgentStore.getState().updateAgentStatus(agentId, 'error')
                      }
                    }}
                    onError={(agentId, message) => {
                      console.error(`Terminal error for ${agentId}:`, message)
                      useWorkspaceStore.getState().setTabConnected(agentId, false)
                      useAgentStore.getState().updateAgentStatus(agentId, 'error')
                    }}
                    onReconnect={(agentId) => {
                      useWorkspaceStore.getState().setConnected(agentId, true)
                    }}
                  />
                ) : (
                  <TerminalPane
                    agentId={tab.agentId}
                    visible={isVisible}
                    workingDir={tab.workingDir}
                    model={agents.find((a) => a.id === tab.agentId)?.model}
                    ref={(handle) => registerRef(tab.agentId, handle)}
                    onExit={(code) => {
                      useWorkspaceStore.getState().setConnected(tab.agentId, false)
                      if (code !== 0) {
                        useAgentStore.getState().updateAgentStatus(tab.agentId, 'error')
                      }
                    }}
                    onError={(message) => {
                      console.error(`Terminal error for ${tab.agentId}:`, message)
                      useWorkspaceStore.getState().setTabConnected(tab.agentId, false)
                      useAgentStore.getState().updateAgentStatus(tab.agentId, 'error')
                    }}
                    onReconnect={() => {
                      useWorkspaceStore.getState().setConnected(tab.agentId, true)
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <WelcomeScreen />
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
