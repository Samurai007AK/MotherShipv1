import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useWorktreeInit } from '../../hooks/useWorktreeInit'

// ── Mock data ───────────────────────────────────────────────────────────

const MOCK_PROJECT_INFO = {
  rootPath: '/home/user/project',
  currentBranch: 'main',
  hasRemotes: true,
  remoteName: 'origin',
  hasUncommitted: false,
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('useWorktreeInit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls detectProject with "." on mount', async () => {
    const detectProject = vi.fn().mockResolvedValue(null) // no git repo
    const listWorktrees = vi.fn()

    renderHook(() => useWorktreeInit(detectProject, listWorktrees))

    await waitFor(() => {
      expect(detectProject).toHaveBeenCalledWith('.')
    })
  })

  it('calls listWorktrees with the detected rootPath when a project is found', async () => {
    const detectProject = vi.fn().mockResolvedValue(MOCK_PROJECT_INFO)
    const listWorktrees = vi.fn().mockResolvedValue(undefined)

    renderHook(() => useWorktreeInit(detectProject, listWorktrees))

    await waitFor(() => {
      expect(listWorktrees).toHaveBeenCalledWith(MOCK_PROJECT_INFO.rootPath)
    })
  })

  it('does not call listWorktrees when detectProject returns null', async () => {
    const detectProject = vi.fn().mockResolvedValue(null)
    const listWorktrees = vi.fn()

    renderHook(() => useWorktreeInit(detectProject, listWorktrees))

    // Wait for detectProject to resolve
    await waitFor(() => {
      expect(detectProject).toHaveBeenCalled()
    })

    // listWorktrees should NOT have been called
    expect(listWorktrees).not.toHaveBeenCalled()
  })

  it('calls detectProject before listWorktrees (sequential ordering)', async () => {
    let detectCalled = false
    const detectProject = vi.fn().mockImplementation(async () => {
      detectCalled = true
      return MOCK_PROJECT_INFO
    })
    const listWorktrees = vi.fn().mockImplementation(async () => {
      // If detect hasn't been called yet, something is wrong
      if (!detectCalled) throw new Error('detectProject was not called first')
    })

    renderHook(() => useWorktreeInit(detectProject, listWorktrees))

    await waitFor(() => {
      expect(listWorktrees).toHaveBeenCalled()
    })
  })

  it('only runs the effect once (stable deps)', async () => {
    const detectProject = vi.fn().mockResolvedValue(null)
    const listWorktrees = vi.fn()

    const { rerender } = renderHook(() =>
      useWorktreeInit(detectProject, listWorktrees)
    )

    await waitFor(() => {
      expect(detectProject).toHaveBeenCalledTimes(1)
    })

    // Re-render with the same references — effect should NOT fire again
    rerender()

    expect(detectProject).toHaveBeenCalledTimes(1)
    expect(listWorktrees).not.toHaveBeenCalled()
  })
})
