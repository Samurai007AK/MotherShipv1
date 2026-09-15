import { useState, memo } from 'react'
import { useMCPStore } from '../../stores/mcpStore'
import type { MCPServer, MCPTool, MCPResource } from '../../types/mcp'
import {
  Plug,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Unplug,
  Wrench,
  FileText,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'

export const MCPPanel = memo(function MCPPanel() {
  const {
    servers,
    addServer,
    removeServer,
    connectServer,
    disconnectServer,
    listTools,
    listResources,
    toggleToolEnabled,
    isToolDisabled,
  } = useMCPStore()

  const [showAddServer, setShowAddServer] = useState(false)
  const [newServer, setNewServer] = useState({
    name: '',
    url: '',
    type: 'sse' as MCPServer['type'],
  })
  const [expandedServer, setExpandedServer] = useState<string | null>(null)
  const [tools, setTools] = useState<Record<string, MCPTool[]>>({})
  const [resources, setResources] = useState<Record<string, MCPResource[]>>({})

  const handleAddServer = () => {
    if (!newServer.name || !newServer.url) return

    const server: MCPServer = {
      id: `mcp-${Date.now()}`,
      name: newServer.name,
      url: newServer.url,
      type: newServer.type,
      status: 'disconnected',
      capabilities: [],
      tools: [],
      resources: [],
    }

    addServer(server)
    setNewServer({ name: '', url: '', type: 'sse' })
    setShowAddServer(false)
  }

  const handleRefreshTools = async (serverId: string) => {
    const serverTools = await listTools(serverId)
    setTools((prev) => ({ ...prev, [serverId]: serverTools }))
  }

  const handleRefreshResources = async (serverId: string) => {
    const serverResources = await listResources(serverId)
    setResources((prev) => ({ ...prev, [serverId]: serverResources }))
  }

  const toggleExpand = (serverId: string) => {
    setExpandedServer(expandedServer === serverId ? null : serverId)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-2 border-b border-c-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Plug className="w-4 h-4 text-mothership-500" />
            <span className="text-xs font-medium text-c-primary">MCP Servers</span>
          </div>
          <button
            onClick={() => setShowAddServer(!showAddServer)}
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-c-secondary hover:text-c-primary rounded hover:bg-surface-hover transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        </div>

        {/* Add Server Form */}
        {showAddServer && (
          <div className="space-y-2 p-2 bg-surface-subtle rounded border border-c-border">
            <input
              value={newServer.name}
              onChange={(e) =>
                setNewServer({ ...newServer, name: e.target.value })
              }
              placeholder="Server name"
              className="w-full bg-transparent text-xs text-c-primary placeholder-c-secondary border border-c-border rounded px-2 py-1 focus:outline-none focus:border-mothership-500"
            />
            <input
              value={newServer.url}
              onChange={(e) =>
                setNewServer({ ...newServer, url: e.target.value })
              }
              placeholder="ws://localhost:3001"
              className="w-full bg-transparent text-xs text-c-primary placeholder-c-secondary border border-c-border rounded px-2 py-1 focus:outline-none focus:border-mothership-500"
            />
            <select
              value={newServer.type}
              onChange={(e) =>
                setNewServer({
                  ...newServer,
                  type: e.target.value as MCPServer['type'],
                })
              }
              className="w-full bg-transparent text-xs text-c-secondary border border-c-border rounded px-2 py-1 focus:outline-none"
            >
              <option value="sse">SSE</option>
              <option value="streamable-http">Streamable HTTP</option>
              <option value="stdio">Stdio</option>
            </select>
            <div className="flex gap-2">
              <button
                onClick={handleAddServer}
                className="px-3 py-1 bg-mothership-500 text-white text-[10px] rounded hover:bg-mothership-600 transition-colors"
              >
                Add Server
              </button>
              <button
                onClick={() => setShowAddServer(false)}
                className="px-3 py-1 text-c-secondary text-[10px] rounded hover:bg-surface-hover transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Server List */}
      <div className="flex-1 overflow-y-auto">
        {servers.length === 0 && (
          <div className="text-center text-c-secondary text-[10px] py-8">
            No MCP servers configured
          </div>
        )}

        {servers.map((server) => (
          <div key={server.id} className="border-b border-c-border">
            {/* Server Header */}
            <div
              onClick={() => toggleExpand(server.id)}
              className="flex items-center gap-2 px-2 py-2 cursor-pointer hover:bg-surface-hover transition-colors"
            >
              {expandedServer === server.id ? (
                <ChevronDown className="w-3 h-3 text-c-secondary" />
              ) : (
                <ChevronRight className="w-3 h-3 text-c-secondary" />
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-c-primary">
                    {server.name}
                  </span>
                  {server.status === 'connected' && (
                    <CheckCircle2 className="w-3 h-3 text-green-400" />
                  )}
                  {server.status === 'error' && (
                    <AlertCircle className="w-3 h-3 text-red-400" />
                  )}
                </div>
                <div className="text-[10px] text-c-secondary truncate">
                  {server.url}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {server.status === 'connected' ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      disconnectServer(server.id)
                    }}
                    className="p-1 text-c-secondary hover:text-red-400 rounded hover:bg-surface-hover transition-colors"
                    title="Disconnect"
                  >
                    <Unplug className="w-3 h-3" />
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      connectServer(server.id)
                    }}
                    className="p-1 text-c-secondary hover:text-green-400 rounded hover:bg-surface-hover transition-colors"
                    title="Connect"
                  >
                    <Plug className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeServer(server.id)
                  }}
                  className="p-1 text-c-secondary hover:text-red-400 rounded hover:bg-surface-hover transition-colors"
                  title="Remove"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Expanded Details */}
            {expandedServer === server.id && (
              <div className="px-4 pb-2">
                {/* Tools */}
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-c-secondary flex items-center gap-1">
                      <Wrench className="w-3 h-3" />
                      Tools
                    </span>
                    <button
                      onClick={() => handleRefreshTools(server.id)}
                      className="text-c-secondary hover:text-c-primary"
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  {(tools[server.id] || server.tools).length === 0 ? (
                    <div className="text-[10px] text-c-secondary italic">
                      No tools available
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {(tools[server.id] || server.tools).map((tool) => (
                        <div
                          key={tool.name}
                          className={`flex items-center gap-2 px-2 py-1 bg-surface-subtle rounded text-[10px] ${
                            isToolDisabled(server.id, tool.name)
                              ? 'opacity-40'
                              : ''
                          }`}
                        >
                          <Wrench className="w-2.5 h-2.5 text-c-secondary" />
                          <span className="text-c-primary flex-1">
                            {tool.name}
                          </span>
                          <button
                            onClick={() =>
                              toggleToolEnabled(server.id, tool.name)
                            }
                            className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${
                              isToolDisabled(server.id, tool.name)
                                ? 'text-red-400 hover:text-red-300'
                                : 'text-green-400 hover:text-green-300'
                            }`}
                            title={
                              isToolDisabled(server.id, tool.name)
                                ? 'Enable tool (remove kill-switch)'
                                : 'Disable tool (kill-switch)'
                            }
                          >
                            {isToolDisabled(server.id, tool.name)
                              ? 'Off'
                              : 'On'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Resources */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-c-secondary flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      Resources
                    </span>
                    <button
                      onClick={() => handleRefreshResources(server.id)}
                      className="text-c-secondary hover:text-c-primary"
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  {(resources[server.id] || server.resources).length === 0 ? (
                    <div className="text-[10px] text-c-secondary italic">
                      No resources available
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {(resources[server.id] || server.resources).map(
                        (resource) => (
                          <div
                            key={resource.uri}
                            className="flex items-center gap-2 px-2 py-1 bg-surface-subtle rounded text-[10px]"
                          >
                            <FileText className="w-2.5 h-2.5 text-c-secondary" />
                            <span className="text-c-primary">
                              {resource.name}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
})
