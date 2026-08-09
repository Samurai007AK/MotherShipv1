import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  listModels,
  checkStatus,
  chatCompletion,
  chatCompletionStream,
  generateResponse,
  formatModelSize,
  getModelFamily,
  getModelColor,
} from '../../lib/modelRouter'

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

const { invoke } = await import('@tauri-apps/api/core')
const mockInvoke = vi.mocked(invoke)

// ── Pure utilities (no mocking needed) ───────────────────────────────

describe('formatModelSize', () => {
  it('formats bytes as KB for values under 1 MB', () => {
    expect(formatModelSize(512)).toBe('1 KB')
    expect(formatModelSize(1024)).toBe('1 KB')
    expect(formatModelSize(1536)).toBe('2 KB')
  })

  it('formats bytes as MB for values under 1 GB', () => {
    expect(formatModelSize(1048576)).toBe('1 MB')
    expect(formatModelSize(5242880)).toBe('5 MB')
  })

  it('formats bytes as GB for values 1 GB and above', () => {
    expect(formatModelSize(1073741824)).toBe('1.0 GB')
    expect(formatModelSize(2147483648)).toBe('2.0 GB')
    expect(formatModelSize(1610612736)).toBe('1.5 GB')
  })
})

describe('getModelFamily', () => {
  it('returns "llama" for llama model names', () => {
    expect(getModelFamily('llama3.2:3b')).toBe('llama')
    expect(getModelFamily('llama3.1:8b')).toBe('llama')
    expect(getModelFamily('LLAMA2:7b')).toBe('llama')
  })

  it('returns "codellama" for codellama models', () => {
    expect(getModelFamily('codellama:13b')).toBe('codellama')
  })

  it('returns "mistral" for mistral/mixtral models', () => {
    expect(getModelFamily('mistral:7b')).toBe('mistral')
    expect(getModelFamily('mixtral:8x7b')).toBe('mistral')
  })

  it('returns "gemma" for gemma models', () => {
    expect(getModelFamily('gemma:2b')).toBe('gemma')
  })

  it('returns "phi" for phi models', () => {
    expect(getModelFamily('phi3:3.8b')).toBe('phi')
  })

  it('returns "qwen" for qwen models', () => {
    expect(getModelFamily('qwen2.5:7b')).toBe('qwen')
  })

  it('returns "deepseek" for deepseek models', () => {
    expect(getModelFamily('deepseek-coder:6.7b')).toBe('deepseek')
  })

  it('returns the base name for unknown model families', () => {
    expect(getModelFamily('nomic-embed-text:v1.5')).toBe('nomic-embed-text')
  })
})

describe('getModelColor', () => {
  it('returns llama purple', () => {
    expect(getModelColor('llama')).toBe('#8b5cf6')
  })

  it('returns mistral amber', () => {
    expect(getModelColor('mistral')).toBe('#f59e0b')
  })

  it('returns default gray for unknown families', () => {
    expect(getModelColor('nomic')).toBe('#6b7280')
  })
})

// ── Invoke-based functions ───────────────────────────────────────────

describe('listModels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns list of models from invoke', async () => {
    const fakeModels = [
      { name: 'llama3.2:3b', size: 2e9, parameter_size: '3B', quantization: 'Q4_K_M', modified_at: '2025-01-01' },
    ]
    mockInvoke.mockResolvedValue(fakeModels)
    const result = await listModels()
    expect(result).toEqual(fakeModels)
    expect(mockInvoke).toHaveBeenCalledWith('list_ollama_models')
  })

  it('returns empty array on invoke failure', async () => {
    mockInvoke.mockRejectedValue(new Error('Ollama not found'))
    const result = await listModels()
    expect(result).toEqual([])
  })
})

describe('checkStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns status from invoke', async () => {
    const status = { running: true, model_count: 3, version: '0.5.4' }
    mockInvoke.mockResolvedValue(status)
    const result = await checkStatus()
    expect(result).toEqual(status)
    expect(mockInvoke).toHaveBeenCalledWith('check_ollama_status')
  })

  it('returns disconnected status on invoke failure', async () => {
    mockInvoke.mockRejectedValue(new Error('Connection refused'))
    const result = await checkStatus()
    expect(result).toEqual({ running: false, model_count: 0, version: 'disconnected' })
  })
})

describe('chatCompletion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends request to invoke and returns response', async () => {
    const response = { content: 'Hello!', model: 'llama3.2:3b', total_duration_ms: 500, eval_count: 42 }
    mockInvoke.mockResolvedValue(response)
    const result = await chatCompletion({
      model: 'llama3.2:3b',
      messages: [{ role: 'user', content: 'Hi' }],
    })
    expect(result).toEqual(response)
    expect(mockInvoke).toHaveBeenCalledWith('chat_completion', {
      request: { model: 'llama3.2:3b', messages: [{ role: 'user', content: 'Hi' }] },
    })
  })
})

describe('generateResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends generate request to invoke', async () => {
    const response = { content: 'Generated text', model: 'llama3.2:3b', total_duration_ms: 100 }
    mockInvoke.mockResolvedValue(response)
    const result = await generateResponse('llama3.2:3b', 'Write a poem', 'You are a poet', 0.8)
    expect(result).toEqual(response)
    expect(mockInvoke).toHaveBeenCalledWith('generate_response', {
      model: 'llama3.2:3b',
      prompt: 'Write a poem',
      systemPrompt: 'You are a poet',
      temperature: 0.8,
    })
  })

  it('works without optional params', async () => {
    mockInvoke.mockResolvedValue({ content: '', model: '', total_duration_ms: 0 })
    await generateResponse('default', 'hello')
    expect(mockInvoke).toHaveBeenCalledWith('generate_response', {
      model: 'default',
      prompt: 'hello',
      systemPrompt: undefined,
      temperature: undefined,
    })
  })
})

// ── Streaming (fetch-based) ──────────────────────────────────────────

describe('chatCompletionStream', () => {
  let mockFetch: ReturnType<typeof vi.fn>
  let onToken: (token: string) => void
  let onDone: (content: string, stats: { total_duration_ms: number; eval_count: number }) => void
  let onError: (error: string) => void

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock global fetch
    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    onToken = vi.fn()
    onDone = vi.fn()
    onError = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function makeStreamResponse(chunks: string[]) {
    const encoder = new TextEncoder()
    const streams = chunks.map((c) => encoder.encode(c))
    let index = 0
    return {
      body: {
        getReader: () => ({
          read: async () => {
            if (index < streams.length) {
              return { done: false, value: streams[index++] }
            }
            return { done: true, value: undefined as unknown as Uint8Array }
          },
        }),
      },
      ok: true,
    }
  }

  it('calls onToken for each content chunk and onDone on completion', async () => {
    const ndjson = [
      '{"message":{"content":"Hello"},"done":false}\n',
      '{"message":{"content":" world"},"done":false}\n',
      '{"message":{"content":""},"done":true,"total_duration":5000000000,"eval_count":15}\n',
    ]
    mockFetch.mockResolvedValue(makeStreamResponse(ndjson))

    await chatCompletionStream(
      { model: 'llama3.2:3b', messages: [{ role: 'user', content: 'Hi' }] },
      onToken,
      onDone,
      onError,
    )

    expect(onToken).toHaveBeenCalledTimes(2)
    expect(onToken).toHaveBeenNthCalledWith(1, 'Hello')
    expect(onToken).toHaveBeenNthCalledWith(2, ' world')
    expect(onDone).toHaveBeenCalledWith('Hello world', {
      total_duration_ms: 5000,
      eval_count: 15,
    })
    expect(onError).not.toHaveBeenCalled()
  })

  it('calls onError when fetch returns non-ok status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 })
    await chatCompletionStream(
      { model: 'x', messages: [] },
      onToken,
      onDone,
      onError,
    )
    expect(onError).toHaveBeenCalledWith('Ollama returned status 503')
    expect(onToken).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('calls onError when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('Network failure'))
    await chatCompletionStream(
      { model: 'x', messages: [] },
      onToken,
      onDone,
      onError,
    )
    expect(onError).toHaveBeenCalledWith('Network failure')
  })

  it('calls onError when response body is null', async () => {
    mockFetch.mockResolvedValue({ ok: true, body: null })
    await chatCompletionStream(
      { model: 'x', messages: [] },
      onToken,
      onDone,
      onError,
    )
    expect(onError).toHaveBeenCalledWith('No response body from Ollama')
  })

  it('skips malformed NDJSON lines gracefully', async () => {
    const ndjson = [
      'valid line\n',
      'not::json\n',
      '{"message":{"content":"works"},"done":true,"total_duration":1000000000}\n',
    ]
    mockFetch.mockResolvedValue(makeStreamResponse(ndjson))

    await chatCompletionStream(
      { model: 'x', messages: [] },
      onToken,
      onDone,
      onError,
    )

    expect(onToken).toHaveBeenCalledWith('works')
    expect(onDone).toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('handles AbortSignal by calling onDone with partial content', async () => {
    const controller = new AbortController()
    const encoder = new TextEncoder()
    const chunk = encoder.encode('{"message":{"content":"partial"},"done":false}\n')
    let readCount = 0
    mockFetch.mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => {
            readCount++
            if (readCount === 1) {
              // First read returns partial content
              return { done: false, value: chunk }
            }
            // Second read aborts (simulates user cancellation mid-stream)
            controller.abort()
            throw new DOMException('The operation was aborted', 'AbortError')
          },
        }),
      },
    })

    await chatCompletionStream(
      { model: 'x', messages: [] },
      onToken,
      onDone,
      onError,
      controller.signal,
    )

    expect(onToken).toHaveBeenCalledWith('partial')
    expect(onDone).toHaveBeenCalledWith('partial', {
      total_duration_ms: 0,
      eval_count: 0,
    })
    expect(onError).not.toHaveBeenCalled()
  })

  it('sends correct POST request to Ollama API', async () => {
    mockFetch.mockResolvedValue(makeStreamResponse([
      '{"message":{"content":""},"done":true,"total_duration":0}\n',
    ]))

    await chatCompletionStream(
      {
        model: 'llama3.2:3b',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.5,
        max_tokens: 100,
      },
      onToken,
      onDone,
      onError,
    )

    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/api/chat',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3.2:3b',
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true,
          options: { temperature: 0.5, num_predict: 100 },
        }),
      }),
    )
  })
})
