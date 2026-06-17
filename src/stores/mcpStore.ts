import { create } from 'zustand'
import type { MCPServer, MCPTool, MCPResource } from '../types/mcp'
import { MCPClient, createMockMCP } from '../lib/mcp/client'

interface MCPState {
  servers: MCPServer[]
  activeServerId: string | null
  clients: Map<string, MCPClient>

  // Server actions
  addServer: (server: MCPServer) => void
  removeServer: (id: string) => void
  setActiveServer: (id: string | null) => void

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
      return await client.listTools()
    } catch (error) {
      console.error('Failed to list tools:', error)
      return []
    }
  },

  callTool: async (serverId, toolName, args) => {
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
