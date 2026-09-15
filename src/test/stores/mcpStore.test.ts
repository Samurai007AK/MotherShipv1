import { describe, it, expect, beforeEach } from 'vitest'
import { useMCPStore } from '../../stores/mcpStore'
import type { MCPClient } from '../../lib/mcp/client'
import type { MCPServer, MCPTool } from '../../types/mcp'

const SERVER_ID = 'test-server'

function makeServer(): MCPServer {
  return {
    id: SERVER_ID,
    name: 'Test Server',
    url: 'ws://localhost:9999',
    type: 'sse',
    status: 'connected',
    capabilities: [],
    tools: [],
    resources: [],
  }
}

function makeTools(): MCPTool[] {
  return [
    { name: 'read_file', description: 'read', inputSchema: {} },
    { name: 'write_file', description: 'write', inputSchema: {} },
    { name: 'run_shell', description: 'shell', inputSchema: {} },
  ]
}

function fakeClient(tools: MCPTool[]) {
  return {
    listTools: async () => tools,
    callTool: async (name: string) => `called:${name}`,
  } as unknown as MCPClient
}

describe('mcpStore kill-switches (BossConsole-inspired governance)', () => {
  beforeEach(() => {
    localStorage.clear()
    useMCPStore.setState({
      servers: [makeServer()],
      activeServerId: null,
      clients: new Map([[SERVER_ID, fakeClient(makeTools())]]),
      disabledTools: {},
    })
  })

  it('no tool is disabled by default', () => {
    const { isToolDisabled } = useMCPStore.getState()
    expect(isToolDisabled(SERVER_ID, 'run_shell')).toBe(false)
  })

  it('toggleToolEnabled disables then re-enables a tool', () => {
    useMCPStore.getState().toggleToolEnabled(SERVER_ID, 'run_shell')
    expect(useMCPStore.getState().isToolDisabled(SERVER_ID, 'run_shell')).toBe(true)
    useMCPStore.getState().toggleToolEnabled(SERVER_ID, 'run_shell')
    expect(useMCPStore.getState().isToolDisabled(SERVER_ID, 'run_shell')).toBe(false)
  })

  it('toggling one tool leaves others enabled', () => {
    useMCPStore.getState().toggleToolEnabled(SERVER_ID, 'run_shell')
    expect(useMCPStore.getState().isToolDisabled(SERVER_ID, 'read_file')).toBe(false)
  })

  it('listTools hides disabled tools', async () => {
    useMCPStore.getState().toggleToolEnabled(SERVER_ID, 'run_shell')
    const tools = await useMCPStore.getState().listTools(SERVER_ID)
    expect(tools.map((t) => t.name).sort()).toEqual(['read_file', 'write_file'])
  })

  it('callTool fails closed on a disabled tool', async () => {
    useMCPStore.getState().toggleToolEnabled(SERVER_ID, 'run_shell')
    await expect(
      useMCPStore.getState().callTool(SERVER_ID, 'run_shell', {})
    ).rejects.toThrow("Tool 'run_shell' is disabled (kill-switch)")
  })

  it('callTool passes through for enabled tools', async () => {
    const result = await useMCPStore.getState().callTool(SERVER_ID, 'read_file', {})
    expect(result).toBe('called:read_file')
  })

  it('disabled tools persist to localStorage', () => {
    useMCPStore.getState().toggleToolEnabled(SERVER_ID, 'run_shell')
    const raw = localStorage.getItem('mothership-mcp-disabled-tools')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw as string)).toEqual({ [SERVER_ID]: ['run_shell'] })
  })
})
