import { useCallback, useRef, useState } from 'react'
import { PanelErrorBoundary } from './ErrorBoundary'
import {
  Group,
  Panel,
  Separator,
  type GroupImperativeHandle,
  type PanelImperativeHandle,
  type Layout,
} from 'react-resizable-panels'
import { AgentSidebar } from '../agents/AgentSidebar'
import { WorkspaceView } from '../workspace/WorkspaceView'
import { MemoryPanel } from '../memory/MemoryPanel'

const STORAGE_KEY = 'mothership-panel-sizes'

const DEFAULT_LAYOUT: Layout = {
  sidebar: 20,
  workspace: 50,
  memory: 30,
}

const MIN_SIZES = {
  sidebar: 15,
  workspace: 30,
  memory: 20,
}

function loadLayout(): Layout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, number>
      if (
        typeof parsed.sidebar === 'number' &&
        typeof parsed.workspace === 'number' &&
        typeof parsed.memory === 'number'
      ) {
        return parsed as Layout
      }
    }
  } catch {}
  return DEFAULT_LAYOUT
}

function saveLayout(layout: Layout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
  } catch {}
}

export function ResizableLayout() {
  const [layout, setLayout] = useState<Layout>(loadLayout)
  const groupRef = useRef<GroupImperativeHandle>(null)
  const sidebarRef = useRef<PanelImperativeHandle>(null)
  const workspaceRef = useRef<PanelImperativeHandle>(null)
  const memoryRef = useRef<PanelImperativeHandle>(null)

  const handleLayoutChange = useCallback((newLayout: Layout) => {
    setLayout(newLayout)
    saveLayout(newLayout)
  }, [])

  const handleDoubleClick = useCallback(
    (panel: 'sidebar' | 'workspace' | 'memory') => {
      const ref =
        panel === 'sidebar'
          ? sidebarRef
          : panel === 'workspace'
          ? workspaceRef
          : memoryRef
      ref.current?.resize(DEFAULT_LAYOUT[panel])
    },
    []
  )

  return (
    <Group
      orientation="horizontal"
      onLayoutChange={handleLayoutChange}
      groupRef={groupRef}
      className="flex-1"
    >
      {/* Left: Agent Sidebar */}
      <Panel
        panelRef={sidebarRef}
        id="sidebar"
        defaultSize={layout.sidebar}
        minSize={MIN_SIZES.sidebar}
      >
        <PanelErrorBoundary panelName="Sidebar">
          <AgentSidebar />
        </PanelErrorBoundary>
      </Panel>

      {/* Divider */}
      <Separator
        className="w-1 bg-c-border hover:bg-mothership-500 transition-colors duration-150 relative group"
        disableDoubleClick
        onDoubleClick={() => handleDoubleClick('sidebar')}
      />

      {/* Center: Workspace */}
      <Panel
        panelRef={workspaceRef}
        id="workspace"
        defaultSize={layout.workspace}
        minSize={MIN_SIZES.workspace}
      >
        <PanelErrorBoundary panelName="Workspace">
          <WorkspaceView />
        </PanelErrorBoundary>
      </Panel>

      {/* Divider */}
      <Separator
        className="w-1 bg-c-border hover:bg-mothership-500 transition-colors duration-150 relative group"
        disableDoubleClick
        onDoubleClick={() => handleDoubleClick('memory')}
      />

      {/* Right: Memory Panel */}
      <Panel
        panelRef={memoryRef}
        id="memory"
        defaultSize={layout.memory}
        minSize={MIN_SIZES.memory}
      >
        <PanelErrorBoundary panelName="Memory">
          <MemoryPanel />
        </PanelErrorBoundary>
      </Panel>
    </Group>
  )
}
