import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateSummary, checkSummaryHealth, type SummaryResult, type ContextSnapshot } from '../../lib/summaryEngine'

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

const { invoke } = await import('@tauri-apps/api/core')
const mockInvoke = vi.mocked(invoke)

// ── Helpers ──────────────────────────────────────────────────────────

function makeSnapshot(overrides?: Partial<ContextSnapshot>) {
  return {
    trigger: 'agent_switch',
    agent_id: 'claude',
    output_tail: 'Added auth module',
    branch: 'feature/auth',
    open_files: ['src/auth.ts', 'src/types.ts'],
    decisions: ['Use JWT for auth'],
    ...overrides,
  }
}

function assertTemplateResult(result: SummaryResult, snapshots: ReturnType<typeof makeSnapshot>[]) {
  // Template summary always has model_used = 'template'
  expect(result.model_used).toBe('template')

  // Branches should be mentioned
  const branches = [...new Set(snapshots.map((s) => s.branch).filter(Boolean) as string[])]
  if (branches.length > 0) {
    expect(result.summary).toContain(branches[0])
  }

  // Files should be mentioned
  const allFiles = [...new Set(snapshots.flatMap((s) => s.open_files ?? []))]
  if (allFiles.length > 0) {
    expect(result.summary).toContain(allFiles[0])
  }

  // Decisions should be in key_decisions
  const allDecisions = snapshots.flatMap((s) => s.decisions ?? [])
  if (allDecisions.length > 0) {
    expect(result.key_decisions).toContain(allDecisions[0])
  }

  // Current state should mention snapshot count
  expect(result.current_state).toContain(String(snapshots.length))
}

// ── generateSummary ──────────────────────────────────────────────────

describe('generateSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns result from invoke on success', async () => {
    const fakeResult: SummaryResult = {
      summary: 'Claude added auth module',
      key_decisions: ['Use JWT'],
      open_todos: ['Add tests'],
      files_touched: ['src/auth.ts'],
      current_state: 'Auth module in progress',
      model_used: 'llama3.2:3b',
    }
    mockInvoke.mockResolvedValue(fakeResult)

    const result = await generateSummary([makeSnapshot()], 'codex', 'brief')

    expect(result).toEqual(fakeResult)
    expect(mockInvoke).toHaveBeenCalledWith('summarize_context', {
      snapshots: [makeSnapshot()],
      handoffTarget: 'codex',
      style: 'brief',
    })
  })

  it('falls back to template summary when invoke throws', async () => {
    mockInvoke.mockRejectedValue(new Error('Ollama not running'))

    const snapshots = [makeSnapshot()]
    const result = await generateSummary(snapshots, 'codex', 'detailed')

    assertTemplateResult(result, snapshots)
  })

  it('returns template summary for empty snapshots', async () => {
    mockInvoke.mockRejectedValue(new Error('unavailable'))

    const result = await generateSummary([], 'next agent', 'bullet')

    expect(result.model_used).toBe('template')
    expect(result.summary).toBe('No context data captured')
    expect(result.current_state).toBe('Session with 0 snapshots')
  })

  it('uses default handoffTarget and style when not provided', async () => {
    mockInvoke.mockResolvedValue({
      summary: 'Default handoff',
      key_decisions: [],
      open_todos: [],
      files_touched: [],
      current_state: '',
      model_used: 'llama',
    })

    await generateSummary([makeSnapshot()])

    expect(mockInvoke).toHaveBeenCalledWith('summarize_context', {
      snapshots: [makeSnapshot()],
      handoffTarget: 'next agent',
      style: 'brief',
    })
  })

  it('includes branches in template summary', async () => {
    mockInvoke.mockRejectedValue(new Error('unavailable'))

    const snapshots = [
      makeSnapshot({ branch: 'feature/auth' }),
      makeSnapshot({ branch: 'feature/auth' }),
    ]
    const result = await generateSummary(snapshots)

    assertTemplateResult(result, snapshots)
    expect(result.summary).toContain('feature/auth')
  })

  it('includes files touched in template summary', async () => {
    mockInvoke.mockRejectedValue(new Error('unavailable'))

    const snapshots = [
      makeSnapshot({ open_files: ['src/main.ts', 'src/utils.ts'] }),
    ]
    const result = await generateSummary(snapshots)

    assertTemplateResult(result, snapshots)
    expect(result.summary).toContain('src/main.ts')
    expect(result.summary).toContain('src/utils.ts')
  })

  it('includes decisions in template summary results', async () => {
    mockInvoke.mockRejectedValue(new Error('unavailable'))

    const snapshots = [
      makeSnapshot({ decisions: ['Use JWT', 'Add rate limiting'] }),
    ]
    const result = await generateSummary(snapshots)

    assertTemplateResult(result, snapshots)
    expect(result.key_decisions).toContain('Use JWT')
    expect(result.key_decisions).toContain('Add rate limiting')
  })

  it('limits decisions to 5 in template summary', async () => {
    mockInvoke.mockRejectedValue(new Error('unavailable'))

    const decisions = Array.from({ length: 10 }, (_, i) => `Decision ${i + 1}`)
    const snapshots = [makeSnapshot({ decisions })]
    const result = await generateSummary(snapshots)

    expect(result.key_decisions).toHaveLength(5)
  })

  it('limits files_touched to 10 in template summary', async () => {
    mockInvoke.mockRejectedValue(new Error('unavailable'))

    const files = Array.from({ length: 20 }, (_, i) => `file${i}.ts`)
    const snapshots = [makeSnapshot({ open_files: files })]
    const result = await generateSummary(snapshots)

    expect(result.files_touched).toHaveLength(10)
  })

  it('handles snapshots without optional fields gracefully', async () => {
    mockInvoke.mockRejectedValue(new Error('unavailable'))

    const snapshots = [
      { trigger: 'heartbeat', agent_id: 'claude', output_tail: 'idle' },
    ]
    const result = await generateSummary(snapshots)

    expect(result.model_used).toBe('template')
    expect(result.summary).toBe('No context data captured')
    expect(result.key_decisions).toEqual([])
    expect(result.files_touched).toEqual([])
  })

  it('handles multiple snapshots with different branches', async () => {
    mockInvoke.mockRejectedValue(new Error('unavailable'))

    const snapshots = [
      makeSnapshot({ branch: 'feature/auth' }),
      makeSnapshot({ branch: 'feature/api' }),
    ]
    const result = await generateSummary(snapshots)

    expect(result.summary).toContain('feature/auth')
    expect(result.summary).toContain('feature/api')
  })

  it('deduplicates files across snapshots in template summary', async () => {
    mockInvoke.mockRejectedValue(new Error('unavailable'))

    const snapshots = [
      makeSnapshot({ open_files: ['src/shared.ts'] }),
      makeSnapshot({ open_files: ['src/shared.ts'] }),
    ]
    const result = await generateSummary(snapshots)

    // Each file should appear only once in files_touched
    const occurrences = result.files_touched.filter((f) => f === 'src/shared.ts').length
    expect(occurrences).toBe(1)
  })

  it('calls console.warn when invoke fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockInvoke.mockRejectedValue(new Error('Connection refused'))

    await generateSummary([makeSnapshot()])

    expect(warnSpy).toHaveBeenCalled()
    expect(warnSpy.mock.calls[0][0]).toContain('Summary engine unavailable')
    warnSpy.mockRestore()
  })

  it('passes handoffTarget and style through to invoke', async () => {
    mockInvoke.mockResolvedValue({
      summary: '',
      key_decisions: [],
      open_todos: [],
      files_touched: [],
      current_state: '',
      model_used: 'ollama',
    })

    await generateSummary([makeSnapshot()], 'gemini', 'detailed')

    expect(mockInvoke).toHaveBeenCalledWith('summarize_context', {
      snapshots: [makeSnapshot()],
      handoffTarget: 'gemini',
      style: 'detailed',
    })
  })
})

// ── checkSummaryHealth ───────────────────────────────────────────────

describe('checkSummaryHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns health status from invoke on success', async () => {
    const health = { status: 'healthy', ollama_available: true, models: ['llama3.2:3b'] }
    mockInvoke.mockResolvedValue(health)

    const result = await checkSummaryHealth()

    expect(result).toEqual(health)
    expect(mockInvoke).toHaveBeenCalledWith('check_summary_health')
  })

  it('returns unavailable status when invoke fails', async () => {
    mockInvoke.mockRejectedValue(new Error('Connection refused'))

    const result = await checkSummaryHealth()

    expect(result).toEqual({ status: 'unavailable', ollama_available: false, models: [] })
  })

  it('returns unavailable status on network error', async () => {
    mockInvoke.mockRejectedValue(new Error('Network error'))

    const result = await checkSummaryHealth()

    expect(result.status).toBe('unavailable')
    expect(result.ollama_available).toBe(false)
  })
})
