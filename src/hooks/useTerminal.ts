import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { useThemeStore } from '../stores/themeStore'
import { chatCompletionStream, type ChatMessage } from '../lib/modelRouter'
import '@xterm/xterm/css/xterm.css'

// --- Types matching Rust terminal/mod.rs ---

export interface PtySessionInfo {
  id: string
  agentId: string
  status: 'Starting' | 'Running' | 'Paused' | 'Exited' | { Error: string }
  pid: number | null
  cols: number
  rows: number
  createdAt: string
}

export interface PtyConfig {
  agentId: string
  workingDir: string
  shell?: string
  envVars?: Record<string, string>
  cols?: number
  rows?: number
}

// --- Theme constants ---

const DARK_THEME = {
  background: '#09090b',
  foreground: '#d4d4d8',
  cursor: '#a1a1aa',
  cursorAccent: '#09090b',
  selectionBackground: '#4c6ef533',
  black: '#18181b',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#4c6ef5',
  magenta: '#c977a0',
  cyan: '#4a9eff',
  white: '#d4d4d8',
  brightBlack: '#52525b',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#facc15',
  brightBlue: '#748ffc',
  brightMagenta: '#e091c0',
  brightCyan: '#7ec8ff',
  brightWhite: '#fafafa',
}

const LIGHT_THEME = {
  background: '#ffffff',
  foreground: '#18181b',
  cursor: '#71717a',
  cursorAccent: '#ffffff',
  selectionBackground: '#4c6ef533',
  black: '#18181b',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#ca8a04',
  blue: '#4c6ef5',
  magenta: '#c977a0',
  cyan: '#4a9eff',
  white: '#f4f4f5',
  brightBlack: '#71717a',
  brightRed: '#ef4444',
  brightGreen: '#22c55e',
  brightYellow: '#eab308',
  brightBlue: '#748ffc',
  brightMagenta: '#e091c0',
  brightCyan: '#7ec8ff',
  brightWhite: '#fafafa',
}

// --- Tauri event payloads (matching Rust TerminalOutputPayload etc.) ---

interface TerminalOutputPayload {
  sessionId: string
  data: string
}

interface TerminalExitPayload {
  sessionId: string
  code: number
}

interface TerminalErrorPayload {
  sessionId: string
  message: string
}

// --- Buffer snapshot cache (persists across hook unmount/remount) ---

const SNAPSHOT_MAX_LINES = 5000
const bufferSnapshots = new Map<string, string>()

function captureBufferSnapshot(terminal: Terminal): string {
  const buffer = terminal.buffer.active
  const lines: string[] = []
  const totalRows = buffer.length
  const startRow = Math.max(0, totalRows - SNAPSHOT_MAX_LINES)

  for (let i = startRow; i < totalRows; i++) {
    const line = buffer.getLine(i)
    if (line) {
      lines.push(line.translateToString(true))
    }
  }

  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop()
  }

  return lines.join('\n')
}

// --- AI mode chat helpers ---

const AI_PROMPT = '>>> '
const AI_PROMPT_PREFIX = '\r\n>>> '

interface AiSessionState {
  messages: ChatMessage[]
  buffer: string
  isGenerating: boolean
  abortController: AbortController | null
}

function createAiSession(): AiSessionState {
  return {
    messages: [],
    buffer: '',
    isGenerating: false,
    abortController: null,
  }
}

// --- Hook ---

interface UseTerminalOptions {
  agentId: string
  workingDir?: string
  cols?: number
  rows?: number
  visible?: boolean
  /** When set, the terminal runs in AI chat mode (no PTY) using this model */
  aiModel?: string
  /** System prompt for the AI chat mode */
  aiSystemPrompt?: string
  onExit?: (code: number) => void
  onError?: (message: string) => void
}

export function useTerminal({
  agentId,
  workingDir = '.',
  cols = 120,
  rows = 30,
  visible = true,
  aiModel,
  aiSystemPrompt,
  onExit,
  onError,
}: UseTerminalOptions) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const sessionRef = useRef<PtySessionInfo | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [conversationVersion, setConversationVersion] = useState(0)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isAiGenerating, setIsAiGenerating] = useState(false)
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)

  // AI mode state
  const isAiMode = Boolean(aiModel)
  const aiSessionRef = useRef<AiSessionState>(createAiSession())

  // Track pause idle timer
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastActivityRef = useRef<number>(Date.now())

  // Initialize xterm.js Terminal
  useEffect(() => {
    if (!containerRef.current) return

    const terminal = new Terminal({
      theme: resolvedTheme === 'dark' ? DARK_THEME : LIGHT_THEME,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 12,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowProposedApi: true,
      scrollback: 10000,
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    const searchAddon = new SearchAddon()
    terminal.loadAddon(searchAddon)

    terminal.open(containerRef.current)
    fitAddon.fit()

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon
    searchAddonRef.current = searchAddon

    const handleResize = () => fitAddon.fit()
    window.addEventListener('resize', handleResize)

    return () => {
      if (sessionId && terminal) {
        bufferSnapshots.set(sessionId, captureBufferSnapshot(terminal))
      }
      window.removeEventListener('resize', handleResize)
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      searchAddonRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update theme when resolvedTheme changes
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme =
        resolvedTheme === 'dark' ? DARK_THEME : LIGHT_THEME
    }
  }, [resolvedTheme])

  // Refit on parent resize
  useEffect(() => {
    const observer = new ResizeObserver(() => fitAddonRef.current?.fit())
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // --- Visibility-based pause/resume ---
  useEffect(() => {
    if (visible) {
      if (pauseTimerRef.current) {
        clearTimeout(pauseTimerRef.current)
        pauseTimerRef.current = null
      }
      if (sessionId && terminalRef.current) {
        const snapshot = bufferSnapshots.get(sessionId)
        if (snapshot && isPaused) {
          setIsPaused(false)
        }
      }
      fitAddonRef.current?.fit()
      lastActivityRef.current = Date.now()
    } else {
      pauseTimerRef.current = setTimeout(() => {
        if (sessionId && terminalRef.current) {
          bufferSnapshots.set(sessionId, captureBufferSnapshot(terminalRef.current))
          setIsPaused(true)
        }
      }, 5 * 60 * 1000)
    }

    return () => {
      if (pauseTimerRef.current) {
        clearTimeout(pauseTimerRef.current)
      }
    }
  }, [visible, sessionId, isPaused])

  // --- AI mode: handle onData (line-buffered input → Ollama) ---
  useEffect(() => {
    if (!isAiMode) return

    const terminal = terminalRef.current
    if (!terminal) return

    const disposable = terminal.onData(async (data: string) => {
      lastActivityRef.current = Date.now()
      const aiSession = aiSessionRef.current

      if (aiSession.isGenerating) {
        // While generating, only accept Ctrl+C (cancel) or Ctrl+L (clear)
        if (data === '\x03') {
          aiSession.abortController?.abort()
          aiSession.isGenerating = false
          setIsAiGenerating(false)
          terminal.write('\r\n^C' + AI_PROMPT_PREFIX)
          aiSession.buffer = ''
        } else if (data === '\x0c') {
          clearConversation()
        }
        return
      }

      // Handle special keys
      if (data === '\r' || data === '\n') {
        // Enter — send the buffered line to Ollama
        const line = aiSession.buffer
        terminal.write('\r\n')

        if (line.trim()) {
          aiSession.isGenerating = true
          setIsAiGenerating(true)

          // Add user message to conversation
          aiSession.messages.push({ role: 'user', content: line.trim() })
          setConversationVersion((v) => v + 1)
          aiSession.buffer = ''

          try {
            // Cap conversation history to last 20 messages to avoid context overflow
            const recentMessages = aiSession.messages.length > 20
              ? aiSession.messages.slice(-20)
              : aiSession.messages

            const abortController = new AbortController()
            aiSession.abortController = abortController

            let fullContent = ''

            await chatCompletionStream(
              {
                model: aiModel!,
                messages: recentMessages,
                temperature: 0.7,
              },
              // onToken — write each chunk to terminal as it arrives
              (token) => {
                terminal.write(token)
              },
              // onDone — save full content for conversation history
              (content) => {
                fullContent = content
              },
              // onError — write error in red
              (err) => {
                throw new Error(err)
              },
              abortController.signal
            )

            // Only add to history if user didn't cancel
            if (!abortController.signal.aborted && fullContent) {
              aiSession.messages.push({
                role: 'assistant',
                content: fullContent,
              })
              setConversationVersion((v) => v + 1)
              terminal.write('\r\n')
            }
          } catch (e: unknown) {
            terminal.write(`\r\n\x1b[31mError: ${e instanceof Error ? e.message : String(e)}\x1b[0m\r\n`)
          } finally {
            aiSession.abortController = null
            aiSession.isGenerating = false
            setIsAiGenerating(false)
            terminal.write(AI_PROMPT)
          }
        } else {
          // Empty line — just show a new prompt
          terminal.write(AI_PROMPT)
        }
        return
      }

      if (data === '\x7f') {
        // Backspace
        if (aiSession.buffer.length > 0) {
          aiSession.buffer = aiSession.buffer.slice(0, -1)
          terminal.write('\b \b')
        }
        return
      }

      if (data === '\x0c') {
        // Ctrl+L — clear conversation
        clearConversation()
        return
      }

      if (data === '\x03') {
        // Ctrl+C
        aiSession.buffer = ''
        terminal.write('^C\r\n' + AI_PROMPT)
        return
      }

      if (data.length === 1 && data.charCodeAt(0) >= 0x20) {
        // Printable character
        aiSession.buffer += data
        terminal.write(data)
      }
      // Ignore other control characters for now
    })

    return () => disposable.dispose()
  }, [isAiMode, aiModel])

  // --- PTY mode: wire xterm input → Tauri PTY writeInput ---
  useEffect(() => {
    if (isAiMode) return

    const terminal = terminalRef.current
    if (!terminal || !sessionId) return

    const disposable = terminal.onData(async (data: string) => {
      lastActivityRef.current = Date.now()
      try {
        await invoke('write_terminal_input', { sessionId, data })
      } catch (e) {
        console.error('Failed to write terminal input:', e)
      }
    })

    return () => disposable.dispose()
  }, [sessionId, isAiMode])

  // Listen for PTY output events from Tauri backend
  useEffect(() => {
    if (isAiMode || !sessionId) return

    let unlistenOutput: UnlistenFn | null = null
    let unlistenExit: UnlistenFn | null = null
    let unlistenError: UnlistenFn | null = null
    let cancelled = false

    const setup = async () => {
      try {
        unlistenOutput = await listen<TerminalOutputPayload>(
          'terminal-output',
          (event) => {
            if (event.payload.sessionId === sessionId) {
              lastActivityRef.current = Date.now()
              terminalRef.current?.write(event.payload.data)
            }
          }
        )
        if (cancelled) { unlistenOutput(); return }

        unlistenExit = await listen<TerminalExitPayload>(
          'terminal-exit',
          (event) => {
            if (event.payload.sessionId === sessionId) {
              setIsConnected(false)
              onExit?.(event.payload.code)
            }
          }
        )
        if (cancelled) { unlistenExit(); return }

        unlistenError = await listen<TerminalErrorPayload>(
          'terminal-error',
          (event) => {
            if (event.payload.sessionId === sessionId) {
              setHasError(true)
              setErrorMessage(event.payload.message)
              onError?.(event.payload.message)
            }
          }
        )
        if (cancelled) { unlistenError(); return }
      } catch (e) {
        console.error('Failed to set up terminal event listeners:', e)
      }
    }

    setup()

    return () => {
      cancelled = true
      unlistenOutput?.()
      unlistenExit?.()
      unlistenError?.()
    }
  }, [sessionId, onExit, onError, isAiMode])

  // Ctrl+F search shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!visible) return
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setIsSearchOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [visible])

  // Spawn a new session (PTY or AI)
  const spawn = useCallback(async () => {
    if (isAiMode) {
      // AI mode: no PTY, just show welcome and prompt
      const terminal = terminalRef.current
      if (!terminal) return null

      // Reset AI session
      aiSessionRef.current = createAiSession()
      if (aiSystemPrompt) {
        aiSessionRef.current.messages.push({
          role: 'system',
          content: aiSystemPrompt,
        })
      }

      setIsConnected(true)
      setHasError(false)
      setErrorMessage(null)
      setIsAiGenerating(false)

      // Show welcome message
      terminal.writeln(
        `\x1b[1;36m╭─── ${agentId}@mothership ─── model: ${aiModel} ──────────────\x1b[0m`
      )
      terminal.writeln(
        `\x1b[2;36m│ Type your message and press Enter. Ctrl+C to cancel.\x1b[0m`
      )
      terminal.writeln(
        `\x1b[1;36m╰──────────────────────────────────────────────────\x1b[0m`
      )
      terminal.write('\r\n')
      terminal.write(AI_PROMPT)

      return null
    }

    // PTY mode: spawn a real shell session
    try {
      const config: PtyConfig = { agentId, workingDir, cols, rows }
      const info = await invoke<PtySessionInfo>('spawn_terminal_session', { config })
      sessionRef.current = info
      setSessionId(info.id)
      setIsConnected(true)
      setHasError(false)
      setErrorMessage(null)
      return info
    } catch (e) {
      console.error('Failed to spawn terminal session:', e)
      setHasError(true)
      setErrorMessage(String(e))
      onError?.(String(e))
      return null
    }
  }, [agentId, workingDir, cols, rows, onError, isAiMode, aiModel, aiSystemPrompt])

  // Reconnect
  const reconnect = useCallback(async () => {
    if (isAiMode) {
      // AI mode: just re-show prompt
      const terminal = terminalRef.current
      aiSessionRef.current = createAiSession()
      setIsAiGenerating(false)
      terminal?.clear()
      terminal?.reset()
      setHasError(false)
      setErrorMessage(null)
      terminal?.write(AI_PROMPT)
      return null
    }

    if (sessionId) {
      try {
        await invoke('close_terminal_session', { sessionId })
      } catch {
        // Session may already be dead
      }
    }

    terminalRef.current?.clear()
    terminalRef.current?.reset()

    setHasError(false)
    setErrorMessage(null)
    const info = await spawn()
    return info
  }, [sessionId, spawn, isAiMode])

  // Write data to xterm
  const write = useCallback((data: string) => {
    terminalRef.current?.write(data)
  }, [])

  // Resize the PTY session
  const resize = useCallback(
    async (newCols: number, newRows: number) => {
      if (isAiMode || !sessionId) return
      try {
        await invoke('resize_terminal_session', { sessionId, cols: newCols, rows: newRows })
      } catch (e) {
        console.error('Failed to resize terminal:', e)
      }
    },
    [sessionId, isAiMode]
  )

  // Close the session
  const close = useCallback(async () => {
    if (isAiMode) {
      // AI mode: just reset state
      aiSessionRef.current = createAiSession()
      setIsAiGenerating(false)
      terminalRef.current?.clear()
      setSessionId(null)
      setIsConnected(false)
      return
    }

    if (!sessionId) return
    try {
      await invoke('close_terminal_session', { sessionId })
      bufferSnapshots.delete(sessionId)
      terminalRef.current?.clear()
      sessionRef.current = null
      setSessionId(null)
      setIsConnected(false)
    } catch (e) {
      console.error('Failed to close terminal session:', e)
    }
  }, [sessionId, isAiMode])

  // Search helpers
  const searchNext = useCallback((query: string) => {
    searchAddonRef.current?.findNext(query, { regex: false, caseSensitive: false })
  }, [])

  const searchPrevious = useCallback((query: string) => {
    searchAddonRef.current?.findPrevious(query, { regex: false, caseSensitive: false })
  }, [])

  const clearSearch = useCallback(() => {
    searchAddonRef.current?.clearDecorations()
    setIsSearchOpen(false)
  }, [])

  // Copy selected text
  const copySelection = useCallback(() => {
    const terminal = terminalRef.current
    if (!terminal) return
    const selection = terminal.getSelection()
    if (selection) {
      navigator.clipboard.writeText(selection).catch(() => {})
    }
  }, [])

  // Clear AI conversation — resets history, clears terminal, shows fresh prompt
  const clearConversation = useCallback(() => {
    if (!isAiMode) return

    // Cancel any in-progress generation
    const aiSession = aiSessionRef.current
    if (aiSession.isGenerating) {
      aiSession.abortController?.abort()
      aiSession.isGenerating = false
      setIsAiGenerating(false)
    }

    // Preserve system prompt, reset everything else
    const systemPrompt = aiSession.messages.find((m) => m.role === 'system')?.content
    aiSessionRef.current = createAiSession()
    if (systemPrompt) {
      aiSessionRef.current.messages.push({
        role: 'system',
        content: systemPrompt,
      })
    }
    setConversationVersion((v) => v + 1)

    // Clear terminal and show fresh welcome + prompt
    const terminal = terminalRef.current
    if (terminal) {
      terminal.clear()
      terminal.writeln(
        `\x1b[1;36m╭─── ${agentId}@mothership ─── model: ${aiModel} ─── conversation cleared\x1b[0m`
      )
      terminal.writeln(
        `\x1b[2;36m│ Type your message and press Enter. Ctrl+C to cancel, Ctrl+L to clear.\x1b[0m`
      )
      terminal.writeln(
        `\x1b[1;36m╰──────────────────────────────────────────────────\x1b[0m`
      )
      terminal.write('\r\n')
      terminal.write(AI_PROMPT)
    }
  }, [isAiMode, agentId, aiModel])

  // Export conversation as Markdown
  const exportConversationAsMarkdown = useCallback(() => {
    if (!isAiMode) return
    const messages = aiSessionRef.current.messages
    // Don't export if only system prompt exists
    const userOrAssistant = messages.filter((m) => m.role !== 'system')
    if (userOrAssistant.length === 0) return

    const timestamp = new Date().toISOString().split('T')[0]
    let md = `# AI Conversation — ${agentId}@${aiModel}\n`
    md += `> Exported: ${timestamp}\n`
    md += `> Messages: ${userOrAssistant.length}\n\n`

    for (const msg of messages) {
      if (msg.role === 'system') {
        md += `---\n\n**System:** ${msg.content}\n\n`
      } else if (msg.role === 'user') {
        md += `## 👤 User\n\n${msg.content}\n\n`
      } else if (msg.role === 'assistant') {
        md += `## 🤖 ${agentId}\n\n${msg.content}\n\n`
      }
    }

    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${agentId}-chat-${timestamp}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [isAiMode, agentId, aiModel])

  // Export conversation as JSON
  const exportConversationAsJson = useCallback(() => {
    if (!isAiMode) return
    const messages = aiSessionRef.current.messages
    const nonSystem = messages.filter((m) => m.role !== 'system')
    if (nonSystem.length === 0) return

    const timestamp = new Date().toISOString().split('T')[0]
    const data = {
      exportedAt: new Date().toISOString(),
      agentId,
      model: aiModel,
      messageCount: nonSystem.length,
      messages,
    }

    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${agentId}-chat-${timestamp}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [isAiMode, agentId, aiModel])

  // Paste from clipboard
  const pasteFromClipboard = useCallback(async () => {
    if (isAiMode) {
      // In AI mode, paste into the input buffer instead of sending to PTY
      try {
        const text = await navigator.clipboard.readText()
        if (text && aiSessionRef.current) {
          aiSessionRef.current.buffer += text
          terminalRef.current?.write(text)
        }
      } catch (e) {
        console.error('Failed to paste:', e)
      }
      return
    }

    if (!sessionId) return
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        await invoke('write_terminal_input', { sessionId, data: text })
      }
    } catch (e) {
      console.error('Failed to paste:', e)
    }
  }, [sessionId, isAiMode])

  // Wire clipboard shortcuts
  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return

    terminal.attachCustomKeyEventHandler((e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C' && e.type === 'keydown') {
        copySelection()
        return false
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V' && e.type === 'keydown') {
        pasteFromClipboard()
        return false
      }
      return true
    })

    return () => {
      // Terminal dispose will clean up
    }
  }, [copySelection, pasteFromClipboard])

  // Auto-cleanup on unmount
  useEffect(() => {
    return () => {
      if (sessionId && terminalRef.current) {
        bufferSnapshots.set(sessionId, captureBufferSnapshot(terminalRef.current))
      }
    }
  }, [sessionId])

  // Conversation history (AI mode only) — version counter ensures reactivity
  const conversationMessages = useMemo(() => {
    return aiSessionRef.current.messages
  }, [conversationVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  const messageCount = useMemo(() => {
    return conversationMessages.filter((m) => m.role !== 'system').length
  }, [conversationMessages, conversationVersion])

  /**
   * Jump to a specific exchange in the conversation:
   * clears the terminal, rewrites all messages up to that exchange index,
   * and fills the input buffer with a follow-up prompt referencing that exchange.
   */
  const jumpToMessage = useCallback((exchangeIndex: number) => {
    if (!isAiMode) return
    const terminal = terminalRef.current
    if (!terminal) return

    const messages = aiSessionRef.current.messages
    const nonSystem = messages.filter((m) => m.role !== 'system')
    if (exchangeIndex >= nonSystem.length) return

    // Find the actual message index in the full array
    let nonSystemIdx = -1
    let targetMsgIdx = -1
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role !== 'system') {
        nonSystemIdx++
        if (nonSystemIdx === exchangeIndex) {
          targetMsgIdx = i
          break
        }
      }
    }
    if (targetMsgIdx === -1) return

    // Get the exchange pair (user + assistant)
    const targetUserMsg = messages[targetMsgIdx]
    const targetAssistantMsg =
      targetMsgIdx + 1 < messages.length && messages[targetMsgIdx + 1].role === 'assistant'
        ? messages[targetMsgIdx + 1]
        : null

    // Show the referenced exchange by writing it to the terminal
    terminal.writeln('')
    terminal.writeln(
      `\x1b[1;35m╭─── Referenced Exchange #${exchangeIndex + 1} ──────────────────\x1b[0m`
    )
    terminal.writeln(`\x1b[36mUser:\x1b[0m ${targetUserMsg.content}`)
    if (targetAssistantMsg) {
      terminal.writeln(`\x1b[33m${agentId}:\x1b[0m ${targetAssistantMsg.content.slice(0, 200)}`)
      if (targetAssistantMsg.content.length > 200) {
        terminal.writeln(`\x1b[2;33m... (${targetAssistantMsg.content.length - 200} more chars)\x1b[0m`)
      }
    }
    terminal.writeln(
      `\x1b[1;35m╰──────────────────────────────────────────────────\x1b[0m`
    )
    terminal.write('\r\n')

    // Fill buffer with a reference prompt
    const bufferText = `/ref exchange:${exchangeIndex + 1}`
    aiSessionRef.current.buffer = bufferText
    terminal.write(bufferText)

    // Auto-close the history panel
    setShowHistory(false)
  }, [isAiMode, agentId])

  return {
    containerRef,
    sessionId,
    isConnected,
    isPaused,
    hasError,
    errorMessage,
    isSearchOpen,
    setIsSearchOpen,
    showHistory,
    setShowHistory,
    conversationMessages,
    messageCount,
    jumpToMessage,
    isAiMode,
    isAiGenerating,
    sessionInfo: sessionRef.current,
    spawn,
    reconnect,
    write,
    resize,
    close,
    searchNext,
    searchPrevious,
    clearSearch,
    copySelection,
    pasteFromClipboard,
    clearConversation,
    exportConversationAsMarkdown,
    exportConversationAsJson,
  }
}
