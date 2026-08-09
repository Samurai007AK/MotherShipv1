import { useState, useEffect, useCallback } from 'react'
import { useWorktreeStore, type PresetDefinition, type WorkspacePresetConfig, type WorktreeInfo } from '../../stores/worktreeStore'
import {
  Settings2,
  Plus,
  Trash2,
  Play,
  Save,
  X,
  ChevronDown,
  ChevronRight,
  Terminal,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Copy,
  Lightbulb,
} from 'lucide-react'

// ── Props ─────────────────────────────────────────────────────────────────

interface PresetPanelProps {
  projectPath: string
  worktrees: WorktreeInfo[]
  onClose?: () => void
}

// ── Default skeleton for a new preset ─────────────────────────────────────

function emptyPreset(): PresetDefinition {
  return {
    name: '',
    description: '',
    base_branch: 'main',
    setup: [],
    teardown: [],
    run: [],
    env: {},
    agent_id: '',
  }
}

// ── Main PresetPanel Component ────────────────────────────────────────────

export function PresetPanel({ projectPath, worktrees, onClose }: PresetPanelProps) {
  const { readPresetConfig, savePresetConfig, runPresetSetup } = useWorktreeStore()
  const [config, setConfig] = useState<WorkspacePresetConfig>({ setup: [], teardown: [], presets: [] })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [expandedPreset, setExpandedPreset] = useState<string | null>(null)
  const [globalSetupText, setGlobalSetupText] = useState('')
  const [globalTeardownText, setGlobalTeardownText] = useState('')
  const [runOutput, setRunOutput] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  // Load config on mount
  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    readPresetConfig(projectPath).then((cfg) => {
      if (cancelled) return
      setConfig(cfg)
      setGlobalSetupText(cfg.setup.join('\n'))
      setGlobalTeardownText(cfg.teardown.join('\n'))
      setIsLoading(false)
    })
    return () => { cancelled = true }
  }, [projectPath, readPresetConfig])

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    // Parse global setup/teardown text into arrays
    const newConfig: WorkspacePresetConfig = {
      setup: globalSetupText.split('\n').map((l) => l.trim()).filter(Boolean),
      teardown: globalTeardownText.split('\n').map((l) => l.trim()).filter(Boolean),
      presets: config.presets,
    }

    // Validate preset names
    for (const p of newConfig.presets) {
      if (!p.name.trim()) {
        setSaveError('All presets must have a name')
        setIsSaving(false)
        return
      }
    }

    try {
      await savePresetConfig(projectPath, newConfig)
      setConfig(newConfig)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (e) {
      setSaveError(String(e))
    } finally {
      setIsSaving(false)
    }
  }, [config, globalSetupText, globalTeardownText, projectPath, savePresetConfig])

  const handleAddPreset = () => {
    const newPreset = emptyPreset()
    newPreset.name = `preset-${config.presets.length + 1}`
    setConfig((prev) => ({
      ...prev,
      presets: [...prev.presets, newPreset],
    }))
    setExpandedPreset(newPreset.name)
  }

  const handleRemovePreset = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      presets: prev.presets.filter((_, i) => i !== index),
    }))
    if (expandedPreset === config.presets[index]?.name) {
      setExpandedPreset(null)
    }
  }

  const handleUpdatePreset = (index: number, updates: Partial<PresetDefinition>) => {
    setConfig((prev) => ({
      ...prev,
      presets: prev.presets.map((p, i) => (i === index ? { ...p, ...updates } : p)),
    }))
  }

  const handleRunCommands = async (
    commands: string[],
    worktreePath: string,
    env: Record<string, string> | undefined,
    label: string,
  ) => {
    if (commands.length === 0) return
    setIsRunning(true)
    setRunOutput(null)

    try {
      const result = await runPresetSetup(worktreePath, commands, env)
      setRunOutput(
        result.success
          ? `✅ ${label} completed\n\n${result.stdout}`
          : `❌ ${label} failed (exit ${result.exit_code})\n\n${result.stderr || result.stdout}`,
      )
    } catch (e) {
      setRunOutput(`❌ Error: ${e}`)
    } finally {
      setIsRunning(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-c-muted">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-xs">Loading preset config...</span>
      </div>
    )
  }

  return (
    <div className="border border-c-border rounded overflow-hidden bg-c-card" onClick={(e) => e.stopPropagation()}>
      {/* ── Header ────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-c-border bg-c-surface/50">
        <div className="flex items-center gap-2">
          <Settings2 className="w-3.5 h-3.5 text-mothership-400" />
          <span className="text-[11px] font-medium text-c-text">Workspace Presets</span>
          <span className="text-[9px] text-c-muted-light font-mono">.mothership/config.json</span>
        </div>
        <div className="flex items-center gap-1">
          {saveSuccess && (
            <span className="text-[9px] text-green-500 flex items-center gap-0.5">
              <CheckCircle2 className="w-2.5 h-2.5" /> Saved
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1 px-2 py-1 text-[10px] bg-mothership-600 hover:bg-mothership-500 disabled:opacity-50 text-white rounded transition-colors"
          >
            {isSaving ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Save className="w-2.5 h-2.5" />}
            Save
          </button>
          {onClose && (
            <button
              onClick={onClose}
              title="Close preset panel"
              className="p-1 rounded text-c-muted-light hover:text-c-text hover:bg-c-surface transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {saveError && (
        <div className="px-3 py-1.5 bg-red-500/10 border-b border-c-border">
          <span className="text-[10px] text-red-400 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {saveError}
          </span>
        </div>
      )}

      {/* ── Content ───────────────────────────────────── */}
      <div className="max-h-[500px] overflow-y-auto">
        {/* Global Setup */}
        <div className="px-3 py-2 border-b border-c-border">
          <label className="text-[10px] text-c-muted-light font-medium mb-1 block">
            Global Setup Commands
            <span className="font-normal text-c-muted-light ml-1">(run on every workspace creation)</span>
          </label>
          <textarea
            value={globalSetupText}
            onChange={(e) => setGlobalSetupText(e.target.value)}
            placeholder="# One command per line (e.g.,&#10;npm install&#10;.superset/setup.sh"
            rows={3}
            className="w-full bg-c-surface border border-c-border rounded px-2 py-1.5 text-[10px] font-mono text-c-text placeholder:text-c-muted-light focus:outline-none focus:border-mothership-500 transition-colors resize-none"
          />
        </div>

        {/* Global Teardown */}
        <div className="px-3 py-2 border-b border-c-border">
          <label className="text-[10px] text-c-muted-light font-medium mb-1 block">
            Global Teardown Commands
            <span className="font-normal text-c-muted-light ml-1">(run on every workspace deletion)</span>
          </label>
          <textarea
            value={globalTeardownText}
            onChange={(e) => setGlobalTeardownText(e.target.value)}
            placeholder="# Commands to clean up when a workspace is deleted"
            rows={2}
            className="w-full bg-c-surface border border-c-border rounded px-2 py-1.5 text-[10px] font-mono text-c-text placeholder:text-c-muted-light focus:outline-none focus:border-mothership-500 transition-colors resize-none"
          />
        </div>

        {/* Named Presets */}
        <div className="px-3 py-2 border-b border-c-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-c-muted-light font-medium">Named Presets</span>
            <button
              onClick={handleAddPreset}
              className="flex items-center gap-1 text-[10px] text-mothership-400 hover:text-mothership-300 transition-colors"
            >
              <Plus className="w-2.5 h-2.5" /> Add Preset
            </button>
          </div>

          {config.presets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-4 text-c-muted-light">
              <Lightbulb className="w-5 h-5 mb-1" />
              <p className="text-[10px] text-center">
                No named presets yet. Add presets to quickly create workspaces with predefined setup, teardown, and run commands.
              </p>
            </div>
          )}

          {config.presets.map((preset, index) => (
            <div key={index} className="mb-2 last:mb-0">
              {/* Preset header */}
              <div
                className="flex items-center gap-2 px-2 py-1.5 rounded bg-c-surface/50 border border-c-border cursor-pointer hover:bg-c-surface transition-colors"
                onClick={() => setExpandedPreset(expandedPreset === preset.name ? null : preset.name)}
              >
                <button className="p-0.5 text-c-muted-light">
                  {expandedPreset === preset.name ? (
                    <ChevronDown className="w-2.5 h-2.5" />
                  ) : (
                    <ChevronRight className="w-2.5 h-2.5" />
                  )}
                </button>
                <input
                  value={preset.name}
                  onChange={(e) => {
                    e.stopPropagation()
                    handleUpdatePreset(index, { name: e.target.value })
                    setExpandedPreset(e.target.value)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Preset name"
                  className="flex-1 bg-transparent text-[11px] font-medium text-c-text placeholder:text-c-muted-light focus:outline-none border-b border-transparent focus:border-mothership-500"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemovePreset(index)
                  }}
                  className="p-1 rounded text-c-muted-light hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Remove preset"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              </div>

              {/* Expanded preset editor */}
              {expandedPreset === preset.name && (
                <div className="px-4 py-2 space-y-2 bg-c-bg/30">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[9px] text-c-muted-light block mb-0.5">Description</label>
                      <input
                        value={preset.description || ''}
                        onChange={(e) => handleUpdatePreset(index, { description: e.target.value })}
                        placeholder="What this preset does"
                        className="w-full bg-c-surface border border-c-border rounded px-2 py-1 text-[10px] text-c-text placeholder:text-c-muted-light focus:outline-none focus:border-mothership-500 transition-colors"
                      />
                    </div>
                    <div className="w-24">
                      <label className="text-[9px] text-c-muted-light block mb-0.5">Base branch</label>
                      <input
                        value={preset.base_branch || ''}
                        onChange={(e) => handleUpdatePreset(index, { base_branch: e.target.value })}
                        placeholder="main"
                        className="w-full bg-c-surface border border-c-border rounded px-2 py-1 text-[10px] font-mono text-c-text placeholder:text-c-muted-light focus:outline-none focus:border-mothership-500 transition-colors"
                      />
                    </div>
                    <div className="w-24">
                      <label className="text-[9px] text-c-muted-light block mb-0.5">Agent</label>
                      <select
                        value={preset.agent_id || ''}
                        onChange={(e) => handleUpdatePreset(index, { agent_id: e.target.value || undefined })}
                        className="w-full bg-c-surface border border-c-border rounded px-2 py-1 text-[10px] text-c-text focus:outline-none focus:border-mothership-500 transition-colors"
                      >
                        <option value="">Default</option>
                        <option value="claude">Claude</option>
                        <option value="codex">Codex</option>
                        <option value="opencode">OpenCode</option>
                        <option value="gemini">Gemini</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[9px] text-c-muted-light block mb-0.5 flex items-center gap-1">
                        <Play className="w-2 h-2 text-green-500" /> Setup commands
                      </label>
                      <textarea
                        value={preset.setup.join('\n')}
                        onChange={(e) =>
                          handleUpdatePreset(index, {
                            setup: e.target.value.split('\n').filter(Boolean),
                          })
                        }
                        placeholder="npm install&#10;cp .env.example .env"
                        rows={3}
                        className="w-full bg-c-surface border border-c-border rounded px-2 py-1 text-[9px] font-mono text-c-text placeholder:text-c-muted-light focus:outline-none focus:border-mothership-500 transition-colors resize-none"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-c-muted-light block mb-0.5 flex items-center gap-1">
                        <Trash2 className="w-2 h-2 text-red-500" /> Teardown commands
                      </label>
                      <textarea
                        value={preset.teardown.join('\n')}
                        onChange={(e) =>
                          handleUpdatePreset(index, {
                            teardown: e.target.value.split('\n').filter(Boolean),
                          })
                        }
                        placeholder="docker compose down&#10;rm -rf node_modules"
                        rows={3}
                        className="w-full bg-c-surface border border-c-border rounded px-2 py-1 text-[9px] font-mono text-c-text placeholder:text-c-muted-light focus:outline-none focus:border-mothership-500 transition-colors resize-none"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-c-muted-light block mb-0.5 flex items-center gap-1">
                        <Terminal className="w-2 h-2 text-mothership-400" /> Run commands
                      </label>
                      <textarea
                        value={preset.run.join('\n')}
                        onChange={(e) =>
                          handleUpdatePreset(index, {
                            run: e.target.value.split('\n').filter(Boolean),
                          })
                        }
                        placeholder="npm run dev&#10;bun run start"
                        rows={3}
                        className="w-full bg-c-surface border border-c-border rounded px-2 py-1 text-[9px] font-mono text-c-text placeholder:text-c-muted-light focus:outline-none focus:border-mothership-500 transition-colors resize-none"
                      />
                    </div>
                  </div>

                  {/* Quick-run buttons on worktrees */}
                  {worktrees.length > 0 && (
                    <div className="pt-1">
                      <label className="text-[9px] text-c-muted-light block mb-1">Quick Run on Workspace</label>
                      <div className="flex flex-wrap gap-1">
                        {worktrees.slice(0, 5).map((wt) => (
                          <button
                            key={wt.id}
                            onClick={() => handleRunCommands(preset.setup, wt.worktreePath, preset.env, preset.name)}
                            disabled={isRunning}
                            className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] bg-c-surface border border-c-border rounded hover:bg-mothership-600/10 disabled:opacity-50 transition-colors"
                          >
                            <Play className="w-2 h-2" />
                            <span className="font-mono truncate max-w-[80px]">{wt.branchName}</span>
                          </button>
                        ))}
                        {worktrees.length > 5 && (
                          <span className="text-[9px] text-c-muted-light self-center">+{worktrees.length - 5} more</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Env vars */}
                  <div>
                    <label className="text-[9px] text-c-muted-light block mb-0.5">Environment Variables</label>
                    <div className="flex flex-wrap gap-1">
                      {preset.env && Object.entries(preset.env).map(([key, val]) => (
                        <span
                          key={key}
                          className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-c-surface border border-c-border"
                        >
                          <span className="text-c-text">{key}</span>
                          <span className="text-c-muted-light">=</span>
                          <span className="text-mothership-400">{val}</span>
                        </span>
                      ))}
                      <button
                        onClick={() => {
                          const key = prompt('Variable name:')
                          const val = prompt('Variable value:')
                          if (key && val !== null) {
                            handleUpdatePreset(index, {
                              env: { ...(preset.env || {}), [key]: val || '' },
                            })
                          }
                        }}
                        className="inline-flex items-center gap-0.5 text-[9px] text-c-muted-light hover:text-c-text px-1 py-0.5 rounded hover:bg-c-surface transition-colors"
                      >
                        <Plus className="w-2 h-2" /> Add env
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Run output */}
        {runOutput && (
          <div className="px-3 py-2 border-b border-c-border">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-c-muted-light font-medium">Output</span>
              <button
                onClick={() => setRunOutput(null)}
                className="p-0.5 rounded text-c-muted-light hover:text-c-text transition-colors"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
            <pre className="text-[9px] font-mono text-c-text bg-black/30 rounded p-2 max-h-32 overflow-auto whitespace-pre-wrap">
              {runOutput}
            </pre>
          </div>
        )}
      </div>

      {/* ── Footer ────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-c-border bg-c-surface/30 text-[10px] text-c-muted-light">
        <span>
          {config.presets.length} preset{config.presets.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => {
            navigator.clipboard.writeText(JSON.stringify(config, null, 2))
          }}
          className="flex items-center gap-1 hover:text-c-text transition-colors"
        >
          <Copy className="w-2.5 h-2.5" /> Copy JSON
        </button>
      </div>
    </div>
  )
}

export default PresetPanel
