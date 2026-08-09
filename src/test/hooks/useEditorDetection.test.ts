import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useEditorDetection } from '../../hooks/useEditorDetection'

// ── Mock Tauri invoke ──────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'
const mockInvoke = vi.mocked(invoke)

// ── Tests ──────────────────────────────────────────────────────────────────

describe('useEditorDetection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts with both editors set to false', () => {
    // Don't resolve invoke so we can check the initial state synchronously
    mockInvoke.mockReturnValue(new Promise<boolean>(() => {}))

    const { result } = renderHook(() => useEditorDetection())

    expect(result.current).toEqual({ vsCode: false, cursor: false })
  })

  it('calls check_editor_available for code and cursor in parallel', async () => {
    mockInvoke
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)

    renderHook(() => useEditorDetection())

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledTimes(2)
    })

    expect(mockInvoke).toHaveBeenCalledWith('check_editor_available', { editor: 'code' })
    expect(mockInvoke).toHaveBeenCalledWith('check_editor_available', { editor: 'cursor' })
  })

  it('sets editors based on invoke results (both available)', async () => {
    mockInvoke
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)

    const { result } = renderHook(() => useEditorDetection())

    await waitFor(() => {
      expect(result.current).toEqual({ vsCode: true, cursor: true })
    })
  })

  it('sets editors based on invoke results (one available)', async () => {
    mockInvoke
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    const { result } = renderHook(() => useEditorDetection())

    await waitFor(() => {
      expect(result.current).toEqual({ vsCode: true, cursor: false })
    })
  })

  it('sets editors based on invoke results (neither available)', async () => {
    mockInvoke
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)

    const { result } = renderHook(() => useEditorDetection())

    await waitFor(() => {
      expect(result.current).toEqual({ vsCode: false, cursor: false })
    })
  })

  it('falls back to showing both editors when invoke fails', async () => {
    mockInvoke.mockRejectedValue(new Error('IPC not available'))

    const { result } = renderHook(() => useEditorDetection())

    await waitFor(() => {
      expect(result.current).toEqual({ vsCode: true, cursor: true })
    })
  })

  it('only runs the detection effect once', async () => {
    mockInvoke
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    const { result, rerender } = renderHook(() => useEditorDetection())

    await waitFor(() => {
      expect(result.current).toEqual({ vsCode: true, cursor: false })
    })

    // Re-render — the effect should not fire again (empty deps array)
    rerender()

    // Should still have the same result and invoke should still have been called only twice
    expect(mockInvoke).toHaveBeenCalledTimes(2)
    expect(result.current).toEqual({ vsCode: true, cursor: false })
  })
})
