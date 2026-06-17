# Mothership — Unified Zustand Store Design

**Last Updated:** 2026-06-16
**Status:** Design Draft
**Scope:** Unified state management for loop engine, quality gates, and archive system
**Dependencies:** LOOPS.md, MOTHERSHIP-RALPH.md, QUALITY-GATE.md, AUTO-ARCHIVE.md

---

## Overview

This document defines a **unified Zustand store architecture** that combines the three core subsystems of Mothership's Ralph-inspired loop engine into a single, cohesive state management layer. The store coordinates between:

1. **Loop State** — Current loop execution, tasks, iterations
2. **Quality Gates** — Gate validation results, error parsing, metrics
3. **Archive System** — Session archival, branch detection, restoration

**Key Design Principle:** Each subsystem has its own store slice, but they share a common coordination layer that ensures consistency across state transitions.

---

## Architecture

### Store Structure

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    UNIFIED ZUSTAND STORE                                   │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  useLoopStore                    ← Loop execution state             │ │
│  │  ├── status, progress, tasks, iterations                            │ │
│  │  ├── startLoop, pauseLoop, resumeLoop, cancelLoop                   │ │
│  │  └── Subscriptions: auto-save, auto-pause, progress updates         │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                              │                                             │
│                              ▼                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  useQualityGateStore           ← Quality gate validation            │ │
│  │  ├── currentReport, reportHistory, isRunning                        │ │
│  │  ├── runQualityGates, selectGate, toggleDetails                     │ │
│  │  └── Subscriptions: auto-validate before commit, history tracking   │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                              │                                             │
│                              ▼                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  useArchiveStore               ← Session archival                   │ │
│  │  ├── archives, selectedArchiveId, branchChanged                     │ │
│  │  ├── archiveSession, restoreArchive, checkBranchChange              │ │
│  │  └── Subscriptions: auto-archive on branch change, shutdown         │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                              │                                             │
│                              ▼                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  useCoordinatorStore           ← Cross-cutting coordination         │ │
│  │  ├── globalStatus, activeLoopId, activeArchiveId                    │ │
│  │  ├── registerLoop, registerArchive, syncAll                         │ │
│  │  └── Subscriptions: cross-store sync, event coordination            │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW DIAGRAM                                  │
│                                                                            │
│  User Action                                                               │
│      │                                                                     │
│      ▼                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                    │
│  │ Loop Store  │───▶│ QualityGate │───▶│  Archive    │                    │
│  │             │    │   Store     │    │   Store     │                    │
│  └─────────────┘    └─────────────┘    └─────────────┘                    │
│         │                   │                   │                          │
│         └───────────────────┼───────────────────┘                          │
│                             │                                              │
│                             ▼                                              │
│                    ┌─────────────────┐                                     │
│                    │ Coordinator     │                                     │
│                    │    Store        │                                     │
│                    └─────────────────┘                                     │
│                             │                                              │
│                             ▼                                              │
│                    ┌─────────────────┐                                     │
│                    │  Tauri IPC      │                                     │
│                    │  (Rust Backend) │                                     │
│                    └─────────────────┘                                     │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Store Implementations

### 1. Loop Store (`useLoopStore`)

```typescript
// stores/loopStore.ts
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { invoke } from '@tauri-apps/api/core'

// ============================================
// TYPES
// ============================================

export interface Task {
  id: string
  title: string
  description: string
  acceptanceCriteria: string[]
  priority: number
  passes: boolean
  notes: string
  iterationCompleted?: number
  filesModified?: string[]
}

export interface IterationRecord {
  iteration: number
  taskId: string
  action: string
  result: string
  durationMs: number
  timestamp: Date
  success: boolean
  filesModified: string[]
  toolsUsed: string[]
  learnings: string[]
  gateReportId?: string  // Links to QualityGate store
}

export interface LoopConfig {
  agentId: string
  projectPath: string
  maxIterations: number
  timeoutMs: number
  qualityGateCommands: {
    typecheck?: string
    test?: string
    lint?: string
  }
  autoCommit: boolean
  syncToAgentsMd: boolean
  autoArchive: boolean  // Auto-archive on completion
}

export interface LoopMetrics {
  totalIterations: number
  totalTimeMs: number
  avgIterationMs: number
  successRate: number
  tasksCompleted: number
  tasksTotal: number
  errorsEncountered: number
  recoveriesAttempted: number
  recoveriesSuccessful: number
}

export type LoopStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

export interface LoopState {
  // Identity
  id: string | null
  agentId: string | null
  projectPath: string

  // Status
  status: LoopStatus
  
  // Progress
  currentIteration: number
  maxIterations: number
  progress: number  // 0.0 to 1.0
  
  // Tasks
  tasks: Task[]
  completedTasks: number
  totalTasks: number
  currentTask: Task | null
  currentAction: string
  
  // History
  iterations: IterationRecord[]
  
  // Metrics
  startTime: Date | null
  endTime: Date | null
  totalDurationMs: number
  avgIterationMs: number
  successRate: number
  
  // Error tracking
  lastError: string | null
  consecutiveErrors: number
  
  // Quality gate integration
  lastGateReportId: string | null
  
  // Archive integration
  lastArchiveId: string | null
  
  // Actions
  startLoop: (config: LoopConfig) => Promise<void>
  pauseLoop: () => void
  resumeLoop: () => void
  cancelLoop: () => void
  retryFromIteration: (iteration: number) => void
  
  // Task management
  updateTaskStatus: (taskId: string, passes: boolean) => void
  addTask: (task: Task) => void
  removeTask: (taskId: string) => void
  
  // Iteration tracking
  recordIteration: (record: IterationRecord) => void
  setCurrentAction: (action: string) => void
  
  // Metrics
  updateMetrics: (metrics: Partial<LoopMetrics>) => void
  
  // Integration
  setLastGateReportId: (id: string) => void
  setLastArchiveId: (id: string) => void
  
  // Reset
  resetLoop: () => void
}

// ============================================
// STORE IMPLEMENTATION
// ============================================

export const useLoopStore = create<LoopState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    id: null,
    agentId: null,
    projectPath: '',
    status: 'idle',
    currentIteration: 0,
    maxIterations: 20,
    progress: 0,
    tasks: [],
    completedTasks: 0,
    totalTasks: 0,
    currentTask: null,
    currentAction: '',
    iterations: [],
    startTime: null,
    endTime: null,
    totalDurationMs: 0,
    avgIterationMs: 0,
    successRate: 1.0,
    lastError: null,
    consecutiveErrors: 0,
    lastGateReportId: null,
    lastArchiveId: null,

    // ============================================
    // ACTIONS
    // ============================================

    startLoop: async (config) => {
      const loopId = `loop-${Date.now()}`
      
      // Load tasks from prd.json
      const tasks = await invoke<Task[]>('load_prd_json', {
        projectPath: config.projectPath
      })
      
      set({
        id: loopId,
        agentId: config.agentId,
        projectPath: config.projectPath,
        status: 'running',
        currentIteration: 0,
        maxIterations: config.maxIterations,
        progress: 0,
        tasks,
        completedTasks: tasks.filter(t => t.passes).length,
        totalTasks: tasks.length,
        iterations: [],
        startTime: new Date(),
        endTime: null,
        errorsEncountered: 0,
        consecutiveErrors: 0,
      })

      // Start the loop controller in Rust backend
      await invoke('start_loop', { loopId, config })
    },

    pauseLoop: () => {
      set({ status: 'paused' })
      invoke('pause_loop', { loopId: get().id })
    },

    resumeLoop: () => {
      set({ status: 'running' })
      invoke('resume_loop', { loopId: get().id })
    },

    cancelLoop: () => {
      set({ status: 'cancelled', endTime: new Date() })
      invoke('cancel_loop', { loopId: get().id })
    },

    retryFromIteration: (iteration) => {
      set({ 
        status: 'running',
        currentIteration: iteration - 1,
        consecutiveErrors: 0,
      })
      invoke('retry_loop', { loopId: get().id, fromIteration: iteration })
    },

    updateTaskStatus: (taskId, passes) => {
      set((state) => {
        const tasks = state.tasks.map(t => 
          t.id === taskId ? { ...t, passes } : t
        )
        const completedTasks = tasks.filter(t => t.passes).length
        
        // Sync to prd.json file
        invoke('sync_prd_json', {
          projectPath: state.projectPath,
          tasks
        })
        
        return {
          tasks,
          completedTasks,
          progress: completedTasks / tasks.length,
        }
      })
    },

    addTask: (task) => {
      set((state) => ({
        tasks: [...state.tasks, task],
        totalTasks: state.totalTasks + 1,
      }))
    },

    removeTask: (taskId) => {
      set((state) => ({
        tasks: state.tasks.filter(t => t.id !== taskId),
        totalTasks: state.totalTasks - 1,
      }))
    },

    recordIteration: (record) => {
      set((state) => {
        const iterations = [...state.iterations, record]
        const totalDurationMs = iterations.reduce((sum, r) => sum + r.durationMs, 0)
        const avgIterationMs = totalDurationMs / iterations.length
        const successCount = iterations.filter(r => r.success).length
        const successRate = successCount / iterations.length
        
        return {
          iterations,
          currentIteration: record.iteration,
          totalDurationMs,
          avgIterationMs,
          successRate,
          consecutiveErrors: record.success ? 0 : state.consecutiveErrors + 1,
          lastError: record.success ? null : record.result,
        }
      })
    },

    setCurrentAction: (action) => {
      set({ currentAction: action })
    },

    updateMetrics: (metrics) => {
      set((state) => ({
        ...state,
        ...metrics,
      }))
    },

    setLastGateReportId: (id) => {
      set({ lastGateReportId: id })
    },

    setLastArchiveId: (id) => {
      set({ lastArchiveId: id })
    },

    resetLoop: () => {
      set({
        id: null,
        status: 'idle',
        currentIteration: 0,
        progress: 0,
        tasks: [],
        iterations: [],
        startTime: null,
        endTime: null,
        lastError: null,
        consecutiveErrors: 0,
      })
    },
  }))
)

// ============================================
// SUBSCRIPTIONS
// ============================================

// Auto-save to SQLite every 5 seconds
useLoopStore.subscribe(
  (state) => state.iterations,
  (iterations) => {
    if (iterations.length > 0) {
      invoke('save_loop_metrics', {
        loopId: useLoopStore.getState().id,
        iterations,
      })
    }
  },
  { fireImmediately: false }
)

// Auto-update progress bar
useLoopStore.subscribe(
  (state) => state.progress,
  (progress) => {
    // Emit event for terminal panel to show progress
    emit('loop:progress', { progress })
  }
)

// Auto-pause on consecutive errors
useLoopStore.subscribe(
  (state) => state.consecutiveErrors,
  (consecutiveErrors) => {
    if (consecutiveErrors >= 3) {
      useLoopStore.getState().pauseLoop()
      emit('loop:error_limit', { consecutiveErrors })
    }
  }
)

// Auto-archive on loop completion
useLoopStore.subscribe(
  (state) => state.status,
  (status) => {
    if (status === 'completed') {
      // Trigger archive if auto-archive is enabled
      emit('loop:completed', { loopId: useLoopStore.getState().id })
    }
  }
)
```

### 2. Quality Gate Store (`useQualityGateStore`)

```typescript
// stores/qualityGateStore.ts
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { invoke } from '@tauri-apps/api/core'

// ============================================
// TYPES
// ============================================

export interface GateCommand {
  id: string
  name: string
  command: string
  workingDirectory?: string
  envVars: Record<string, string>
  enabled: boolean
  blocking: boolean
}

export interface ParsedError {
  file: string
  line: number
  column: number
  message: string
  severity: 'Error' | 'Warning' | 'Info'
  code: string | null
}

export interface GateResult {
  gateId: string
  gateName: string
  passed: boolean
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
  startedAt: Date
  completedAt: Date
  errorMessage: string | null
  parsedErrors: ParsedError[]
}

export interface QualityGateReport {
  id: string
  loopId: string | null
  passed: boolean
  results: GateResult[]
  totalDurationMs: number
  gatesPassed: number
  gatesFailed: number
  gatesSkipped: number
  commitAllowed: boolean
  summary: string
  timestamp: Date
}

export interface QualityGateConfig {
  typecheck: GateCommand | null
  test: GateCommand | null
  lint: GateCommand | null
  build: GateCommand | null
  custom: GateCommand[]
  timeoutSeconds: number
  failFast: boolean
  parallel: boolean
}

export interface QualityGateState {
  // Current report
  currentReport: QualityGateReport | null
  
  // History of reports
  reportHistory: QualityGateReport[]
  
  // Configuration
  config: QualityGateConfig
  
  // UI state
  isRunning: boolean
  showDetails: boolean
  selectedGateId: string | null
  
  // Loop integration
  linkedLoopId: string | null
  
  // Actions
  runQualityGates: (loopId?: string) => Promise<QualityGateReport>
  selectGate: (gateId: string | null) => void
  toggleDetails: () => void
  clearHistory: () => void
  
  // Configuration
  updateConfig: (config: Partial<QualityGateConfig>) => void
  autoDetectConfig: (projectPath: string) => Promise<void>
  
  // Integration
  setLinkedLoopId: (loopId: string | null) => void
  
  // Reset
  resetStore: () => void
}

// ============================================
// DEFAULT CONFIGURATION
// ============================================

const defaultConfig: QualityGateConfig = {
  typecheck: null,
  test: null,
  lint: null,
  build: null,
  custom: [],
  timeoutSeconds: 120,
  failFast: true,
  parallel: false,
}

// ============================================
// STORE IMPLEMENTATION
// ============================================

export const useQualityGateStore = create<QualityGateState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    currentReport: null,
    reportHistory: [],
    config: defaultConfig,
    isRunning: false,
    showDetails: false,
    selectedGateId: null,
    linkedLoopId: null,

    // ============================================
    // ACTIONS
    // ============================================

    runQualityGates: async (loopId?: string) => {
      set({ isRunning: true })
      
      try {
        const report = await invoke<QualityGateReport>('run_quality_gates', {
          config: get().config,
          loopId: loopId || get().linkedLoopId,
        })
        
        set((state) => ({
          currentReport: report,
          reportHistory: [report, ...state.reportHistory].slice(0, 50),
          isRunning: false,
        }))
        
        // Link to loop store if loopId provided
        if (loopId) {
          set({ linkedLoopId: loopId })
        }
        
        return report
      } catch (e) {
        set({ isRunning: false })
        throw e
      }
    },

    selectGate: (gateId) => {
      set({ selectedGateId: gateId })
    },

    toggleDetails: () => {
      set((state) => ({ showDetails: !state.showDetails }))
    },

    clearHistory: () => {
      set({ reportHistory: [], currentReport: null })
    },

    updateConfig: (updates) => {
      set((state) => ({
        config: { ...state.config, ...updates }
      }))
    },

    autoDetectConfig: async (projectPath) => {
      try {
        const config = await invoke<QualityGateConfig>('auto_detect_quality_gate_config', {
          projectPath
        })
        set({ config })
      } catch (e) {
        console.error('Failed to auto-detect quality gate config:', e)
      }
    },

    setLinkedLoopId: (loopId) => {
      set({ linkedLoopId: loopId })
    },

    resetStore: () => {
      set({
        currentReport: null,
        reportHistory: [],
        isRunning: false,
        selectedGateId: null,
      })
    },
  }))
)

// ============================================
// SUBSCRIPTIONS
// ============================================

// Auto-validate before commit when loop is running
useQualityGateStore.subscribe(
  (state) => state.currentReport,
  (report) => {
    if (report && !report.commitAllowed) {
      emit('quality_gate:failed', { report })
    }
  }
)

// Track gate execution metrics
useQualityGateStore.subscribe(
  (state) => state.reportHistory,
  (history) => {
    if (history.length > 0) {
      const latest = history[0]
      invoke('save_gate_metrics', {
        reportId: latest.id,
        metrics: {
          totalDurationMs: latest.totalDurationMs,
          gatesPassed: latest.gatesPassed,
          gatesFailed: latest.gatesFailed,
          commitAllowed: latest.commitAllowed,
        }
      })
    }
  },
  { fireImmediately: false }
)
```

### 3. Archive Store (`useArchiveStore`)

```typescript
// stores/archiveStore.ts
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { invoke } from '@tauri-apps/api/core'

// ============================================
// TYPES
// ============================================

export interface ArchiveManifest {
  id: string
  projectId: string
  branchName: string
  featureName: string
  createdAt: Date
  archivedAt: Date
  status: 'InProgress' | 'Completed' | 'Failed' | 'Cancelled'
  iterationCount: number
  tasksCompleted: number
  tasksTotal: number
  durationMs: number
  filesArchived: string[]
  tags: string[]
}

export interface ArchiveEntry {
  id: string
  manifest: ArchiveManifest
  path: string
  sizeKb: number
}

export interface ArchiveDiff {
  tasksAdded: Task[]
  tasksRemoved: Task[]
  tasksCompleted: Task[]
  iterationsAdded: IterationRecord[]
  filesModified: string[]
}

export interface ArchiveState {
  // Archives list
  archives: ArchiveEntry[]
  selectedArchiveId: string | null
  
  // Current session tracking
  lastBranch: string | null
  currentBranch: string | null
  branchChanged: boolean
  
  // UI state
  isLoading: boolean
  error: string | null
  
  // Loop integration
  linkedLoopId: string | null
  
  // Actions
  loadArchives: () => Promise<void>
  selectArchive: (id: string | null) => void
  archiveSession: () => Promise<ArchiveEntry>
  restoreArchive: (id: string) => Promise<void>
  deleteArchive: (id: string) => Promise<void>
  
  // Branch tracking
  checkBranchChange: () => Promise<boolean>
  archiveOnBranchChange: () => Promise<ArchiveEntry | null>
  
  // Diff viewing
  getArchiveDiff: (id: string) => Promise<ArchiveDiff>
  
  // Integration
  setLinkedLoopId: (loopId: string | null) => void
  
  // Reset
  resetStore: () => void
}

// ============================================
// STORE IMPLEMENTATION
// ============================================

export const useArchiveStore = create<ArchiveState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    archives: [],
    selectedArchiveId: null,
    lastBranch: null,
    currentBranch: null,
    branchChanged: false,
    isLoading: false,
    error: null,
    linkedLoopId: null,

    // ============================================
    // ACTIONS
    // ============================================

    loadArchives: async () => {
      set({ isLoading: true, error: null })
      
      try {
        const archives = await invoke<ArchiveEntry[]>('list_archives')
        set({ archives, isLoading: false })
      } catch (e) {
        set({ error: String(e), isLoading: false })
      }
    },

    selectArchive: (id) => {
      set({ selectedArchiveId: id })
    },

    archiveSession: async () => {
      set({ isLoading: true, error: null })
      
      try {
        const entry = await invoke<ArchiveEntry>('archive_current_session')
        
        // Reload archives list
        await get().loadArchives()
        
        set({ isLoading: false })
        return entry
      } catch (e) {
        set({ error: String(e), isLoading: false })
        throw e
      }
    },

    restoreArchive: async (id) => {
      set({ isLoading: true, error: null })
      
      try {
        await invoke('restore_archive', { archiveId: id })
        
        // Reload archives list
        await get().loadArchives()
        
        set({ isLoading: false })
      } catch (e) {
        set({ error: String(e), isLoading: false })
        throw e
      }
    },

    deleteArchive: async (id) => {
      set({ isLoading: true, error: null })
      
      try {
        await invoke('delete_archive', { archiveId: id })
        
        // Remove from local state
        set((state) => ({
          archives: state.archives.filter(a => a.id !== id),
          selectedArchiveId: state.selectedArchiveId === id ? null : state.selectedArchiveId,
          isLoading: false,
        }))
      } catch (e) {
        set({ error: String(e), isLoading: false })
        throw e
      }
    },

    checkBranchChange: async () => {
      try {
        const changed = await invoke<boolean>('check_branch_change')
        set({ branchChanged: changed })
        return changed
      } catch (e) {
        return false
      }
    },

    archiveOnBranchChange: async () => {
      const changed = await get().checkBranchChange()
      
      if (changed) {
        const entry = await get().archiveSession()
        return entry
      }
      
      return null
    },

    getArchiveDiff: async (id) => {
      try {
        const diff = await invoke<ArchiveDiff>('get_archive_diff', { archiveId: id })
        return diff
      } catch (e) {
        return {
          tasksAdded: [],
          tasksRemoved: [],
          tasksCompleted: [],
          iterationsAdded: [],
          filesModified: [],
        }
      }
    },

    setLinkedLoopId: (loopId) => {
      set({ linkedLoopId: loopId })
    },

    resetStore: () => {
      set({
        archives: [],
        selectedArchiveId: null,
        isLoading: false,
        error: null,
      })
    },
  }))
)

// ============================================
// SUBSCRIPTIONS
// ============================================

// Auto-check branch change every 5 minutes
let branchCheckInterval: NodeJS.Timeout | null = null

useArchiveStore.subscribe(
  (state) => state.isLoading,
  (isLoading) => {
    if (!isLoading && !branchCheckInterval) {
      branchCheckInterval = setInterval(() => {
        useArchiveStore.getState().checkBranchChange()
      }, 5 * 60 * 1000) // 5 minutes
    }
  }
)

// Auto-archive on branch change
useArchiveStore.subscribe(
  (state) => state.branchChanged,
  (branchChanged) => {
    if (branchChanged) {
      useArchiveStore.getState().archiveOnBranchChange()
    }
  }
)

// Track archive metrics
useArchiveStore.subscribe(
  (state) => state.archives,
  (archives) => {
    invoke('save_archive_metrics', {
      totalArchives: archives.length,
      totalSizeKb: archives.reduce((sum, a) => sum + a.sizeKb, 0),
    })
  },
  { fireImmediately: false }
)
```

### 4. Coordinator Store (`useCoordinatorStore`)

```typescript
// stores/coordinatorStore.ts
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { useLoopStore } from './loopStore'
import { useQualityGateStore } from './qualityGateStore'
import { useArchiveStore } from './archiveStore'

// ============================================
// TYPES
// ============================================

export type GlobalStatus = 'idle' | 'loop-running' | 'gate-running' | 'archiving' | 'error'

export interface CoordinatorState {
  // Global status
  globalStatus: GlobalStatus
  activeLoopId: string | null
  activeArchiveId: string | null
  activeGateReportId: string | null
  
  // Event queue
  pendingEvents: Event[]
  
  // Actions
  registerLoop: (loopId: string) => void
  unregisterLoop: (loopId: string) => void
  registerArchive: (archiveId: string) => void
  unregisterArchive: (archiveId: string) => void
  registerGateReport: (reportId: string) => void
  unregisterGateReport: (reportId: string) => void
  
  // Coordination
  syncAll: () => Promise<void>
  handleLoopCompleted: (loopId: string) => Promise<void>
  handleBranchChange: () => Promise<void>
  
  // Event handling
  emitEvent: (event: Event) => void
  processEvents: () => Promise<void>
  
  // Reset
  resetCoordinator: () => void
}

export interface Event {
  type: string
  payload: any
  timestamp: Date
}

// ============================================
// STORE IMPLEMENTATION
// ============================================

export const useCoordinatorStore = create<CoordinatorState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    globalStatus: 'idle',
    activeLoopId: null,
    activeArchiveId: null,
    activeGateReportId: null,
    pendingEvents: [],

    // ============================================
    // ACTIONS
    // ============================================

    registerLoop: (loopId) => {
      set({ activeLoopId: loopId, globalStatus: 'loop-running' })
      
      // Link stores
      useQualityGateStore.getState().setLinkedLoopId(loopId)
      useArchiveStore.getState().setLinkedLoopId(loopId)
    },

    unregisterLoop: (loopId) => {
      if (get().activeLoopId === loopId) {
        set({ activeLoopId: null, globalStatus: 'idle' })
      }
    },

    registerArchive: (archiveId) => {
      set({ activeArchiveId: archiveId, globalStatus: 'archiving' })
    },

    unregisterArchive: (archiveId) => {
      if (get().activeArchiveId === archiveId) {
        set({ activeArchiveId: null, globalStatus: 'idle' })
      }
    },

    registerGateReport: (reportId) => {
      set({ activeGateReportId: reportId, globalStatus: 'gate-running' })
    },

    unregisterGateReport: (reportId) => {
      if (get().activeGateReportId === reportId) {
        set({ activeGateReportId: null, globalStatus: 'idle' })
      }
    },

    syncAll: async () => {
      // Sync all stores
      await Promise.all([
        useLoopStore.getState().iterations.length > 0 && 
          invoke('save_loop_state', { state: useLoopStore.getState() }),
        useArchiveStore.getState().loadArchives(),
      ])
    },

    handleLoopCompleted: async (loopId) => {
      const loopState = useLoopStore.getState()
      
      // Auto-archive if enabled and loop completed
      if (loopState.status === 'completed') {
        const archiveEntry = await useArchiveStore.getState().archiveSession()
        
        if (archiveEntry) {
          useLoopStore.getState().setLastArchiveId(archiveEntry.id)
        }
      }
      
      // Unregister loop
      get().unregisterLoop(loopId)
    },

    handleBranchChange: async () => {
      const changed = await useArchiveStore.getState().checkBranchChange()
      
      if (changed) {
        // Archive current session
        const archiveEntry = await useArchiveStore.getState().archiveSession()
        
        if (archiveEntry && get().activeLoopId) {
          // Notify loop of archive
          emit('loop:archived', {
            loopId: get().activeLoopId,
            archiveId: archiveEntry.id,
          })
        }
      }
    },

    emitEvent: (event) => {
      set((state) => ({
        pendingEvents: [...state.pendingEvents, event]
      }))
      
      // Process events asynchronously
      get().processEvents()
    },

    processEvents: async () => {
      const events = get().pendingEvents
      if (events.length === 0) return
      
      // Process each event
      for (const event of events) {
        switch (event.type) {
          case 'loop:completed':
            await get().handleLoopCompleted(event.payload.loopId)
            break
          case 'branch:changed':
            await get().handleBranchChange()
            break
          case 'gate:failed':
            // Handle quality gate failure
            break
        }
      }
      
      // Clear processed events
      set({ pendingEvents: [] })
    },

    resetCoordinator: () => {
      set({
        globalStatus: 'idle',
        activeLoopId: null,
        activeArchiveId: null,
        activeGateReportId: null,
        pendingEvents: [],
      })
    },
  }))
)

// ============================================
// CROSS-STORE SUBSCRIPTIONS
// ============================================

// When loop completes, trigger archive if needed
useLoopStore.subscribe(
  (state) => state.status,
  (status) => {
    if (status === 'completed') {
      useCoordinatorStore.getState().emitEvent({
        type: 'loop:completed',
        payload: { loopId: useLoopStore.getState().id },
        timestamp: new Date(),
      })
    }
  }
)

// When branch changes, trigger archive
useArchiveStore.subscribe(
  (state) => state.branchChanged,
  (branchChanged) => {
    if (branchChanged) {
      useCoordinatorStore.getState().emitEvent({
        type: 'branch:changed',
        payload: {},
        timestamp: new Date(),
      })
    }
  }
)

// When quality gate fails, pause loop
useQualityGateStore.subscribe(
  (state) => state.currentReport,
  (report) => {
    if (report && !report.commitAllowed) {
      useCoordinatorStore.getState().emitEvent({
        type: 'gate:failed',
        payload: { report },
        timestamp: new Date(),
      })
    }
  }
)
```

---

## Store Integration Patterns

### Pattern 1: Loop → Quality Gate → Archive

```typescript
// Complete workflow: Loop runs → Quality gates validate → Archive on completion
async function runCompleteWorkflow(projectPath: string) {
  // 1. Start loop
  await useLoopStore.getState().startLoop({
    agentId: 'claude',
    projectPath,
    maxIterations: 20,
    timeoutMs: 5 * 60 * 1000,
    qualityGateCommands: {
      typecheck: 'npx tsc --noEmit',
      test: 'npm test',
      lint: 'npx eslint .',
    },
    autoCommit: true,
    syncToAgentsMd: true,
    autoArchive: true,
  })

  // 2. Quality gates run automatically before each commit
  // (handled by LoopController in Rust backend)

  // 3. Archive triggers automatically on loop completion
  // (handled by Coordinator store subscription)
}
```

### Pattern 2: Branch Change → Archive → Fresh Loop

```typescript
// Handle branch change: Archive current → Start fresh
async function handleBranchChange() {
  // 1. Check for branch change
  const changed = await useArchiveStore.getState().checkBranchChange()
  
  if (changed) {
    // 2. Archive current session
    const archive = await useArchiveStore.getState().archiveSession()
    
    // 3. Start new loop on new branch
    await useLoopStore.getState().startLoop({
      agentId: 'claude',
      projectPath: useLoopStore.getState().projectPath,
      maxIterations: 20,
      timeoutMs: 5 * 60 * 1000,
      qualityGateCommands: {
        typecheck: 'npx tsc --noEmit',
        test: 'npm test',
      },
      autoCommit: true,
      syncToAgentsMd: true,
      autoArchive: true,
    })
  }
}
```

### Pattern 3: Quality Gate Failure → Pause → Retry

```typescript
// Handle quality gate failure: Pause loop → Show errors → Retry
async function handleGateFailure(report: QualityGateReport) {
  // 1. Pause loop
  useLoopStore.getState().pauseLoop()
  
  // 2. Show errors in UI
  useQualityGateStore.getState().toggleDetails()
  
  // 3. Wait for user to fix issues
  
  // 4. Retry quality gates
  await useQualityGateStore.getState().runQualityGates()
  
  // 5. Resume loop if gates pass
  if (useQualityGateStore.getState().currentReport?.commitAllowed) {
    useLoopStore.getState().resumeLoop()
  }
}
```

---

## UI Component Integration

### Loop Progress Panel

```tsx
// components/loop/LoopProgressPanel.tsx
import { useLoopStore } from '../../stores/loopStore'
import { useQualityGateStore } from '../../stores/qualityGateStore'
import { useArchiveStore } from '../../stores/archiveStore'

export function LoopProgressPanel() {
  const { status, currentIteration, progress, currentTask } = useLoopStore()
  const { currentReport } = useQualityGateStore()
  const { archives } = useArchiveStore()

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      {/* Loop Status */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-zinc-200">
          Loop {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
        <span className="text-xs text-zinc-500">
          Iteration {currentIteration}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-zinc-800 rounded-full h-2 mb-3">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      {/* Current Task */}
      {currentTask && (
        <div className="text-xs text-zinc-400 mb-3">
          <span className="text-zinc-500">Current:</span>{' '}
          <span className="text-zinc-300">{currentTask.title}</span>
        </div>
      )}

      {/* Quality Gate Status */}
      {currentReport && (
        <div className="text-xs text-zinc-400 mb-3">
          <span className="text-zinc-500">Gates:</span>{' '}
          <span className={currentReport.passed ? 'text-green-400' : 'text-red-400'}>
            {currentReport.gatesPassed}/{currentReport.gatesPassed + currentReport.gatesFailed} passed
          </span>
        </div>
      )}

      {/* Archive Count */}
      <div className="text-xs text-zinc-500">
        {archives.length} archives
      </div>
    </div>
  )
}
```

### Unified Control Panel

```tsx
// components/loop/UnifiedControlPanel.tsx
import { useLoopStore } from '../../stores/loopStore'
import { useQualityGateStore } from '../../stores/qualityGateStore'
import { useArchiveStore } from '../../stores/archiveStore'
import { Button } from '../ui/button'
import { Loader2, Pause, Play, X, Archive } from 'lucide-react'

export function UnifiedControlPanel() {
  const { status, pauseLoop, resumeLoop, cancelLoop } = useLoopStore()
  const { isRunning: gateRunning } = useQualityGateStore()
  const { archiveSession, isLoading: archiveLoading } = useArchiveStore()

  const isRunning = status === 'running' || gateRunning
  const isPaused = status === 'paused'

  return (
    <div className="flex gap-2">
      {isRunning && (
        <Button variant="outline" size="sm" onClick={pauseLoop}>
          <Pause className="w-3 h-3 mr-1" />
          Pause
        </Button>
      )}
      {isPaused && (
        <Button variant="primary" size="sm" onClick={resumeLoop}>
          <Play className="w-3 h-3 mr-1" />
          Resume
        </Button>
      )}
      {(isRunning || isPaused) && (
        <Button variant="ghost" size="sm" onClick={cancelLoop}>
          <X className="w-3 h-3 mr-1" />
          Cancel
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={archiveSession}
        disabled={archiveLoading}
      >
        <Archive className="w-3 h-3 mr-1" />
        Archive
      </Button>
    </div>
  )
}
```

---

## Store Usage Guidelines

### When to Use Each Store

| Store | Use When |
|-------|----------|
| `useLoopStore` | Tracking loop execution, tasks, iterations, progress |
| `useQualityGateStore` | Running quality gates, viewing gate results, configuring gates |
| `useArchiveStore` | Archiving sessions, restoring archives, tracking branches |
| `useCoordinatorStore` | Coordinating between stores, handling cross-cutting events |

### Store Access Patterns

```typescript
// ✅ Correct: Access specific store for specific concerns
const { status, progress } = useLoopStore()
const { currentReport } = useQualityGateStore()
const { archives } = useArchiveStore()

// ✅ Correct: Use coordinator for cross-cutting concerns
const { globalStatus, syncAll } = useCoordinatorStore()

// ❌ Wrong: Don't mix stores unnecessarily
const { status, currentReport } = useLoopStore() // currentReport belongs to qualityGateStore
```

### Subscription Best Practices

```typescript
// ✅ Good: Use subscribeWithSelector for selective subscriptions
useLoopStore.subscribe(
  (state) => state.status,  // Only subscribe to status
  (status) => {
    // Handle status change
  }
)

// ❌ Bad: Don't subscribe to entire state
useLoopStore.subscribe((state) => {
  // This runs on every state change
})
```

---

## Performance Considerations

### State Normalization

```typescript
// Normalize iteration records for better performance
interface NormalizedLoopState {
  // Store iterations as a map for O(1) lookup
  iterationsById: Record<number, IterationRecord>
  iterationIds: number[]  // Ordered list of iteration IDs
  
  // Derived state (computed, not stored)
  getIteration: (id: number) => IterationRecord | undefined
  getIterationsInRange: (start: number, end: number) => IterationRecord[]
}
```

### Memoization

```typescript
// Use selectors for derived state
const selectCompletedTasks = (state: LoopState) => 
  state.tasks.filter(t => t.passes)

const selectProgress = (state: LoopState) =>
  state.completedTasks / state.totalTasks

// Components only re-render when selected state changes
const completedTasks = useLoopStore(selectCompletedTasks)
const progress = useLoopStore(selectProgress)
```

### Batch Updates

```typescript
// Batch multiple state updates
useLoopStore.setState({
  currentIteration: record.iteration,
  totalDurationMs: newDuration,
  avgIterationMs: newAvg,
  successRate: newRate,
})
```

---

## Testing Strategy

### Unit Tests

```typescript
// stores/__tests__/loopStore.test.ts
describe('useLoopStore', () => {
  it('should start loop with config', async () => {
    const { startLoop } = useLoopStore.getState()
    
    await startLoop({
      agentId: 'claude',
      projectPath: '/test/project',
      maxIterations: 10,
      timeoutMs: 60000,
      qualityGateCommands: {},
      autoCommit: false,
      syncToAgentsMd: false,
      autoArchive: false,
    })
    
    const state = useLoopStore.getState()
    expect(state.status).toBe('running')
    expect(state.id).toBeTruthy()
  })

  it('should record iteration and update metrics', () => {
    const { recordIteration } = useLoopStore.getState()
    
    recordIteration({
      iteration: 1,
      taskId: 'US-001',
      action: 'Implement feature',
      result: 'Success',
      durationMs: 5000,
      timestamp: new Date(),
      success: true,
      filesModified: ['src/feature.ts'],
      toolsUsed: ['typescript'],
      learnings: [],
    })
    
    const state = useLoopStore.getState()
    expect(state.iterations).toHaveLength(1)
    expect(state.successRate).toBe(1)
  })
})
```

### Integration Tests

```typescript
// stores/__tests__/integration.test.ts
describe('Store Integration', () => {
  it('should coordinate loop completion with archive', async () => {
    // Start loop
    await useLoopStore.getState().startLoop(mockConfig)
    
    // Complete loop
    useLoopStore.setState({ status: 'completed' })
    
    // Wait for coordinator to process
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Check archive was created
    const archives = useArchiveStore.getState().archives
    expect(archives.length).toBeGreaterThan(0)
  })
})
```

---

## Migration Guide

### From Individual Stores to Unified Store

```typescript
// Before: Individual stores
import { useLoopStore } from './loopStore'
import { useQualityGateStore } from './qualityGateStore'
import { useArchiveStore } from './archiveStore'

// After: Unified store with coordinator
import { useLoopStore } from './loopStore'
import { useQualityGateStore } from './qualityGateStore'
import { useArchiveStore } from './archiveStore'
import { useCoordinatorStore } from './coordinatorStore'

// Use coordinator for cross-cutting concerns
const { syncAll, handleLoopCompleted } = useCoordinatorStore()
```

---

## Implementation Checklist

- [ ] Loop Store
  - [ ] Implement LoopState interface
  - [ ] Implement all actions
  - [ ] Add subscriptions for auto-save
  - [ ] Add subscriptions for progress updates
  - [ ] Add subscriptions for auto-pause on errors

- [ ] Quality Gate Store
  - [ ] Implement QualityGateState interface
  - [ ] Implement all actions
  - [ ] Add subscriptions for gate failure handling
  - [ ] Add subscriptions for metrics tracking

- [ ] Archive Store
  - [ ] Implement ArchiveState interface
  - [ ] Implement all actions
  - [ ] Add subscriptions for branch change detection
  - [ ] Add subscriptions for metrics tracking

- [ ] Coordinator Store
  - [ ] Implement CoordinatorState interface
  - [ ] Implement all actions
  - [ ] Add cross-store subscriptions
  - [ ] Implement event processing

- [ ] UI Components
  - [ ] LoopProgressPanel
  - [ ] UnifiedControlPanel
  - [ ] QualityGateStatusBar
  - [ ] ArchiveSidebar

- [ ] Testing
  - [ ] Unit tests for each store
  - [ ] Integration tests for store coordination
  - [ ] E2E tests for complete workflows

---

## References

- [LOOPS.md](./LOOPS.md) — Loop architecture
- [MOTHERSHIP-RALPH.md](./MOTHERSHIP-RALPH.md) — Ralph implementation
- [QUALITY-GATE.md](./QUALITY-GATE.md) — Quality gate design
- [AUTO-ARCHIVE.md](./AUTO-ARCHIVE.md) — Archive system design
- [Zustand Documentation](https://docs.pmnd.rs/zustand/getting-started/introduction) — State management

---

*Last updated: 2026-06-16*
