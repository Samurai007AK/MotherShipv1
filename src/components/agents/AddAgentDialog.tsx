import { useState } from 'react'
import { useAgentStore, type AgentProvider } from '../../stores/agentStore'
import { X, Key, ChevronDown, ExternalLink } from 'lucide-react'

// --- Provider definitions ---

interface ProviderDef {
  id: AgentProvider
  name: string
  color: string
  description: string
  models: string[]
  apiKeyPlaceholder: string
  apiKeyUrl: string
}

const PROVIDERS: ProviderDef[] = [
  {
    id: 'claude',
    name: 'Claude',
    color: 'bg-agent-claude',
    description: 'Anthropic — deep reasoning, long context',
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
    description: 'OpenAI — code generation, fast iteration',
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
    description: 'Google — multimodal, broad knowledge',
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
    description: 'Open source — local inference, no API key',
    models: [
      'codellama-34b',
      'deepseek-coder-v2',
      'qwen2.5-coder-32b',
    ],
    apiKeyPlaceholder: '',
    apiKeyUrl: '',
  },
]

// --- Dialog ---

interface AddAgentDialogProps {
  open: boolean
  onClose: () => void
}

export function AddAgentDialog({ open, onClose }: AddAgentDialogProps) {
  const { registerAgent } = useAgentStore()

  const [selectedProvider, setSelectedProvider] = useState<AgentProvider | null>(null)
  const [name, setName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [description, setDescription] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [showProviderDropdown, setShowProviderDropdown] = useState(false)

  const provider = PROVIDERS.find((p) => p.id === selectedProvider)

  const handleAdd = () => {
    if (!selectedProvider || !name.trim()) return

    const agentId = `${selectedProvider}-${Date.now()}`
    registerAgent({
      id: agentId,
      name: name.trim(),
      provider: selectedProvider,
      status: 'idle',
      description: description.trim() || provider?.description || '',
      category: 'coding',
      model: selectedModel || undefined,
      systemPrompt: systemPrompt.trim() || undefined,
    })

    // Reset and close
    setName('')
    setApiKey('')
    setSelectedModel('')
    setDescription('')
    setSystemPrompt('')
    setSelectedProvider(null)
    onClose()
  }

  const handleClose = () => {
    setName('')
    setApiKey('')
    setSelectedModel('')
    setDescription('')
    setSystemPrompt('')
    setSelectedProvider(null)
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
          <h2 className="text-sm font-semibold text-c-text">Add Agent</h2>
          <button
            onClick={handleClose}
            className="p-1 rounded-md hover:bg-c-surface text-c-muted hover:text-c-text-dim transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Provider selection */}
          <div>
            <label className="block text-xs font-medium text-c-muted mb-1.5">Provider</label>
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
                    <span className="text-c-muted text-xs">— {provider.description}</span>
                  </div>
                ) : (
                  <span className="text-c-muted">Select a provider...</span>
                )}
                <ChevronDown className={`w-4 h-4 text-c-muted transition-transform ${showProviderDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showProviderDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-c-surface border border-c-border-strong rounded-lg shadow-lg overflow-hidden">
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
                        <div className="text-[10px] text-c-muted truncate">{p.description}</div>
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
              placeholder="e.g., My Claude Agent"
              className="w-full px-3 py-2 bg-c-surface border border-c-border-strong rounded-lg text-sm text-c-text placeholder:text-c-muted-light focus:border-mothership-500 focus:ring-1 focus:ring-mothership-500/30 outline-none transition-all"
            />
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
              placeholder={provider?.description || 'What this agent does...'}
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
              placeholder='e.g., You are a React expert. Write clean, idiomatic TypeScript with Tailwind CSS.'
              rows={3}
              className="w-full px-3 py-2 bg-c-surface border border-c-border-strong rounded-lg text-sm text-c-text placeholder:text-c-muted-light focus:border-mothership-500 focus:ring-1 focus:ring-mothership-500/30 outline-none transition-all resize-y min-h-[64px] max-h-[200px]"
            />
            <p className="mt-1 text-[10px] text-c-muted-light">
              Instructions that shape how the AI behaves in chat mode. Overrides the default description.
            </p>
          </div>

          {/* Model picker */}
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

          {/* API key */}
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
                Stored locally. Never sent to Mothership servers.
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
            disabled={!selectedProvider || !name.trim()}
            className="px-4 py-1.5 text-xs font-medium bg-mothership-600 text-white rounded-md hover:bg-mothership-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Add Agent
          </button>
        </div>
      </div>
    </div>
  )
}
