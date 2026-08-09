import { useState } from 'react'
import {
  useAgentStore,
  type EngineeringRole,
  type AgentProvider,
  getRoleMeta,
  getAllRoles,
} from '../../stores/agentStore'
import { X, Key, ChevronDown, ExternalLink } from 'lucide-react'

// --- Provider definitions (kept for API key setup) ---

interface ProviderDef {
  id: AgentProvider
  name: string
  color: string
  models: string[]
  apiKeyPlaceholder: string
  apiKeyUrl: string
}

const PROVIDERS: ProviderDef[] = [
  {
    id: 'claude',
    name: 'Claude',
    color: 'bg-agent-claude',
    models: [
      'claude-sonnet-4-20250514',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
    ],
    apiKeyPlaceholder: 'sk-ant-...',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'codex',
    name: 'Codex',
    color: 'bg-agent-codex',
    models: [
      'codex-mini',
      'gpt-4o',
      'gpt-4o-mini',
      'o3-mini',
    ],
    apiKeyPlaceholder: 'sk-...',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    color: 'bg-agent-gemini',
    models: [
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
    ],
    apiKeyPlaceholder: 'AIza...',
    apiKeyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    color: 'bg-agent-opencode',
    models: [
      'codellama-34b',
      'deepseek-coder-v2',
      'qwen2.5-coder-32b',
    ],
    apiKeyPlaceholder: '',
    apiKeyUrl: '',
  },
]

// --- Available roles ---

const AVAILABLE_ROLES = getAllRoles().map(({ id, meta }) => ({
  id,
  label: meta.label,
  icon: meta.icon,
  color: meta.color,
  description: meta.label,
}))

// --- Dialog ---

interface AddAgentDialogProps {
  open: boolean
  onClose: () => void
}

export function AddAgentDialog({ open, onClose }: AddAgentDialogProps) {
  const { registerAgent } = useAgentStore()

  const [selectedRole, setSelectedRole] = useState<EngineeringRole | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<AgentProvider | null>(null)
  const [name, setName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [description, setDescription] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [showRoleDropdown, setShowRoleDropdown] = useState(false)
  const [showProviderDropdown, setShowProviderDropdown] = useState(false)

  const roleMeta = selectedRole ? getRoleMeta(selectedRole) : null
  const provider = PROVIDERS.find((p) => p.id === selectedProvider)

  const handleAdd = () => {
    if (!selectedRole || !name.trim()) return

    registerAgent({
      id: `${selectedRole}-${Date.now()}`,
      name: name.trim(),
      provider: selectedProvider || 'claude',
      role: selectedRole,
      status: 'idle',
      description: description.trim() || roleMeta?.label || '',
      category: roleMeta?.category || 'engineering',
      model: selectedModel || undefined,
      systemPrompt: systemPrompt.trim() || roleMeta?.systemPrompt || undefined,
    })

    // Reset and close
    setName('')
    setApiKey('')
    setSelectedModel('')
    setDescription('')
    setSystemPrompt('')
    setSelectedRole(null)
    setSelectedProvider(null)
    onClose()
  }

  const handleClose = () => {
    setName('')
    setApiKey('')
    setSelectedModel('')
    setDescription('')
    setSystemPrompt('')
    setSelectedRole(null)
    setSelectedProvider(null)
    setShowRoleDropdown(false)
    setShowProviderDropdown(false)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-md bg-c-card border border-c-border-strong rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-c-border">
          <h2 className="text-sm font-semibold text-c-text">Add Team Member</h2>
          <button
            onClick={handleClose}
            className="p-1 rounded-md hover:bg-c-surface text-c-muted hover:text-c-text-dim transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Role selection */}
          <div>
            <label className="block text-xs font-medium text-c-muted mb-1.5">Role</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                className="w-full flex items-center justify-between px-3 py-2 bg-c-surface border border-c-border-strong rounded-lg text-sm text-c-text hover:border-c-border-strong transition-colors"
              >
                {roleMeta ? (
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${roleMeta.color}`} />
                    <span>{roleMeta.icon} {roleMeta.label}</span>
                  </div>
                ) : (
                  <span className="text-c-muted">Select a role...</span>
                )}
                <ChevronDown className={`w-4 h-4 text-c-muted transition-transform ${showRoleDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showRoleDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-c-surface border border-c-border-strong rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                  {AVAILABLE_ROLES.map((role) => (
                    <button
                      key={role.id}
                      onClick={() => {
                        setSelectedRole(role.id)
                        setShowRoleDropdown(false)
                        // Auto-fill description and system prompt from role
                        const meta = getRoleMeta(role.id)
                        if (!description) setDescription(meta.label)
                        if (!systemPrompt) setSystemPrompt(meta.systemPrompt)
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-c-surface-hover transition-colors ${
                        selectedRole === role.id ? 'bg-c-surface-hover/50' : ''
                      }`}
                    >
                      <span className={`w-3 h-3 rounded-full ${role.color} flex-shrink-0`} />
                      <div className="min-w-0">
                        <div className="text-sm text-c-text">{role.icon} {role.label}</div>
                        <div className="text-[10px] text-c-muted truncate">{getRoleMeta(role.id).systemPrompt.slice(0, 60)}...</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Agent name */}
          <div>
            <label className="block text-xs font-medium text-c-muted mb-1.5">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={roleMeta ? `e.g., ${roleMeta.label}` : 'e.g., My Engineer'}
              className="w-full px-3 py-2 bg-c-surface border border-c-border-strong rounded-lg text-sm text-c-text placeholder:text-c-muted-light focus:border-mothership-500 focus:ring-1 focus:ring-mothership-500/30 outline-none transition-all"
            />
          </div>

          {/* AI Provider (optional — for AI-backed team members) */}
          <div>
            <label className="block text-xs font-medium text-c-muted mb-1.5">
              AI Provider <span className="text-c-muted-light">(optional — leave empty for human)</span>
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowProviderDropdown(!showProviderDropdown)}
                className="w-full flex items-center justify-between px-3 py-2 bg-c-surface border border-c-border-strong rounded-lg text-sm text-c-text hover:border-c-border-strong transition-colors"
              >
                {provider ? (
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${provider.color}`} />
                    <span>{provider.name}</span>
                  </div>
                ) : (
                  <span className="text-c-muted">No provider (human team member)</span>
                )}
                <ChevronDown className={`w-4 h-4 text-c-muted transition-transform ${showProviderDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showProviderDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-c-surface border border-c-border-strong rounded-lg shadow-lg overflow-hidden">
                  <button
                    onClick={() => {
                      setSelectedProvider(null)
                      setShowProviderDropdown(false)
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-c-surface-hover transition-colors ${
                      selectedProvider === null ? 'bg-c-surface-hover/50' : ''
                    }`}
                  >
                    <span className="w-3 h-3 rounded-full bg-zinc-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm text-c-text">None (Human)</div>
                      <div className="text-[10px] text-c-muted">This team member will code manually</div>
                    </div>
                  </button>
                  {PROVIDERS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedProvider(p.id)
                        setSelectedModel(p.models[0])
                        setShowProviderDropdown(false)
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-c-surface-hover transition-colors ${
                        selectedProvider === p.id ? 'bg-c-surface-hover/50' : ''
                      }`}
                    >
                      <span className={`w-3 h-3 rounded-full ${p.color} flex-shrink-0`} />
                      <div className="min-w-0">
                        <div className="text-sm text-c-text">{p.name}</div>
                        <div className="text-[10px] text-c-muted truncate">AI-powered agent</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Description (optional) */}
          <div>
            <label className="block text-xs font-medium text-c-muted mb-1.5">
              Description <span className="text-c-muted-light">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={roleMeta?.label || 'What this team member does...'}
              className="w-full px-3 py-2 bg-c-surface border border-c-border-strong rounded-lg text-sm text-c-text placeholder:text-c-muted-light focus:border-mothership-500 focus:ring-1 focus:ring-mothership-500/30 outline-none transition-all"
            />
          </div>

          {/* System prompt (optional) */}
          <div>
            <label className="block text-xs font-medium text-c-muted mb-1.5">
              System Prompt <span className="text-c-muted-light">(optional)</span>
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder='Instructions that shape how this team member behaves...'
              rows={3}
              className="w-full px-3 py-2 bg-c-surface border border-c-border-strong rounded-lg text-sm text-c-text placeholder:text-c-muted-light focus:border-mothership-500 focus:ring-1 focus:ring-mothership-500/30 outline-none transition-all resize-y min-h-[64px] max-h-[200px]"
            />
            <p className="mt-1 text-[10px] text-c-muted-light">
              Auto-filled from role selection. Customizable per team member.
            </p>
          </div>

          {/* Model picker (only when provider selected) */}
          {provider && (
            <div>
              <label className="block text-xs font-medium text-c-muted mb-1.5">Model</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full px-3 py-2 bg-c-surface border border-c-border-strong rounded-lg text-sm text-c-text focus:border-mothership-500 focus:ring-1 focus:ring-mothership-500/30 outline-none transition-all appearance-none cursor-pointer"
              >
                {provider.models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* API key (only when provider with key selected) */}
          {provider && provider.apiKeyPlaceholder && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-c-muted">API Key</label>
                <a
                  href={provider.apiKeyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-mothership-400 hover:text-mothership-300 transition-colors"
                >
                  Get key <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-c-muted-light" />
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={provider.apiKeyPlaceholder}
                  className="w-full pl-9 pr-3 py-2 bg-c-surface border border-c-border-strong rounded-lg text-sm text-c-text placeholder:text-c-muted-light focus:border-mothership-500 focus:ring-1 focus:ring-mothership-500/30 outline-none transition-all font-mono"
                />
              </div>
              <p className="mt-1 text-[10px] text-c-muted-light">
                Stored locally. Never sent to Crew servers.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-c-border bg-c-card/50">
          <button
            onClick={handleClose}
            className="px-3 py-1.5 text-xs text-c-muted hover:text-c-text rounded-md hover:bg-c-surface transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!selectedRole || !name.trim()}
            className="px-4 py-1.5 text-xs font-medium bg-mothership-600 text-white rounded-md hover:bg-mothership-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Add Team Member
          </button>
        </div>
      </div>
    </div>
  )
}
