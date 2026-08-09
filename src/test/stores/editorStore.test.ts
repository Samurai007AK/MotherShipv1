import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from '../../stores/editorStore'

describe('editorStore', () => {
  beforeEach(() => {
    useEditorStore.setState({
      openFiles: [],
      activeFilePath: null,
    })
  })

  // ── Initial state ───────────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts with no open files', () => {
      const state = useEditorStore.getState()
      expect(state.openFiles).toEqual([])
      expect(state.activeFilePath).toBeNull()
    })
  })

  // ── openFile ────────────────────────────────────────────────────────────

  describe('openFile', () => {
    it('adds a new file to openFiles', () => {
      useEditorStore.getState().openFile('/project/src/App.tsx', 'App.tsx', 'console.log("hello")')

      const { openFiles } = useEditorStore.getState()
      expect(openFiles).toHaveLength(1)
      expect(openFiles[0].path).toBe('/project/src/App.tsx')
      expect(openFiles[0].name).toBe('App.tsx')
      expect(openFiles[0].content).toBe('console.log("hello")')
      expect(openFiles[0].isDirty).toBe(false)
    })

    it('sets the new file as active', () => {
      useEditorStore.getState().openFile('/project/src/App.tsx', 'App.tsx', 'content')

      expect(useEditorStore.getState().activeFilePath).toBe('/project/src/App.tsx')
    })

    it('detects TypeScript language from .tsx extension', () => {
      useEditorStore.getState().openFile('/project/src/App.tsx', 'App.tsx', '')

      expect(useEditorStore.getState().openFiles[0].language).toBe('typescript')
    })

    it('detects Python language from .py extension', () => {
      useEditorStore.getState().openFile('/project/script.py', 'script.py', '')

      expect(useEditorStore.getState().openFiles[0].language).toBe('python')
    })

    it('detects CSS language from .css extension', () => {
      useEditorStore.getState().openFile('/project/style.css', 'style.css', '')

      expect(useEditorStore.getState().openFiles[0].language).toBe('css')
    })

    it('detects HTML language from .html extension', () => {
      useEditorStore.getState().openFile('/project/index.html', 'index.html', '')

      expect(useEditorStore.getState().openFiles[0].language).toBe('html')
    })

    it('defaults to text for unknown extensions', () => {
      useEditorStore.getState().openFile('/project/file.xyz', 'file.xyz', '')

      expect(useEditorStore.getState().openFiles[0].language).toBe('text')
    })

    it('switches to existing file without duplicating', () => {
      useEditorStore.getState().openFile('/project/a.ts', 'a.ts', 'aaa')
      useEditorStore.getState().openFile('/project/b.ts', 'b.ts', 'bbb')
      useEditorStore.getState().openFile('/project/a.ts', 'a.ts', 'aaa')

      const { openFiles } = useEditorStore.getState()
      expect(openFiles).toHaveLength(2)
      expect(useEditorStore.getState().activeFilePath).toBe('/project/a.ts')
    })
  })

  // ── closeFile ───────────────────────────────────────────────────────────

  describe('closeFile', () => {
    it('removes a file from openFiles', () => {
      useEditorStore.getState().openFile('/project/a.ts', 'a.ts', 'aaa')
      useEditorStore.getState().openFile('/project/b.ts', 'b.ts', 'bbb')
      useEditorStore.getState().closeFile('/project/a.ts')

      expect(useEditorStore.getState().openFiles).toHaveLength(1)
      expect(useEditorStore.getState().openFiles[0].path).toBe('/project/b.ts')
    })

    it('switches active file to last file when closing active file', () => {
      useEditorStore.getState().openFile('/project/a.ts', 'a.ts', 'aaa')
      useEditorStore.getState().openFile('/project/b.ts', 'b.ts', 'bbb')
      useEditorStore.getState().closeFile('/project/b.ts')

      expect(useEditorStore.getState().activeFilePath).toBe('/project/a.ts')
    })

    it('sets activeFilePath to null when closing the last file', () => {
      useEditorStore.getState().openFile('/project/a.ts', 'a.ts', 'aaa')
      useEditorStore.getState().closeFile('/project/a.ts')

      expect(useEditorStore.getState().activeFilePath).toBeNull()
      expect(useEditorStore.getState().openFiles).toHaveLength(0)
    })

    it('does nothing for non-existent file', () => {
      useEditorStore.getState().openFile('/project/a.ts', 'a.ts', 'aaa')
      useEditorStore.getState().closeFile('/project/nonexistent.ts')

      expect(useEditorStore.getState().openFiles).toHaveLength(1)
    })
  })

  // ── setActiveFile ───────────────────────────────────────────────────────

  describe('setActiveFile', () => {
    it('switches active file to an open file', () => {
      useEditorStore.getState().openFile('/project/a.ts', 'a.ts', 'aaa')
      useEditorStore.getState().openFile('/project/b.ts', 'b.ts', 'bbb')
      useEditorStore.getState().setActiveFile('/project/a.ts')

      expect(useEditorStore.getState().activeFilePath).toBe('/project/a.ts')
    })
  })

  // ── updateContent ───────────────────────────────────────────────────────

  describe('updateContent', () => {
    it('updates content of an open file', () => {
      useEditorStore.getState().openFile('/project/a.ts', 'a.ts', 'original content')
      useEditorStore.getState().updateContent('/project/a.ts', 'modified content')

      expect(useEditorStore.getState().openFiles[0].content).toBe('modified content')
    })

    it('marks file as dirty when content changes', () => {
      useEditorStore.getState().openFile('/project/a.ts', 'a.ts', 'original content')
      useEditorStore.getState().updateContent('/project/a.ts', 'modified content')

      expect(useEditorStore.getState().openFiles[0].isDirty).toBe(true)
    })

    it('marks file as clean when content matches original', () => {
      useEditorStore.getState().openFile('/project/a.ts', 'a.ts', 'same content')
      useEditorStore.getState().updateContent('/project/a.ts', 'same content')

      expect(useEditorStore.getState().openFiles[0].isDirty).toBe(false)
    })

    it('does not affect other files', () => {
      useEditorStore.getState().openFile('/project/a.ts', 'a.ts', 'aaa')
      useEditorStore.getState().openFile('/project/b.ts', 'b.ts', 'bbb')
      useEditorStore.getState().updateContent('/project/a.ts', 'modified')

      const { openFiles } = useEditorStore.getState()
      expect(openFiles[0].content).toBe('modified')
      expect(openFiles[1].content).toBe('bbb')
    })
  })

  // ── markSaved ───────────────────────────────────────────────────────────

  describe('markSaved', () => {
    it('sets isDirty to false after save', () => {
      useEditorStore.getState().openFile('/project/a.ts', 'a.ts', 'original')
      useEditorStore.getState().updateContent('/project/a.ts', 'modified')
      expect(useEditorStore.getState().openFiles[0].isDirty).toBe(true)

      useEditorStore.getState().markSaved('/project/a.ts')

      expect(useEditorStore.getState().openFiles[0].isDirty).toBe(false)
    })

    it('updates originalContent to current content', () => {
      useEditorStore.getState().openFile('/project/a.ts', 'a.ts', 'original')
      useEditorStore.getState().updateContent('/project/a.ts', 'modified')
      useEditorStore.getState().markSaved('/project/a.ts')

      const file = useEditorStore.getState().openFiles[0]
      expect(file.originalContent).toBe('modified')
      expect(file.content).toBe('modified')
    })
  })

  // ── getActiveFile ───────────────────────────────────────────────────────

  describe('getActiveFile', () => {
    it('returns the active file', () => {
      useEditorStore.getState().openFile('/project/a.ts', 'a.ts', 'aaa')

      const active = useEditorStore.getState().getActiveFile()
      expect(active).not.toBeUndefined()
      expect(active?.path).toBe('/project/a.ts')
    })

    it('returns undefined when no file is active', () => {
      const active = useEditorStore.getState().getActiveFile()
      expect(active).toBeUndefined()
    })
  })
})
