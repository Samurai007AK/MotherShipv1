import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MCPPanel } from '../../components/mcp/MCPPanel'
import { useMCPStore } from '../../stores/mcpStore'
import type { MCPServer } from '../../types/mcp'

// ── jsdom polyfills ────────────────────────────────────────────────────────

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

// ── Mock Tauri invoke (required by setup pattern) ──────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// ── Mock data ──────────────────────────────────────────────────────────────

function makeServer(overrides: Partial<MCPServer> = {}): MCPServer {
  return {
    id: `mcp-test`,
    name: 'Test Server',
    url: 'ws://localhost:3001',
    type: 'sse',
    status: 'disconnected',
    capabilities: [],
    tools: [],
    resources: [],
    ...overrides,
  }
}

const MOCK_SERVER_CONNECTED: MCPServer = makeServer({
  id: 'mcp-conn',
  name: 'Connected Server',
  url: 'ws://localhost:4000',
  status: 'connected',
  tools: [{ name: 'search', description: 'Search the web', inputSchema: {} }],
  resources: [{ uri: 'file:///readme', name: 'README', description: 'Project readme' }],
})

const MOCK_SERVER_ERROR: MCPServer = makeServer({
  id: 'mcp-err',
  name: 'Broken Server',
  url: 'ws://localhost:9999',
  status: 'error',
})

const MOCK_SERVER_DISCONNECTED: MCPServer = makeServer({
  id: 'mcp-disc',
  name: 'Idle Server',
  url: 'ws://localhost:5000',
  status: 'disconnected',
})

// ── Store fixture helper ───────────────────────────────────────────────────

function clearStores() {
  useMCPStore.setState({
    servers: [],
    activeServerId: null,
    clients: new Map(),
  })
}

function renderPanel() {
  return render(<MCPPanel />)
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('MCPPanel', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    clearStores()
  })

  // ── Header ───────────────────────────────────────────────────────────────

  describe('header', () => {
    it('renders the MCP Servers title', () => {
      renderPanel()
      expect(screen.getByText('MCP Servers')).toBeInTheDocument()
    })

    it('renders the Add button', () => {
      renderPanel()
      expect(screen.getByText('Add')).toBeInTheDocument()
    })

    it('renders a Plug icon next to the title', () => {
      renderPanel()
      // Title Plug icon is the first lucide-plug
      expect(document.querySelector('.lucide-plug')).toBeInTheDocument()
    })
  })

  // ── Empty state ──────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('shows the empty-state message when there are no servers', () => {
      renderPanel()
      expect(screen.getByText('No MCP servers configured')).toBeInTheDocument()
    })

    it('does not show the empty-state message when servers exist', () => {
      useMCPStore.setState({ servers: [MOCK_SERVER_DISCONNECTED] })
      renderPanel()
      expect(screen.queryByText('No MCP servers configured')).not.toBeInTheDocument()
    })
  })

  // ── Add Server form ──────────────────────────────────────────────────────

  describe('add server form', () => {
    it('does not show the form by default', () => {
      renderPanel()
      expect(screen.queryByPlaceholderText('Server name')).not.toBeInTheDocument()
    })

    it('shows the form when Add is clicked', () => {
      renderPanel()
      fireEvent.click(screen.getByText('Add'))
      expect(screen.getByPlaceholderText('Server name')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('ws://localhost:3001')).toBeInTheDocument()
      expect(screen.getByText('Add Server')).toBeInTheDocument()
      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })

    it('hides the form when Cancel is clicked', () => {
      renderPanel()
      fireEvent.click(screen.getByText('Add'))
      fireEvent.click(screen.getByText('Cancel'))
      expect(screen.queryByPlaceholderText('Server name')).not.toBeInTheDocument()
    })

    it('offers all three transport types in the type dropdown', () => {
      renderPanel()
      fireEvent.click(screen.getByText('Add'))
      expect(screen.getByText('SSE')).toBeInTheDocument()
      expect(screen.getByText('Streamable HTTP')).toBeInTheDocument()
      expect(screen.getByText('Stdio')).toBeInTheDocument()
    })

    it('does not add a server when the name is empty', () => {
      renderPanel()
      fireEvent.click(screen.getByText('Add'))
      fireEvent.change(screen.getByPlaceholderText('ws://localhost:3001'), {
        target: { value: 'ws://localhost:6000' },
      })
      fireEvent.click(screen.getByText('Add Server'))
      expect(useMCPStore.getState().servers.length).toBe(0)
      // Form stays open.
      expect(screen.getByPlaceholderText('Server name')).toBeInTheDocument()
    })

    it('does not add a server when the url is empty', () => {
      renderPanel()
      fireEvent.click(screen.getByText('Add'))
      fireEvent.change(screen.getByPlaceholderText('Server name'), {
        target: { value: 'My Server' },
      })
      fireEvent.click(screen.getByText('Add Server'))
      expect(useMCPStore.getState().servers.length).toBe(0)
      expect(screen.getByPlaceholderText('Server name')).toBeInTheDocument()
    })

    it('adds a server and closes the form when both fields are filled', () => {
      renderPanel()
      fireEvent.click(screen.getByText('Add'))
      fireEvent.change(screen.getByPlaceholderText('Server name'), {
        target: { value: 'Weather MCP' },
      })
      fireEvent.change(screen.getByPlaceholderText('ws://localhost:3001'), {
        target: { value: 'ws://localhost:7000' },
      })
      fireEvent.click(screen.getByText('Add Server'))
      const servers = useMCPStore.getState().servers
      expect(servers.length).toBe(1)
      expect(servers[0].name).toBe('Weather MCP')
      expect(servers[0].url).toBe('ws://localhost:7000')
      expect(servers[0].status).toBe('disconnected')
      expect(servers[0].type).toBe('sse')
      expect(screen.queryByPlaceholderText('Server name')).not.toBeInTheDocument()
    })

    it('respects the selected transport type when adding a server', () => {
      renderPanel()
      fireEvent.click(screen.getByText('Add'))
      fireEvent.change(screen.getByPlaceholderText('Server name'), {
        target: { value: 'Stdio MCP' },
      })
      fireEvent.change(screen.getByPlaceholderText('ws://localhost:3001'), {
        target: { value: '/usr/local/bin/mcp' },
      })
      const select = document.querySelector('select') as HTMLSelectElement
      fireEvent.change(select, { target: { value: 'stdio' } })
      fireEvent.click(screen.getByText('Add Server'))
      expect(useMCPStore.getState().servers[0].type).toBe('stdio')
    })
  })

  // ── Server list rendering ────────────────────────────────────────────────

  describe('server list rendering', () => {
    it('renders the server name and url', () => {
      useMCPStore.setState({ servers: [MOCK_SERVER_DISCONNECTED] })
      renderPanel()
      expect(screen.getByText('Idle Server')).toBeInTheDocument()
      expect(screen.getByText('ws://localhost:5000')).toBeInTheDocument()
    })

    it('shows a Connect (Plug) button for a disconnected server', () => {
      useMCPStore.setState({ servers: [MOCK_SERVER_DISCONNECTED] })
      renderPanel()
      // The connect button has title="Connect"
      expect(screen.getByTitle('Connect')).toBeInTheDocument()
    })

    it('shows a Disconnect (Unplug) button for a connected server', () => {
      useMCPStore.setState({ servers: [MOCK_SERVER_CONNECTED] })
      renderPanel()
      expect(screen.getByTitle('Disconnect')).toBeInTheDocument()
      expect(screen.queryByTitle('Connect')).not.toBeInTheDocument()
    })

    it('shows a green check icon for a connected server', () => {
      useMCPStore.setState({ servers: [MOCK_SERVER_CONNECTED] })
      renderPanel()
      expect(document.querySelector('.lucide-circle-check')).toBeInTheDocument()
    })

    it('shows a red alert icon for an errored server', () => {
      useMCPStore.setState({ servers: [MOCK_SERVER_ERROR] })
      renderPanel()
      expect(document.querySelector('.lucide-circle-alert')).toBeInTheDocument()
    })

    it('always shows a Remove (Trash) button per server', () => {
      useMCPStore.setState({ servers: [MOCK_SERVER_DISCONNECTED, MOCK_SERVER_ERROR] })
      renderPanel()
      expect(screen.getAllByTitle('Remove')).toHaveLength(2)
    })

    it('renders multiple servers', () => {
      useMCPStore.setState({
        servers: [MOCK_SERVER_DISCONNECTED, MOCK_SERVER_CONNECTED, MOCK_SERVER_ERROR],
      })
      renderPanel()
      expect(screen.getByText('Idle Server')).toBeInTheDocument()
      expect(screen.getByText('Connected Server')).toBeInTheDocument()
      expect(screen.getByText('Broken Server')).toBeInTheDocument()
    })
  })

  // ── Connect / Disconnect ─────────────────────────────────────────────────

  describe('connect and disconnect', () => {
    it('calls connectServer when the Connect button is clicked', () => {
      useMCPStore.setState({ servers: [MOCK_SERVER_DISCONNECTED] })
      const spy = vi.spyOn(useMCPStore.getState(), 'connectServer')
      renderPanel()
      fireEvent.click(screen.getByTitle('Connect'))
      expect(spy).toHaveBeenCalledWith('mcp-disc')
    })

    it('calls disconnectServer when the Disconnect button is clicked', () => {
      useMCPStore.setState({ servers: [MOCK_SERVER_CONNECTED] })
      const spy = vi.spyOn(useMCPStore.getState(), 'disconnectServer')
      renderPanel()
      fireEvent.click(screen.getByTitle('Disconnect'))
      expect(spy).toHaveBeenCalledWith('mcp-conn')
    })

    it('does not toggle expand when a connect button is clicked (stopPropagation)', () => {
      useMCPStore.setState({ servers: [MOCK_SERVER_DISCONNECTED] })
      renderPanel()
      fireEvent.click(screen.getByTitle('Connect'))
      // The Tools/Resources sections only appear when expanded.
      expect(screen.queryByText('Tools')).not.toBeInTheDocument()
    })

    it('does not toggle expand when the Remove button is clicked (stopPropagation)', () => {
      useMCPStore.setState({ servers: [MOCK_SERVER_DISCONNECTED] })
      renderPanel()
      fireEvent.click(screen.getByTitle('Remove'))
      expect(screen.queryByText('Tools')).not.toBeInTheDocument()
    })
  })

  // ── Remove ───────────────────────────────────────────────────────────────

  describe('remove server', () => {
    it('removes the server when the Remove button is clicked', () => {
      useMCPStore.setState({ servers: [MOCK_SERVER_DISCONNECTED, MOCK_SERVER_ERROR] })
      renderPanel()
      const removeButtons = screen.getAllByTitle('Remove')
      fireEvent.click(removeButtons[0])
      const remaining = useMCPStore.getState().servers
      expect(remaining.length).toBe(1)
      expect(remaining[0].id).toBe('mcp-err')
    })
  })

  // ── Expand / collapse ───────────────────────────────────────────────────

  describe('expand and collapse', () => {
    it('expands a server on header click and shows Tools/Resources sections', () => {
      useMCPStore.setState({ servers: [MOCK_SERVER_DISCONNECTED] })
      renderPanel()
      // Collapsed initially — chevron points right.
      expect(document.querySelector('.lucide-chevron-right')).toBeInTheDocument()
      fireEvent.click(screen.getByText('Idle Server'))
      expect(screen.getByText('Tools')).toBeInTheDocument()
      expect(screen.getByText('Resources')).toBeInTheDocument()
      // Expanded — chevron points down.
      expect(document.querySelector('.lucide-chevron-down')).toBeInTheDocument()
    })

    it('collapses an expanded server on a second header click', () => {
      useMCPStore.setState({ servers: [MOCK_SERVER_DISCONNECTED] })
      renderPanel()
      fireEvent.click(screen.getByText('Idle Server'))
      expect(screen.getByText('Tools')).toBeInTheDocument()
      fireEvent.click(screen.getByText('Idle Server'))
      expect(screen.queryByText('Tools')).not.toBeInTheDocument()
    })

    it('shows "No tools available" when a server has no tools', () => {
      useMCPStore.setState({ servers: [MOCK_SERVER_DISCONNECTED] })
      renderPanel()
      fireEvent.click(screen.getByText('Idle Server'))
      expect(screen.getByText('No tools available')).toBeInTheDocument()
    })

    it('shows "No resources available" when a server has no resources', () => {
      useMCPStore.setState({ servers: [MOCK_SERVER_DISCONNECTED] })
      renderPanel()
      fireEvent.click(screen.getByText('Idle Server'))
      expect(screen.getByText('No resources available')).toBeInTheDocument()
    })

    it('lists server-provided tools when expanded', () => {
      useMCPStore.setState({ servers: [MOCK_SERVER_CONNECTED] })
      renderPanel()
      fireEvent.click(screen.getByText('Connected Server'))
      expect(screen.getByText('search')).toBeInTheDocument()
    })

    it('lists server-provided resources when expanded', () => {
      useMCPStore.setState({ servers: [MOCK_SERVER_CONNECTED] })
      renderPanel()
      fireEvent.click(screen.getByText('Connected Server'))
      expect(screen.getByText('README')).toBeInTheDocument()
    })

    it('offers a Refresh button for tools and resources when expanded', () => {
      useMCPStore.setState({ servers: [MOCK_SERVER_CONNECTED] })
      renderPanel()
      fireEvent.click(screen.getByText('Connected Server'))
      // Two refresh icons: one for tools, one for resources.
      expect(document.querySelectorAll('.lucide-refresh-cw').length).toBe(2)
    })
  })

  // ── Refresh tools / resources (async) ────────────────────────────────────

  describe('refresh tools and resources', () => {
    it('calls listTools when the tools refresh button is clicked', async () => {
      useMCPStore.setState({ servers: [MOCK_SERVER_CONNECTED] })
      const spy = vi.spyOn(useMCPStore.getState(), 'listTools').mockResolvedValue([])
      renderPanel()
      fireEvent.click(screen.getByText('Connected Server'))
      const refreshButtons = document.querySelectorAll('.lucide-refresh-cw')
      fireEvent.click(refreshButtons[0].parentElement as HTMLElement)
      await waitFor(() => {
        expect(spy).toHaveBeenCalledWith('mcp-conn')
      })
    })

    it('calls listResources when the resources refresh button is clicked', async () => {
      useMCPStore.setState({ servers: [MOCK_SERVER_CONNECTED] })
      const spy = vi.spyOn(useMCPStore.getState(), 'listResources').mockResolvedValue([])
      renderPanel()
      fireEvent.click(screen.getByText('Connected Server'))
      const refreshButtons = document.querySelectorAll('.lucide-refresh-cw')
      fireEvent.click(refreshButtons[1].parentElement as HTMLElement)
      await waitFor(() => {
        expect(spy).toHaveBeenCalledWith('mcp-conn')
      })
    })
  })
})
