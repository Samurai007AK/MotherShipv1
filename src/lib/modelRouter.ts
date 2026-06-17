/**
 * Mothership — Model Router Client
 *
 * Communicates with Ollama via Tauri commands for local LLM inference.
 * Supports model discovery, chat completion, and streaming.
 */

import { invoke } from '@tauri-apps/api/core'

// --- Types ---

export interface ModelInfo {
  name: string
  size: number
  parameter_size: string
  quantization: string
  modified_at: string
}

export interface OllamaStatus {
  running: boolean
  model_count: number
  version: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  stream?: boolean
  temperature?: number
  max_tokens?: number
}

export interface ChatResponse {
  content: string
  model: string
  total_duration_ms: number
  eval_count?: number
}

// --- Client ---

/**
 * List all available Ollama models.
 */
export async function listModels(): Promise<ModelInfo[]> {
  try {
    return await invoke<ModelInfo[]>('list_ollama_models')
  } catch (e) {
    console.error('Failed to list Ollama models:', e)
    return []
  }
}

/**
 * Check if Ollama is running.
 */
export async function checkStatus(): Promise<OllamaStatus> {
  try {
    return await invoke<OllamaStatus>('check_ollama_status')
  } catch {
    return { running: false, model_count: 0, version: 'disconnected' }
  }
}

/**
 * Send a chat completion request (non-streaming, via Tauri backend).
 */
export async function chatCompletion(request: ChatRequest): Promise<ChatResponse> {
  return invoke<ChatResponse>('chat_completion', { request })
}

/**
 * Send a streaming chat completion request via direct Ollama HTTP call.
 *
 * Parses Ollama's NDJSON SSE stream and calls onToken for each content chunk.
 * Calls onDone with the full assembled content when the stream completes.
 * Supports AbortSignal via AbortController for cancellation (Ctrl+C).
 */
export async function chatCompletionStream(
  request: ChatRequest,
  onToken: (token: string) => void,
  onDone: (fullContent: string, stats: { total_duration_ms: number; eval_count: number }) => void,
  onError: (error: string) => void,
  signal?: AbortSignal
): Promise<void> {
  try {
    const body = JSON.stringify({
      model: request.model,
      messages: request.messages,
      stream: true,
      options: {
        temperature: request.temperature ?? 0.7,
        num_predict: request.max_tokens,
      },
    })

    const response = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal,
    })

    if (!response.ok) {
      onError(`Ollama returned status ${response.status}`)
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      onError('No response body from Ollama')
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let fullContent = ''
    let totalDurationMs = 0
    let evalCount = 0

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process complete lines (NDJSON — one JSON object per line)
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? '' // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          try {
            const chunk = JSON.parse(trimmed)
            const content = chunk.message?.content ?? ''
            if (content) {
              fullContent += content
              onToken(content)
            }
            if (chunk.done) {
              totalDurationMs = chunk.total_duration
                ? Math.round(chunk.total_duration / 1_000_000)
                : 0
              evalCount = chunk.eval_count ?? 0
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        // User cancelled — still report what we have so far
        onDone(fullContent, { total_duration_ms: totalDurationMs, eval_count: evalCount })
        return
      }
      throw e
    }

    onDone(fullContent, { total_duration_ms: totalDurationMs, eval_count: evalCount })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    onError(message)
  }
}

/**
 * Generate a simple response from a prompt.
 */
export async function generateResponse(
  model: string,
  prompt: string,
  systemPrompt?: string,
  temperature?: number
): Promise<ChatResponse> {
  return invoke<ChatResponse>('generate_response', {
    model,
    prompt,
    systemPrompt,
    temperature,
  })
}

/**
 * Format model size for display.
 */
export function formatModelSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/**
 * Extract model family from name (e.g., "llama3.2:3b" → "llama").
 */
export function getModelFamily(name: string): string {
  const base = name.split(':')[0].toLowerCase()
  if (base.startsWith('llama')) return 'llama'
  if (base.startsWith('codellama')) return 'codellama'
  if (base.startsWith('mistral') || base.startsWith('mixtral')) return 'mistral'
  if (base.startsWith('gemma')) return 'gemma'
  if (base.startsWith('phi')) return 'phi'
  if (base.startsWith('qwen')) return 'qwen'
  if (base.startsWith('deepseek')) return 'deepseek'
  return base
}

/**
 * Get a color for the model family.
 */
export function getModelColor(family: string): string {
  const colors: Record<string, string> = {
    llama: '#8b5cf6',
    codellama: '#6366f1',
    mistral: '#f59e0b',
    gemini: '#10b981',
    phi: '#3b82f6',
    qwen: '#ef4444',
    deepseek: '#06b6d4',
  }
  return colors[family] || '#6b7280'
}
