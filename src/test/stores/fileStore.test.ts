import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { useFileStore, type FileEntry } from '../../stores/fileStore'

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

const mockInvoke = vi.mocked(invoke)

// ── Fixtures ──────────────────────────────────────────────────────────────

const mockFiles: FileEntry[] = [
  { path: '/project/src/App.tsx', name: 'App.tsx', ext: 'tsx', isDir: false, size: 1024 },
  { path: '/project/src/main.ts', name: 'main.ts', ext: 'ts', isDir: false, size: 512 },
  { path: '/project/src/styles.css', name: 'styles.css', ext: 'css', isDir: false, size: 2048 },
  { path: '/project/src/utils/helpers.ts', name: 'helpers.ts', ext: 'ts', isDir: false, size: 768 },
  { path: '/project/README.md', name: 'README.md', ext: 'md', isDir: false, size: 128 },
  { path: '/project/src', name: 'src', ext: '', isDir: true, size: 0 },
  { path: '/project/node_modules', name: 'node_modules', ext: '', isDir: true, size: 0 },
]

// ── Tests ─────────────────────────────────────────────────────────────────

describe('fileStore', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    vi.useFakeTimers()
    useFileStore.setState({
      files: [],
      isLoading: false,
      lastFetch: null,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── Initial state ───────────────────────────────────────────────────────

  describe('initial state', () => {
    it('has empty files array', () => {
      const state = useFileStore.getState()
      expect(state.files).toEqual([])
      expect(state.isLoading).toBe(false)
      expect(state.lastFetch).toBeNull()
    })
  })

  // ── fetchFiles ──────────────────────────────────────────────────────────

  describe('fetchFiles', () => {
    it('calls list_project_files IPC command', async () => {
      mockInvoke.mockResolvedValue(mockFiles)

      await useFileStore.getState().fetchFiles()

      expect(mockInvoke).toHaveBeenCalledWith('list_project_files')
    })

    it('stores fetched files in state', async () => {
      mockInvoke.mockResolvedValue(mockFiles)

      await useFileStore.getState().fetchFiles()

      const { files } = useFileStore.getState()
      expect(files).toEqual(mockFiles)
      expect(files.length).toBe(7)
    })

    it('records lastFetch timestamp after successful fetch', async () => {
      mockInvoke.mockResolvedValue(mockFiles)

      await useFileStore.getState().fetchFiles()

      const { lastFetch } = useFileStore.getState()
      expect(lastFetch).not.toBeNull()
      expect(typeof lastFetch).toBe('number')
    })

    it('does not re-fetch within 30-second cache window', async () => {
      mockInvoke.mockResolvedValue(mockFiles)
      await useFileStore.getState().fetchFiles()
      expect(mockInvoke).toHaveBeenCalledTimes(1)

      mockInvoke.mockClear()

      // Second call within 30s should not invoke IPC
      await useFileStore.getState().fetchFiles()
      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('re-fetches after 30-second cache expires', async () => {
      mockInvoke.mockResolvedValue(mockFiles)
      await useFileStore.getState().fetchFiles()
      expect(mockInvoke).toHaveBeenCalledTimes(1)

      // Advance time past the 30s cache
      await vi.advanceTimersByTimeAsync(31000)

      mockInvoke.mockClear()
      mockInvoke.mockResolvedValue(mockFiles)

      await useFileStore.getState().fetchFiles()
      expect(mockInvoke).toHaveBeenCalledTimes(1)
    })

    it('sets isLoading during fetch', async () => {
      let resolvePromise!: (value: FileEntry[]) => void
      mockInvoke.mockReturnValue(new Promise((resolve) => { resolvePromise = resolve }))

      const fetchPromise = useFileStore.getState().fetchFiles()

      expect(useFileStore.getState().isLoading).toBe(true)

      resolvePromise(mockFiles)
      await fetchPromise

      expect(useFileStore.getState().isLoading).toBe(false)
    })

    it('handles IPC failure gracefully', async () => {
      mockInvoke.mockRejectedValue(new Error('IPC error'))

      await expect(useFileStore.getState().fetchFiles()).resolves.toBeUndefined()

      const state = useFileStore.getState()
      expect(state.files).toEqual([])
      expect(state.isLoading).toBe(false)
      // lastFetch should remain null since the fetch failed
      expect(state.lastFetch).toBeNull()
    })
  })

  // ── searchFiles ─────────────────────────────────────────────────────────

  describe('searchFiles', () => {
    beforeEach(async () => {
      mockInvoke.mockResolvedValue(mockFiles)
      await useFileStore.getState().fetchFiles()
    })

    it('returns first 20 non-directory files for empty query', () => {
      const results = useFileStore.getState().searchFiles('')
      expect(results.every((f) => !f.isDir)).toBe(true)
      expect(results.length).toBeLessThanOrEqual(20)
    })

    it('filters by file name (case-insensitive)', () => {
      const results = useFileStore.getState().searchFiles('app')
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results.every((f) => f.name.toLowerCase().includes('app'))).toBe(true)
    })

    it('filters by file extension', () => {
      const results = useFileStore.getState().searchFiles('ts')
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results.every((f) => f.ext.toLowerCase().includes('ts'))).toBe(true)
    })

    it('filters by file path', () => {
      const results = useFileStore.getState().searchFiles('utils')
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results.every((f) => f.path.toLowerCase().includes('utils'))).toBe(true)
    })

    it('returns empty array for non-matching query', () => {
      const results = useFileStore.getState().searchFiles('xyznonexistent')
      expect(results).toEqual([])
    })

    it('excludes directories from results', () => {
      const results = useFileStore.getState().searchFiles('')
      expect(results.some((f) => f.isDir)).toBe(false)
    })

    it('limits results to 20 items', () => {
      const manyFiles: FileEntry[] = Array.from({ length: 50 }, (_, i) => ({
        path: `/project/file-${i}.ts`,
        name: `file-${i}.ts`,
        ext: 'ts',
        isDir: false,
        size: 100,
      }))
      useFileStore.setState({ files: manyFiles })

      const results = useFileStore.getState().searchFiles('')
      expect(results.length).toBe(20)
    })

    it('returns empty array when no files have been loaded', () => {
      useFileStore.setState({ files: [] })
      const results = useFileStore.getState().searchFiles('test')
      expect(results).toEqual([])
    })
  })
})
