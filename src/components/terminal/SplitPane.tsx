import { useCallback } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { TerminalPane, type TerminalPaneHandle } from './TerminalPane'
import { useWorkspaceStore, type SplitPaneState } from '../../stores/workspaceStore'
import { X } from 'lucide-react'

// --- Resize Handle ---

function SplitResizeHandle({ direction }: { direction: 'horizontal' | 'vertical' }) {
  return (
    <Separator
      className={`group flex items-center justify-center transition-colors hover:bg-mothership-600/20 ${
        direction === 'horizontal' ? 'h-full w-1.5' : 'w-full h-1.5'
      }`}
    >
      <div
        className={`rounded-full bg-c-border group-hover:bg-mothership-500 transition-colors ${
          direction === 'horizontal' ? 'w-0.5 h-8' : 'h-0.5 w-8'
        }`}
      />
    </Separator>
  )
}

// --- Split Pane Container ---

interface SplitPaneContainerProps {
  tabId: string
  primaryAgentId: string
  primaryWorkingDir?: string
  splitPanes: SplitPaneState[]
  visible: boolean
  onRegisterRef: (agentId: string, handle: TerminalPaneHandle | null) => void
  onExit: (agentId: string) => void
  onError: (agentId: string, message: string) => void
}

export function SplitPaneContainer({
  tabId,
  primaryAgentId,
  primaryWorkingDir,
  splitPanes,
  visible,
  onRegisterRef,
  onExit,
  onError,
}: SplitPaneContainerProps) {
  const { removeSplitPane, activeSplitPaneId, setActiveSplitPane } = useWorkspaceStore()

  const handleCloseSplit = useCallback(
    (paneId: string) => {
      removeSplitPane(tabId, paneId)
    },
    [tabId, removeSplitPane]
  )

  // No splits — render just the primary terminal
  if (splitPanes.length === 0) {
    return (
      <TerminalPane
        agentId={primaryAgentId}
        workingDir={primaryWorkingDir}
        visible={visible}
        ref={(handle) => onRegisterRef(primaryAgentId, handle)}
        onExit={() => onExit(primaryAgentId)}
        onError={(msg) => onError(primaryAgentId, msg)}
      />
    )
  }

  // Determine layout direction from the first split (all splits in a tab share direction)
  const direction = splitPanes[0].direction

  return (
    <Group orientation={direction}>
      {/* Primary pane */}
      <Panel defaultSize={50} minSize={20}>
        <div
          className={`h-full ${
            activeSplitPaneId === null ? 'ring-1 ring-mothership-500/30 rounded-sm' : ''
          }`}
          onClick={() => setActiveSplitPane(null)}
        >
          <TerminalPane
            agentId={primaryAgentId}
            workingDir={primaryWorkingDir}
            visible={visible}
            ref={(handle) => onRegisterRef(primaryAgentId, handle)}
            onExit={() => onExit(primaryAgentId)}
            onError={(msg) => onError(primaryAgentId, msg)}
          />
        </div>
      </Panel>

      {/* Split panes */}
      {splitPanes.map((pane) => (
        <SplitPaneItem
          key={pane.id}
          pane={pane}
          direction={direction}
          visible={visible}
          isActive={activeSplitPaneId === pane.id}
          onClose={() => handleCloseSplit(pane.id)}
          onFocus={() => setActiveSplitPane(pane.id)}
          onRegisterRef={onRegisterRef}
          onExit={onExit}
          onError={onError}
        />
      ))}
    </Group>
  )
}

// --- Individual Split Pane ---

interface SplitPaneItemProps {
  pane: SplitPaneState
  direction: 'horizontal' | 'vertical'
  visible: boolean
  isActive: boolean
  onClose: () => void
  onFocus: () => void
  onRegisterRef: (agentId: string, handle: TerminalPaneHandle | null) => void
  onExit: (agentId: string) => void
  onError: (agentId: string, message: string) => void
}

function SplitPaneItem({
  pane,
  direction,
  visible,
  isActive,
  onClose,
  onFocus,
  onRegisterRef,
  onExit,
  onError,
}: SplitPaneItemProps) {
  return (
    <>
      <SplitResizeHandle direction={direction} />
      <Panel defaultSize={50} minSize={15}>
        <div
          className={`h-full relative ${
            isActive ? 'ring-1 ring-mothership-500/30 rounded-sm' : ''
          }`}
          onClick={onFocus}
        >
          {/* Close split button */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            className="absolute top-1 right-1 z-30 p-0.5 rounded bg-c-surface/80 hover:bg-red-500/20 text-c-muted-light hover:text-red-400 transition-colors opacity-0 hover:opacity-100 group-hover:opacity-100"
            style={{ opacity: isActive ? 0.7 : 0 }}
            title="Close split pane"
          >
            <X className="w-3 h-3" />
          </button>

          <TerminalPane
            agentId={`${pane.agentId}-split-${pane.id}`}
            visible={visible}
            ref={(handle) => onRegisterRef(`${pane.agentId}-split-${pane.id}`, handle)}
            onExit={() => onExit(pane.agentId)}
            onError={(msg) => onError(pane.agentId, msg)}
          />
        </div>
      </Panel>
    </>
  )
}
