import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

// --- Types matching PLANS/MOTHERSHIP-RALPH-GLOSSARY.md ---

export interface GateCommand {
  id: string
  name: string
  command: string
  workingDirectory?: string
  envVars: Record<string, string>
  enabled: boolean
  blocking: boolean
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

export interface ParsedError {
  file: string
  line: number
  column: number
  message: string
  severity: 'Error' | 'Warning' | 'Info'
  code: string | null
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

// --- Store ---

interface QualityGateState {
  currentReport: QualityGateReport | null
  reportHistory: QualityGateReport[]
  config: QualityGateConfig | null
  isRunning: boolean
  showDetails: boolean
  selectedGateId: string | null
  linkedLoopId: string | null

  runQualityGates: (config: QualityGateConfig, projectPath: string) => Promise<QualityGateReport>
  autoDetectConfig: (projectPath: string) => Promise<void>
  selectGate: (gateId: string | null) => void
  toggleDetails: () => void
  clearHistory: () => void
  resetStore: () => void
}

export const useQualityGateStore = create<QualityGateState>()((set) => ({
  currentReport: null,
  reportHistory: [],
  config: null,
  isRunning: false,
  showDetails: false,
  selectedGateId: null,
  linkedLoopId: null,

  runQualityGates: async (config, projectPath) => {
    set({ isRunning: true })
    try {
      const report = await invoke<QualityGateReport>('run_quality_gates', {
        config,
        projectPath,
      })
      set((state) => ({
        currentReport: report,
        reportHistory: [report, ...state.reportHistory].slice(0, 50),
        isRunning: false,
      }))
      return report
    } catch (e) {
      set({ isRunning: false })
      throw e
    }
  },

  autoDetectConfig: async (projectPath) => {
    try {
      const config = await invoke<QualityGateConfig>('auto_detect_quality_gate_config', {
        projectPath,
      })
      set({ config })
    } catch (e) {
      console.error('Failed to auto-detect quality gate config:', e)
    }
  },

  selectGate: (gateId) => set({ selectedGateId: gateId }),
  toggleDetails: () => set((state) => ({ showDetails: !state.showDetails })),
  clearHistory: () => set({ reportHistory: [], currentReport: null }),
  resetStore: () =>
    set({
      currentReport: null,
      reportHistory: [],
      config: null,
      isRunning: false,
      showDetails: false,
      selectedGateId: null,
      linkedLoopId: null,
    }),
}))
