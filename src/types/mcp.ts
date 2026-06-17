// MCP (Model Context Protocol) types

export interface MCPServer {
  id: string
  name: string
  url: string
  type: 'stdio' | 'sse' | 'streamable-http'
  status: 'connected' | 'disconnected' | 'error'
  capabilities: MCPCapability[]
  tools: MCPTool[]
  resources: MCPResource[]
}

export interface MCPCapability {
  name: string
  description?: string
}

export interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

export interface MCPRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: Record<string, unknown>
}

export interface MCPResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

export interface MCPNotification {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown>
}

// MCP method types
export type MCPMethod =
  | 'initialize'
  | 'tools/list'
  | 'tools/call'
  | 'resources/list'
  | 'resources/read'
  | 'prompts/list'
  | 'prompts/get'
