import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MCPClient, createMockMCP } from '../../../lib/mcp/client'
import type { MCPServer } from '../../../types/mcp'

// ── Mock WebSocket ──────────────────────────────────────────────────────────

let mockWsInstances: MockWS[] = []

class MockWS {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  url: string
  readyState = MockWS.CONNECTING
  onopen: ((...args: unknown[]) => void) | null = null
  onclose: ((...args: unknown[]) => void) | null = null
  onerror: ((...args: unknown[]) => void) | null = null
  onmessage: ((...args: unknown[]) => void) | null = null
  send = vi.fn()
  close = vi.fn()

  constructor(url: string) {
    this.url = url
    mockWsInstances.push(this)
  }

  _triggerOpen() {
    this.readyState = MockWS.OPEN
    this.onopen?.(new Event('open'))
  }

  _triggerClose() {
    this.readyState = MockWS.CLOSED
    this.onclose?.(new Event('close'))
  }

  _triggerError(error: unknown) {
    this.onerror?.(error)
  }

  _triggerMessage(data: string) {
    this.onmessage?.({ data } as unknown as MessageEvent)
  }
}

beforeEach(() => {
  mockWsInstances = []
  vi.stubGlobal('WebSocket', MockWS as unknown)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeServer(overrides: Partial<MCPServer> = {}): MCPServer {
  return {
    id: 'mcp-server',
    name: 'Test MCP Server',
    url: 'ws://localhost:3001',
    type: 'sse',
    status: 'disconnected',
    capabilities: [],
    tools: [],
    resources: [],
    ...overrides,
  }
}

/** Returns the most recently created MockWS instance */
function getLastWs(): MockWS {
  expect(mockWsInstances.length).toBeGreaterThan(0)
  return mockWsInstances[mockWsInstances.length - 1]
}

/**
 * Full connect + initialize handshake for tests that exercise
 * MCPClient methods after connection is established.
 */
async function connectAndInitialize(client: MCPClient): Promise<MockWS> {
  const connectPromise = client.connect()
  const ws = getLastWs()
  ws._triggerOpen()
  const initMsg = JSON.parse(ws.send.mock.calls[0][0] as string)
  ws._triggerMessage(JSON.stringify({ jsonrpc: '2.0', id: initMsg.id, result: {} }))
  await connectPromise
  vi.clearAllMocks()
  return ws
}

// ── MCPClient ──────────────────────────────────────────────────────────────

describe('MCPClient', () => {
  // ── Constructor ──────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('stores the server reference', () => {
      const server = makeServer()
      const client = new MCPClient(server)
      expect((client as unknown as { server: MCPServer }).server).toBe(server)
    })
  })

  // ── connect ──────────────────────────────────────────────────────────────

  describe('connect', () => {
    it('creates a WebSocket for sse type and performs initialization handshake', async () => {
      const server = makeServer({ type: 'sse' })
      const client = new MCPClient(server)

      const ws = await connectAndInitialize(client)

      expect(ws.url).toBe('ws://localhost:3001')
      expect(server.status).toBe('connected')
    })

    it('creates a WebSocket for streamable-http type', async () => {
      const server = makeServer({ type: 'streamable-http' })
      const client = new MCPClient(server)

      await connectAndInitialize(client)

      expect(server.status).toBe('connected')
    })

    it('rejects when WebSocket errors before open', async () => {
      const server = makeServer()
      const client = new MCPClient(server)

      const connectPromise = client.connect()
      const ws = getLastWs()

      ws._triggerError(new Event('error'))

      await expect(connectPromise).rejects.toThrow('WebSocket connection failed')
      expect(server.status).toBe('disconnected')
    })

    it('throws an error for stdio type', async () => {
      const server = makeServer({ type: 'stdio' })
      const client = new MCPClient(server)

      await expect(client.connect()).rejects.toThrow('stdio connections not yet implemented')
    })
  })

  // ── initialize ───────────────────────────────────────────────────────────

  describe('initialize', () => {
    it('sends a JSON-RPC initialize request with correct protocol and client info', async () => {
      const server = makeServer()
      const client = new MCPClient(server)

      // Connect first so WebSocket is open
      const ws = await connectAndInitialize(client)

      // Re-initialize explicitly
      const initPromise = client.initialize()
      const sent = JSON.parse(ws.send.mock.calls[0][0] as string)

      expect(sent.jsonrpc).toBe('2.0')
      expect(sent.method).toBe('initialize')
      expect(sent.params).toEqual({
        protocolVersion: '2024-11-05',
        capabilities: { tools: {}, resources: {} },
        clientInfo: { name: 'Crew', version: '0.1.0' },
      })

      ws._triggerMessage(JSON.stringify({ jsonrpc: '2.0', id: sent.id, result: {} }))
      await initPromise
      expect(server.status).toBe('connected')
    })
  })

  // ── listTools ────────────────────────────────────────────────────────────

  describe('listTools', () => {
    it('sends tools/list request and returns tools', async () => {
      const server = makeServer()
      const client = new MCPClient(server)

      const ws = await connectAndInitialize(client)

      const toolsPromise = client.listTools()
      const sent = JSON.parse(ws.send.mock.calls[0][0] as string)

      expect(sent.method).toBe('tools/list')

      const mockTools = [
        { name: 'search', description: 'Search tool', inputSchema: {} },
      ]
      ws._triggerMessage(
        JSON.stringify({ jsonrpc: '2.0', id: sent.id, result: { tools: mockTools } }),
      )

      const tools = await toolsPromise
      expect(tools).toEqual(mockTools)
      expect(server.tools).toEqual(mockTools)
    })
  })

  // ── callTool ─────────────────────────────────────────────────────────────

  describe('callTool', () => {
    it('sends tools/call request with name and arguments', async () => {
      const server = makeServer()
      const client = new MCPClient(server)

      const ws = await connectAndInitialize(client)

      const resultPromise = client.callTool('search', { query: 'hello' })
      const sent = JSON.parse(ws.send.mock.calls[0][0] as string)

      expect(sent.method).toBe('tools/call')
      expect(sent.params).toEqual({
        name: 'search',
        arguments: { query: 'hello' },
      })

      ws._triggerMessage(
        JSON.stringify({ jsonrpc: '2.0', id: sent.id, result: 'search results' }),
      )

      const result = await resultPromise
      expect(result).toBe('search results')
    })
  })

  // ── listResources ────────────────────────────────────────────────────────

  describe('listResources', () => {
    it('sends resources/list request and returns resources', async () => {
      const server = makeServer()
      const client = new MCPClient(server)

      const ws = await connectAndInitialize(client)

      const resourcesPromise = client.listResources()
      const sent = JSON.parse(ws.send.mock.calls[0][0] as string)

      expect(sent.method).toBe('resources/list')

      const mockResources = [
        { uri: 'file:///src', name: 'Source', description: 'Source code' },
      ]
      ws._triggerMessage(
        JSON.stringify({ jsonrpc: '2.0', id: sent.id, result: { resources: mockResources } }),
      )

      const resources = await resourcesPromise
      expect(resources).toEqual(mockResources)
      expect(server.resources).toEqual(mockResources)
    })
  })

  // ── readResource ─────────────────────────────────────────────────────────

  describe('readResource', () => {
    it('sends resources/read request with the specified URI', async () => {
      const server = makeServer()
      const client = new MCPClient(server)

      const ws = await connectAndInitialize(client)

      const readPromise = client.readResource('file:///readme.md')
      const sent = JSON.parse(ws.send.mock.calls[0][0] as string)

      expect(sent.method).toBe('resources/read')
      expect(sent.params).toEqual({ uri: 'file:///readme.md' })

      ws._triggerMessage(
        JSON.stringify({ jsonrpc: '2.0', id: sent.id, result: '# Readme content' }),
      )

      const result = await readPromise
      expect(result).toBe('# Readme content')
    })
  })

  // ── disconnect ───────────────────────────────────────────────────────────

  describe('disconnect', () => {
    it('closes the WebSocket connection and sets status to disconnected', async () => {
      const server = makeServer()
      const client = new MCPClient(server)

      await connectAndInitialize(client)

      const ws = getLastWs()
      client.disconnect()

      expect(ws.close).toHaveBeenCalled()
      expect(server.status).toBe('disconnected')
    })

    it('is safe to call on an unconnected client', () => {
      const server = makeServer()
      const client = new MCPClient(server)

      // Should not throw
      expect(() => client.disconnect()).not.toThrow()
      expect(server.status).toBe('disconnected')
    })
  })

  // ── Error handling ──────────────────────────────────────────────────────

  describe('error handling', () => {
    it('rejects pending request when JSON-RPC error is returned', async () => {
      const server = makeServer()
      const client = new MCPClient(server)

      const ws = await connectAndInitialize(client)

      const toolPromise = client.listTools()
      const sent = JSON.parse(ws.send.mock.calls[0][0] as string)

      ws._triggerMessage(
        JSON.stringify({
          jsonrpc: '2.0',
          id: sent.id,
          error: { code: -32601, message: 'Method not found' },
        }),
      )

      await expect(toolPromise).rejects.toThrow('Method not found')
    })

    it('rejects request when not connected', async () => {
      const server = makeServer()
      const client = new MCPClient(server)

      await expect(client.listTools()).rejects.toThrow('Not connected to MCP server')
    })

    it('handles WebSocket onclose by updating status', async () => {
      const server = makeServer()
      const client = new MCPClient(server)

      const ws = await connectAndInitialize(client)

      expect(server.status).toBe('connected')

      ws._triggerClose()
      expect(server.status).toBe('disconnected')
    })
  })

  // ── Request ID management ───────────────────────────────────────────────

  describe('request ID management', () => {
    it('increments request IDs for each request', async () => {
      const server = makeServer()
      const client = new MCPClient(server)

      // Connect + initialize manually (no helper to ensure isolation)
      const connectPromise = client.connect()
      const ws = getLastWs()
      ws._triggerOpen()
      const initMsg = JSON.parse(ws.send.mock.calls[0][0] as string)
      ws._triggerMessage(JSON.stringify({ jsonrpc: '2.0', id: initMsg.id, result: {} }))
      await connectPromise
      ws.send.mockClear()

      // Make two requests
      const toolPromise = client.listTools()
      expect(ws.send).toHaveBeenCalledTimes(1)
      const toolSent = JSON.parse(ws.send.mock.calls[0][0] as string)
      expect(toolSent.id).toBe(2) // id=1 was used by initialize

      const resourcePromise = client.listResources()
      expect(ws.send).toHaveBeenCalledTimes(2)
      const resourceSent = JSON.parse(ws.send.mock.calls[1][0] as string)
      expect(resourceSent.id).toBe(3)

      // Resolve both
      ws._triggerMessage(
        JSON.stringify({ jsonrpc: '2.0', id: 2, result: { tools: [] } }),
      )
      ws._triggerMessage(
        JSON.stringify({ jsonrpc: '2.0', id: 3, result: { resources: [] } }),
      )

      await toolPromise
      await resourcePromise
    })

    it('routes responses to the correct pending request (out of order)', async () => {
      const server = makeServer()
      const client = new MCPClient(server)

      // Connect + initialize manually
      const connectPromise = client.connect()
      const ws = getLastWs()
      ws._triggerOpen()
      const initMsg = JSON.parse(ws.send.mock.calls[0][0] as string)
      ws._triggerMessage(JSON.stringify({ jsonrpc: '2.0', id: initMsg.id, result: {} }))
      await connectPromise
      ws.send.mockClear()

      // Send two requests concurrently
      const toolPromise = client.listTools()
      expect(ws.send).toHaveBeenCalledTimes(1)
      const toolSent = JSON.parse(ws.send.mock.calls[0][0] as string)
      const resourcePromise = client.listResources()
      expect(ws.send).toHaveBeenCalledTimes(2)
      const resourceSent = JSON.parse(ws.send.mock.calls[1][0] as string)

      // Respond out of order: resource before tool
      ws._triggerMessage(
        JSON.stringify({
          jsonrpc: '2.0',
          id: resourceSent.id,
          result: { resources: [{ uri: 'file:///a', name: 'A' }] },
        }),
      )
      ws._triggerMessage(
        JSON.stringify({
          jsonrpc: '2.0',
          id: toolSent.id,
          result: { tools: [{ name: 't', description: 'tool', inputSchema: {} }] },
        }),
      )

      const resources = await resourcePromise
      expect(resources).toEqual([{ uri: 'file:///a', name: 'A' }])

      const tools = await toolPromise
      expect(tools).toEqual([{ name: 't', description: 'tool', inputSchema: {} }])
    })
  })

  // ── Timeout ──────────────────────────────────────────────────────────────

  describe('timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('rejects a request after 30 seconds with timeout error', async () => {
      const server = makeServer()
      const client = new MCPClient(server)

      // Connect with fake timers
      const connectPromise = client.connect()
      const ws = getLastWs()
      ws._triggerOpen()
      const initMsg = JSON.parse(ws.send.mock.calls[0][0] as string)
      ws._triggerMessage(JSON.stringify({ jsonrpc: '2.0', id: initMsg.id, result: {} }))
      await connectPromise
      vi.clearAllMocks()

      const toolPromise = client.listTools()

      // Advance time by 30 seconds — should trigger timeout
      vi.advanceTimersByTime(30000)

      await expect(toolPromise).rejects.toThrow('Request timeout')
    })

    it('does not timeout if the request completes before timeout', async () => {
      const server = makeServer()
      const client = new MCPClient(server)

      const ws = await connectAndInitialize(client)

      const toolPromise = client.listTools()
      const sent = JSON.parse(ws.send.mock.calls[0][0] as string)

      // Respond before timeout
      vi.advanceTimersByTime(5000)
      ws._triggerMessage(
        JSON.stringify({ jsonrpc: '2.0', id: sent.id, result: { tools: [] } }),
      )

      const tools = await toolPromise
      expect(tools).toEqual([])

      // Advance past 30s — no timeout should fire
      vi.advanceTimersByTime(30000)
    })
  })

  // ── handleMessage edge cases ─────────────────────────────────────────────

  describe('handleMessage edge cases', () => {
    it('logs and swallows malformed JSON messages', async () => {
      const server = makeServer()
      const client = new MCPClient(server)

      const ws = await connectAndInitialize(client)

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Send invalid JSON
      ws._triggerMessage('not-json')

      expect(errorSpy).toHaveBeenCalled()
      expect(errorSpy.mock.calls[0][0]).toContain('Failed to parse MCP message')

      errorSpy.mockRestore()
    })

    it('silently ignores responses with unknown message IDs', async () => {
      const server = makeServer()
      const client = new MCPClient(server)

      const ws = await connectAndInitialize(client)

      // Send a response for an ID that doesn't exist in pendingRequests
      // Should not throw or log errors
      expect(() => {
        ws._triggerMessage(
          JSON.stringify({ jsonrpc: '2.0', id: 999, result: { tools: [] } }),
        )
      }).not.toThrow()
    })
  })

  // ── Connection lifecycle ────────────────────────────────────────────────

  describe('connection lifecycle', () => {
    it('disconnect clears pending requests', async () => {
      const server = makeServer()
      const client = new MCPClient(server)

      await connectAndInitialize(client)

      // Start a request, then disconnect before it completes
      client.listTools().catch(() => {})

      client.disconnect()

      const pending = (
        client as unknown as { pendingRequests: Map<string | number, unknown> }
      ).pendingRequests
      expect(pending.size).toBe(0)
    })
  })
})

// ── createMockMCP ───────────────────────────────────────────────────────────

describe('createMockMCP', () => {
  it('returns a properly structured MCPServer', () => {
    const server = createMockMCP()
    expect(server.id).toBe('mock-mcp')
    expect(server.name).toBe('Mock MCP Server')
    expect(server.url).toBe('ws://localhost:3001')
    expect(server.type).toBe('sse')
    expect(server.status).toBe('disconnected')
  })

  it('includes capabilities', () => {
    const server = createMockMCP()
    expect(server.capabilities).toHaveLength(2)
    expect(server.capabilities[0].name).toBe('tools')
    expect(server.capabilities[1].name).toBe('resources')
  })

  it('includes three mock tools with required fields', () => {
    const server = createMockMCP()
    expect(server.tools).toHaveLength(3)
    const names = server.tools.map((t) => t.name)
    expect(names).toEqual(['read_file', 'write_file', 'search_code'])

    for (const tool of server.tools) {
      expect(tool.name).toBeTruthy()
      expect(tool.description).toBeTruthy()
      expect(tool.inputSchema).toBeTruthy()
    }
  })

  it('includes mock resources', () => {
    const server = createMockMCP()
    expect(server.resources).toHaveLength(1)
    expect(server.resources[0].name).toBe('Source Code')
    expect(server.resources[0].uri).toBe('file:///src')
  })

  it('read_file tool requires a path parameter', () => {
    const server = createMockMCP()
    const readFile = server.tools.find((t) => t.name === 'read_file')
    expect(readFile).toBeDefined()
    const schema = readFile!.inputSchema as { type: string; required?: string[] }
    expect(schema.required).toContain('path')
  })
})
