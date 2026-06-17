import React, { lazy, useState, useEffect } from 'react'

// Lazy load heavy components
const ModelRouterPanel = lazy(() =>
  import('../components/model-router/ModelRouterPanel').then((m) => ({ default: m.ModelRouterPanel }))
)
const WarRoom = lazy(() =>
  import('../components/war-room/WarRoom').then((m) => ({ default: m.WarRoom }))
)
const TaskGraph = lazy(() =>
  import('../components/task-graph/TaskGraph').then((m) => ({ default: m.TaskGraph }))
)
const BrowserConnector = lazy(() =>
  import('../components/browser/BrowserConnector').then((m) => ({ default: m.BrowserConnector }))
)
const MCPPanel = lazy(() =>
  import('../components/mcp/MCPPanel').then((m) => ({ default: m.MCPPanel }))
)

function PanelFallback() {
  return (
    <div className="flex items-center justify-center h-full text-c-secondary text-[10px]">
      <div className="animate-pulse">Loading...</div>
    </div>
  )
}

// Lazy panel wrapper with unmount after idle
export function LazyPanel({
  children,
  idleTimeoutMs = 600000, // 10 minutes
}: {
  children: React.ReactNode
  idleTimeoutMs?: number
}) {
  const [isMounted, setIsMounted] = useState(true)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    const resetTimer = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        setIsMounted(false)
      }, idleTimeoutMs)
    }

    // Start timer
    resetTimer()

    // Reset on any activity
    const handleActivity = () => {
      if (!isMounted) setIsMounted(true)
      resetTimer()
    }

    window.addEventListener('mousemove', handleActivity)
    window.addEventListener('keydown', handleActivity)

    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener('mousemove', handleActivity)
      window.removeEventListener('keydown', handleActivity)
    }
  }, [idleTimeoutMs, isMounted])

  if (!isMounted) {
    return (
      <div className="flex items-center justify-center h-full text-c-secondary text-[10px]">
        Panel idle — click to reactivate
      </div>
    )
  }

  return <>{children}</>
}

// Export lazy components
export {
  ModelRouterPanel,
  WarRoom,
  TaskGraph,
  BrowserConnector,
  MCPPanel,
  PanelFallback,
}
