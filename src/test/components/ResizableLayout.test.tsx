import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ResizableLayout } from '../../components/layout/ResizableLayout'

// ── Mock react-resizable-panels ────────────────────────────────────────────

// Track onLayoutChange so tests can trigger it
let layoutChangeHandler: ((layout: Record<string, number>) => void) | null = null
// Track separator onDoubleClick callbacks
const separatorDoubleClickHandlers: Array<() => void> = []
// Track panel resize functions for double-click testing
const panelResizeFns: Record<string, ReturnType<typeof vi.fn>> = {}

vi.mock('react-resizable-panels', () => ({
  Group: ({
    children,
    orientation,
    onLayoutChange,
    className,
  }: {
    children: React.ReactNode
    orientation: string
    onLayoutChange?: (layout: Record<string, number>) => void
    className?: string
  }) => {
    layoutChangeHandler = onLayoutChange ?? null
    return (
      <div
        data-testid="resizable-group"
        data-orientation={orientation}
        data-classname={className}
      >
        {children}
      </div>
    )
  },
  Panel: ({
    children,
    defaultSize,
    minSize,
    id,
    panelRef,
  }: {
    children: React.ReactNode
    defaultSize: number
    minSize: number
    id?: string
    panelRef?: { current: { resize: (size: number) => void } | null }
  }) => {
    // Wire up panelRef so double-click handlers can call resize
    if (panelRef && id) {
      const resizeFn = vi.fn((_size: number) => {})
      panelRef.current = { resize: resizeFn }
      panelResizeFns[id] = resizeFn
    }
    return (
      <div
        data-testid={`panel-${id ?? 'unknown'}`}
        data-default-size={defaultSize}
        data-min-size={minSize}
      >
        {children}
      </div>
    )
  },
  Separator: ({
    className,
    onDoubleClick,
    disableDoubleClick,
  }: {
    className?: string
    onDoubleClick?: () => void
    disableDoubleClick?: boolean
  }) => {
    if (onDoubleClick) {
      separatorDoubleClickHandlers.push(onDoubleClick)
    }
    return (
      <div
        data-testid="resizable-separator"
        className={className}
        data-disable-double-click={disableDoubleClick ? 'true' : 'false'}
      />
    )
  },
}))

// ── Mock PanelErrorBoundary ────────────────────────────────────────────────

vi.mock('../../components/layout/ErrorBoundary', () => ({
  PanelErrorBoundary: ({ children, panelName }: { children: React.ReactNode; panelName?: string }) => (
    <div data-testid={`error-boundary-${panelName?.toLowerCase() ?? 'default'}`}>
      {children}
    </div>
  ),
}))

// ── Mock child components ──────────────────────────────────────────────────

vi.mock('../../components/agents/AgentSidebar', () => ({
  AgentSidebar: () => <div data-testid="agent-sidebar">Agent Sidebar</div>,
}))

vi.mock('../../components/workspace/WorkspaceView', () => ({
  WorkspaceView: () => <div data-testid="workspace-view">Workspace View</div>,
}))

vi.mock('../../components/memory/MemoryPanel', () => ({
  MemoryPanel: () => <div data-testid="memory-panel">Memory Panel</div>,
}))

// ── Mock Tauri invoke ──────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// ── Helpers ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'mothership-panel-sizes'

function clearLocalStorage() {
  localStorage.clear()
}

function renderLayout() {
  // Reset captured callbacks before each render
  layoutChangeHandler = null
  separatorDoubleClickHandlers.length = 0
  return render(<ResizableLayout />)
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ResizableLayout', () => {
  afterEach(() => {
    clearLocalStorage()
  })

  // ── Panel rendering ──────────────────────────────────────────────────────

  describe('panel rendering', () => {
    it('renders the Group with horizontal orientation', () => {
      renderLayout()

      const group = screen.getByTestId('resizable-group')
      expect(group).toHaveAttribute('data-orientation', 'horizontal')
    })

    it('renders the AgentSidebar in the sidebar panel', () => {
      renderLayout()

      expect(screen.getByTestId('panel-sidebar')).toBeInTheDocument()
      expect(screen.getByTestId('agent-sidebar')).toBeInTheDocument()
    })

    it('renders the WorkspaceView in the workspace panel', () => {
      renderLayout()

      expect(screen.getByTestId('panel-workspace')).toBeInTheDocument()
      expect(screen.getByTestId('workspace-view')).toBeInTheDocument()
    })

    it('renders the MemoryPanel in the memory panel', () => {
      renderLayout()

      expect(screen.getByTestId('panel-memory')).toBeInTheDocument()
      expect(screen.getByTestId('memory-panel')).toBeInTheDocument()
    })

    it('renders two Separator components', async () => {
      renderLayout()
      // Flush microtasks from mount useEffect (localStorage layout loading)
      await act(async () => {})

      const separators = screen.getAllByTestId('resizable-separator')
      expect(separators.length).toBe(2)
    })
  })

  // ── Error boundaries ─────────────────────────────────────────────────────

  describe('error boundaries', () => {
    it('wraps sidebar in PanelErrorBoundary with panelName="Sidebar"', () => {
      renderLayout()

      const eb = screen.getByTestId('error-boundary-sidebar')
      expect(eb).toContainElement(screen.getByTestId('agent-sidebar'))
    })

    it('wraps workspace in PanelErrorBoundary with panelName="Workspace"', () => {
      renderLayout()

      const eb = screen.getByTestId('error-boundary-workspace')
      expect(eb).toContainElement(screen.getByTestId('workspace-view'))
    })

    it('wraps memory in PanelErrorBoundary with panelName="Memory"', () => {
      renderLayout()

      const eb = screen.getByTestId('error-boundary-memory')
      expect(eb).toContainElement(screen.getByTestId('memory-panel'))
    })
  })

  // ── Default sizes ────────────────────────────────────────────────────────

  describe('default sizes', () => {
    it('passes defaultSize=20 to the sidebar panel', () => {
      renderLayout()

      const panel = screen.getByTestId('panel-sidebar')
      expect(panel).toHaveAttribute('data-default-size', '20')
    })

    it('passes defaultSize=50 to the workspace panel', () => {
      renderLayout()

      const panel = screen.getByTestId('panel-workspace')
      expect(panel).toHaveAttribute('data-default-size', '50')
    })

    it('passes defaultSize=30 to the memory panel', () => {
      renderLayout()

      const panel = screen.getByTestId('panel-memory')
      expect(panel).toHaveAttribute('data-default-size', '30')
    })

    it('passes minSize=15 to the sidebar panel', () => {
      renderLayout()

      const panel = screen.getByTestId('panel-sidebar')
      expect(panel).toHaveAttribute('data-min-size', '15')
    })

    it('passes minSize=30 to the workspace panel', () => {
      renderLayout()

      const panel = screen.getByTestId('panel-workspace')
      expect(panel).toHaveAttribute('data-min-size', '30')
    })

    it('passes minSize=20 to the memory panel', () => {
      renderLayout()

      const panel = screen.getByTestId('panel-memory')
      expect(panel).toHaveAttribute('data-min-size', '20')
    })
  })

  // ── localStorage layout persistence ──────────────────────────────────────

  describe('localStorage layout loading', () => {
    it('loads saved layout from localStorage on mount', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ sidebar: 25, workspace: 40, memory: 35 })
      )
      renderLayout()

      const sidebar = screen.getByTestId('panel-sidebar')
      const workspace = screen.getByTestId('panel-workspace')
      const memory = screen.getByTestId('panel-memory')

      expect(sidebar).toHaveAttribute('data-default-size', '25')
      expect(workspace).toHaveAttribute('data-default-size', '40')
      expect(memory).toHaveAttribute('data-default-size', '35')
    })

    it('falls back to default layout when localStorage has invalid data', () => {
      localStorage.setItem(STORAGE_KEY, 'not-json')
      renderLayout()

      const sidebar = screen.getByTestId('panel-sidebar')
      expect(sidebar).toHaveAttribute('data-default-size', '20')
    })

    it('falls back to default layout when localStorage is empty', () => {
      renderLayout()

      const sidebar = screen.getByTestId('panel-sidebar')
      expect(sidebar).toHaveAttribute('data-default-size', '20')
    })

    it('falls back to default layout when saved data has wrong shape', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ sidebar: 25 }) // missing workspace and memory
      )
      renderLayout()

      const sidebar = screen.getByTestId('panel-sidebar')
      const workspace = screen.getByTestId('panel-workspace')

      expect(sidebar).toHaveAttribute('data-default-size', '20')
      expect(workspace).toHaveAttribute('data-default-size', '50')
    })
  })

  // ── onLayoutChange ───────────────────────────────────────────────────────

  describe('layout change handling', () => {
    it('saves layout to localStorage when onLayoutChange fires', () => {
      renderLayout()

      const newLayout = { sidebar: 20, workspace: 60, memory: 20 }
      layoutChangeHandler?.(newLayout)

      const saved = localStorage.getItem(STORAGE_KEY)
      expect(saved).toBe(JSON.stringify(newLayout))
    })

    it('updates rendered panel sizes when onLayoutChange fires', () => {
      renderLayout()

      // Initial sizes should be default
      const sidebarBefore = screen.getByTestId('panel-sidebar')
      expect(sidebarBefore).toHaveAttribute('data-default-size', '20')

      // Trigger layout change wrapped in act() so React flushes the DOM update
      act(() => {
        layoutChangeHandler?.({ sidebar: 30, workspace: 40, memory: 30 })
      })

      // After re-render, panels should use the new layout sizes
      const sidebarAfter = screen.getByTestId('panel-sidebar')
      expect(sidebarAfter).toHaveAttribute('data-default-size', '30')
    })
  })

  // ── Separator double-click ───────────────────────────────────────────────

  describe('separator double-click reset', () => {
    it('renders separators with disableDoubleClick=true', () => {
      renderLayout()

      const separators = screen.getAllByTestId('resizable-separator')
      separators.forEach((sep) => {
        expect(sep).toHaveAttribute('data-disable-double-click', 'true')
      })
    })

    it('has two separator double-click handlers registered', () => {
      renderLayout()

      expect(separatorDoubleClickHandlers.length).toBe(2)
    })

    it('resets sidebar to default size on first separator double-click', () => {
      renderLayout()

      // Fire the first separator's onDoubleClick handler (sidebar reset)
      act(() => {
        separatorDoubleClickHandlers[0]()
      })

      expect(panelResizeFns['sidebar']).toHaveBeenCalledWith(20)
    })

    it('resets memory panel to default size on second separator double-click', () => {
      renderLayout()

      // Fire the second separator's onDoubleClick handler (memory reset)
      act(() => {
        separatorDoubleClickHandlers[1]()
      })

      expect(panelResizeFns['memory']).toHaveBeenCalledWith(30)
    })
  })

  // ── Panel IDs ────────────────────────────────────────────────────────────

  describe('panel IDs', () => {
    it('renders panels with correct ids: sidebar, workspace, memory', () => {
      renderLayout()

      expect(screen.getByTestId('panel-sidebar')).toBeInTheDocument()
      expect(screen.getByTestId('panel-workspace')).toBeInTheDocument()
      expect(screen.getByTestId('panel-memory')).toBeInTheDocument()
    })
  })

  // ── Group class ──────────────────────────────────────────────────────────

  describe('group class', () => {
    it('passes className="flex-1" to the Group', () => {
      renderLayout()

      const group = screen.getByTestId('resizable-group')
      expect(group).toHaveAttribute('data-classname', 'flex-1')
    })
  })
})
