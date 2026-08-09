import type {
  MCPServer,
  MCPRequest,
  MCPResponse,
  MCPTool,
  MCPResource,
} from '../../types/mcp'

// MCP Client for connecting to MCP servers
export class MCPClient {
  private server: MCPServer
  private requestId = 0
  private connection: WebSocket | null = null
  private pendingRequests = new Map<
    string | number,
    {
      resolve: (value: unknown) => void
      reject: (reason: Error) => void
    }
  >()

  constructor(server: MCPServer) {
    this.server = server
  }

  // Connect to the MCP server
  async connect(): Promise<void> {
    if (this.server.type === 'sse' || this.server.type === 'streamable-http') {
      return this.connectWebSocket()
    }
    // For stdio, we'd spawn a child process
    throw new Error('stdio connections not yet implemented')
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.connection = new WebSocket(this.server.url)

        this.connection.onopen = () => {
          this.initialize().then(resolve).catch(reject)
        }

        this.connection.onmessage = (event) => {
          this.handleMessage(event.data)
        }

        this.connection.onerror = (error) => {
          console.error('MCP WebSocket error:', error)
          reject(new Error('WebSocket connection failed'))
        }

        this.connection.onclose = () => {
          this.server.status = 'disconnected'
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  private handleMessage(data: string) {
    try {
      const message = JSON.parse(data) as MCPResponse
      const pending = this.pendingRequests.get(message.id)
      if (pending) {
        this.pendingRequests.delete(message.id)
        if (message.error) {
          pending.reject(
            new Error(message.error.message)
          )
        } else {
          pending.resolve(message.result)
        }
      }
    } catch (error) {
      console.error('Failed to parse MCP message:', error)
    }
  }

  // Send a request to the MCP server
  private async request<T>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    const id = ++this.requestId
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    }

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      })

      if (this.connection?.readyState === WebSocket.OPEN) {
        this.connection.send(JSON.stringify(request))
      } else {
        this.pendingRequests.delete(id)
        reject(new Error('Not connected to MCP server'))
      }

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error('Request timeout'))
        }
      }, 30000)
    })
  }

  // Initialize the MCP connection
  async initialize(): Promise<void> {
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
        resources: {},
      },
      clientInfo: {
        name: 'Crew',
        version: '0.1.0',
      },
    })

    this.server.status = 'connected'
  }

  // List available tools
  async listTools(): Promise<MCPTool[]> {
    const result = await this.request<{ tools: MCPTool[] }>('tools/list')
    this.server.tools = result.tools || []
    return this.server.tools
  }

  // Call a tool
  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    return this.request('tools/call', {
      name,
      arguments: args,
    })
  }

  // List available resources
  async listResources(): Promise<MCPResource[]> {
    const result = await this.request<{ resources: MCPResource[] }>(
      'resources/list'
    )
    this.server.resources = result.resources || []
    return this.server.resources
  }

  // Read a resource
  async readResource(uri: string): Promise<unknown> {
    return this.request('resources/read', { uri })
  }

  // Disconnect
  disconnect() {
    this.connection?.close()
    this.connection = null
    this.server.status = 'disconnected'
    this.pendingRequests.clear()
  }
}

// Create a mock MCP server for demonstration
export function createMockMCP(): MCPServer {
  return {
    id: 'mock-mcp',
    name: 'Mock MCP Server',
    url: 'ws://localhost:3001',
    type: 'sse',
    status: 'disconnected',
    capabilities: [
      { name: 'tools', description: 'Tool execution' },
      { name: 'resources', description: 'Resource access' },
    ],
    tools: [
      {
        name: 'read_file',
        description: 'Read contents of a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path to read' },
          },
          required: ['path'],
        },
      },
      {
        name: 'write_file',
        description: 'Write content to a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path to write' },
            content: { type: 'string', description: 'Content to write' },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'search_code',
        description: 'Search for code patterns',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            glob: { type: 'string', description: 'File pattern' },
          },
          required: ['query'],
        },
      },
    ],
    resources: [
      {
        uri: 'file:///src',
        name: 'Source Code',
        description: 'Project source code directory',
        mimeType: 'inode/directory',
      },
    ],
  }
}
