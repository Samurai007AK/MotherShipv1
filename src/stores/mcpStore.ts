import { create } from 'zustand'
import type { MCPServer, MCPTool, MCPResource } from '../types/mcp'
import { MCPClient, createMockMCP } from '../lib/mcp/client'

interface MCPState {
  servers: MCPServer[]
  activeServerId: string | null
  clients: Map<string, MCPClient>
  /** Kill-switches per server id. Mirrors BossConsole's
   *  `mcp-disabled-tools.json` semantics: exposed = all − disabled. */
  disabledTools: Record<string, string[]>

  // Server actions
  addServer: (server: MCPServer) => void
  removeServer: (id: string) => void
  setActiveServer: (id: string | null) => void

  // Kill-switch actions (BossConsole-inspired governance)
  toggleToolEnabled: (serverId: string, toolName: string) => void
  isToolDisabled: (serverId: string, toolName: string) => boolean

  // Connection actions
  connectServer: (id: string) => Promise<void>
  disconnectServer: (id: string) => void

  // Tool actions
  listTools: (serverId: string) => Promise<MCPTool[]>
  callTool: (serverId: string, toolName: string, args: Record<string, unknown>) => Promise<unknown>

  // Resource actions
  listResources: (serverId: string) => Promise<MCPResource[]>
  readResource: (serverId: string, uri: string) => Promise<unknown>
}

export const useMCPStore = create<MCPState>()((set, get) => ({
  servers: [createMockMCP()],
  activeServerId: null,
  clients: new Map(),
  disabledTools: loadDisabledTools(),

  addServer: (server) => {
    set((state) => ({
      servers: [...state.servers, server],
    }))
  },

  removeServer: (id) => {
    const client = get().clients.get(id)
    client?.disconnect()
    set((state) => ({
      servers: state.servers.filter((s) => s.id !== id),
      clients: new Map(
        Array.from(state.clients.entries()).filter(([key]) => key !== id)
      ),
      activeServerId: state.activeServerId === id ? null : state.activeServerId,
    }))
  },

  setActiveServer: (id) => set({ activeServerId: id }),

  toggleToolEnabled: (serverId, toolName) => {
    const current = get().disabledTools[serverId] ?? []
    const next = current.includes(toolName)
      ? current.filter((t) => t !== toolName)
      : [...current, toolName]
    const disabledTools = { ...get().disabledTools, [serverId]: next }
    saveDisabledTools(disabledTools)
    set({ disabledTools })
  },

  isToolDisabled: (serverId, toolName) =>
    (get().disabledTools[serverId] ?? []).includes(toolName),

  connectServer: async (id) => {
    const server = get().servers.find((s) => s.id === id)
    if (!server) return

    const client = new MCPClient(server)
    try {
      await client.connect()
      set((state) => ({
        servers: state.servers.map((s) =>
          s.id === id ? { ...s, status: 'connected' as const } : s
        ),
        clients: new Map(state.clients).set(id, client),
      }))
    } catch (error) {
      console.error('Failed to connect to MCP server:', error)
      set((state) => ({
        servers: state.servers.map((s) =>
          s.id === id ? { ...s, status: 'error' as const } : s
        ),
      }))
    }
  },

  disconnectServer: (id) => {
    const client = get().clients.get(id)
    client?.disconnect()
    set((state) => ({
      servers: state.servers.map((s) =>
        s.id === id ? { ...s, status: 'disconnected' as const } : s
      ),
      clients: new Map(
        Array.from(state.clients.entries()).filter(([key]) => key !== id)
      ),
    }))
  },

  listTools: async (serverId) => {
    const client = get().clients.get(serverId)
    if (!client) return []
    try {
      const tools = await client.listTools()
      const disabled = get().disabledTools[serverId] ?? []
      return tools.filter((t) => !disabled.includes(t.name))
    } catch (error) {
      console.error('Failed to list tools:', error)
      return []
    }
  },

  callTool: async (serverId, toolName, args) => {
    if (get().isToolDisabled(serverId, toolName)) {
      throw new Error(`Tool '${toolName}' is disabled (kill-switch)`)
    }
    const client = get().clients.get(serverId)
    if (!client) throw new Error('Not connected')
    return client.callTool(toolName, args)
  },

  listResources: async (serverId) => {
    const client = get().clients.get(serverId)
    if (!client) return []
    try {
      return await client.listResources()
    } catch (error) {
      console.error('Failed to list resources:', error)
      return []
    }
  },

  readResource: async (serverId, uri) => {
    const client = get().clients.get(serverId)
    if (!client) throw new Error('Not connected')
    return client.readResource(uri)
  },
}))

const DISABLED_TOOLS_KEY = 'mothership-mcp-disabled-tools'

function loadDisabledTools(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(DISABLED_TOOLS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, string[]>
    if (parsed && typeof parsed === 'object') return parsed
  } catch {}
  return {}
}

function saveDisabledTools(disabled: Record<string, string[]>): void {
  try {
    localStorage.setItem(DISABLED_TOOLS_KEY, JSON.stringify(disabled))
  } catch {}
}
