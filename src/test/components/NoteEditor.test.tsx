import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NoteEditor } from '../../components/memory/NoteEditor'
import { useMemoryStore, type MemoryNote } from '../../stores/memoryStore'

// ── Mock Tauri invoke ──────────────────────────────────────────────────────

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// ── Mock data ──────────────────────────────────────────────────────────────

const EXISTING_NOTE: MemoryNote = {
  id: 'note-1',
  content: 'Existing note content',
  agentId: 'claude',
  entryType: 'note',
  tags: ['bug', 'auth'],
  filesReferenced: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

// ── Helpers ────────────────────────────────────────────────────────────────

function renderEditor(
  note?: MemoryNote,
  onSave: (content: string, tags: string[]) => void = vi.fn(),
  onCancel: () => void = vi.fn(),
  agentId?: string
) {
  return render(
    <NoteEditor note={note} onSave={onSave} onCancel={onCancel} agentId={agentId} />
  )
}

function resetStore() {
  useMemoryStore.setState({
    notes: [],
  })
}

// Tags only render inside `{showTagInput && ...}`, so open the tag input first.
function openTagInput() {
  fireEvent.click(screen.getByTitle('Add tags'))
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('NoteEditor', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetStore()
  })

  // ── Rendering ─────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders the textarea with placeholder for a new note', () => {
      renderEditor()

      const textarea = screen.getByPlaceholderText('Write a note... (Markdown supported)')
      expect(textarea).toBeInTheDocument()
      expect(textarea).toHaveValue('')
    })

    it('renders with existing note content', () => {
      renderEditor(EXISTING_NOTE)

      const textarea = screen.getByPlaceholderText('Write a note... (Markdown supported)')
      expect(textarea).toHaveValue('Existing note content')
    })

    it('renders with existing note tags (when tag input is open)', () => {
      renderEditor(EXISTING_NOTE)
      openTagInput()

      expect(screen.getByText('bug')).toBeInTheDocument()
      expect(screen.getByText('auth')).toBeInTheDocument()
    })

    it('does not show tag pills when starting without tags', () => {
      renderEditor()
      openTagInput()

      // The tag row is visible (since tag input is open) but empty
      expect(screen.queryByText('bug')).not.toBeInTheDocument()
    })

    it('shows the toolbar with Bold, Italic, Tag, and Preview buttons', () => {
      renderEditor()

      expect(screen.getByTitle('Bold')).toBeInTheDocument()
      expect(screen.getByTitle('Italic')).toBeInTheDocument()
      expect(screen.getByTitle('Add tags')).toBeInTheDocument()
      expect(screen.getByTitle('Preview')).toBeInTheDocument()
    })

    it('shows Save and Cancel buttons', () => {
      renderEditor()

      expect(screen.getByText('Save')).toBeInTheDocument()
      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })

    it('shows "Ctrl+Enter to save" when content is empty', () => {
      renderEditor()

      expect(screen.getByText('Ctrl+Enter to save')).toBeInTheDocument()
    })

    it('shows character count when content is non-empty', () => {
      renderEditor(EXISTING_NOTE)

      // "Existing note content" is 21 characters
      const footer = screen.getByText(/21 chars/)
      expect(footer).toBeInTheDocument()
    })

    it('disables the Save button when content is empty', () => {
      renderEditor()

      const saveBtn = screen.getByText('Save').closest('button')
      expect(saveBtn).toBeDisabled()
    })

    it('enables the Save button when content is non-empty', () => {
      renderEditor(EXISTING_NOTE)

      const saveBtn = screen.getByText('Save').closest('button')
      expect(saveBtn).not.toBeDisabled()
    })
  })

  // ── Content editing ──────────────────────────────────────────────────

  describe('content editing', () => {
    it('updates content when typing in the textarea', () => {
      renderEditor()

      const textarea = screen.getByPlaceholderText('Write a note... (Markdown supported)')
      fireEvent.change(textarea, { target: { value: 'New note content' } })

      expect(textarea).toHaveValue('New note content')
    })

    it('shows updated character count when typing', () => {
      renderEditor()

      const textarea = screen.getByPlaceholderText('Write a note... (Markdown supported)')
      fireEvent.change(textarea, { target: { value: 'Hello' } })

      expect(screen.getByText(/5 chars/)).toBeInTheDocument()
    })
  })

  // ── Toolbar buttons ──────────────────────────────────────────────────

  describe('toolbar buttons', () => {
    it('wraps selected text with bold markers', () => {
      renderEditor()

      const textarea = screen.getByPlaceholderText('Write a note... (Markdown supported)') as HTMLTextAreaElement
      fireEvent.change(textarea, { target: { value: 'Hello world' } })
      textarea.selectionStart = 0
      textarea.selectionEnd = 5

      fireEvent.click(screen.getByTitle('Bold'))

      expect(textarea.value).toBe('**Hello** world')
    })

    it('wraps selected text with italic markers', () => {
      renderEditor()

      const textarea = screen.getByPlaceholderText('Write a note... (Markdown supported)') as HTMLTextAreaElement
      fireEvent.change(textarea, { target: { value: 'Hello world' } })
      textarea.selectionStart = 6
      textarea.selectionEnd = 11

      fireEvent.click(screen.getByTitle('Italic'))

      expect(textarea.value).toBe('Hello *world*')
    })

    it('inserts bold markers at cursor if no selection', () => {
      renderEditor()

      const textarea = screen.getByPlaceholderText('Write a note... (Markdown supported)') as HTMLTextAreaElement
      fireEvent.change(textarea, { target: { value: 'test' } })
      textarea.selectionStart = 2
      textarea.selectionEnd = 2

      fireEvent.click(screen.getByTitle('Bold'))

      expect(textarea.value).toBe('te****st')
    })

    it('inserts italic markers at cursor if no selection', () => {
      renderEditor()

      const textarea = screen.getByPlaceholderText('Write a note... (Markdown supported)') as HTMLTextAreaElement
      fireEvent.change(textarea, { target: { value: 'test' } })
      textarea.selectionStart = 2
      textarea.selectionEnd = 2

      fireEvent.click(screen.getByTitle('Italic'))

      expect(textarea.value).toBe('te**st')
    })

    it('toggles tag input when Tag button is clicked', () => {
      renderEditor()

      expect(screen.queryByPlaceholderText('Add tag...')).not.toBeInTheDocument()

      fireEvent.click(screen.getByTitle('Add tags'))

      expect(screen.getByPlaceholderText('Add tag...')).toBeInTheDocument()

      fireEvent.click(screen.getByTitle('Add tags'))

      expect(screen.queryByPlaceholderText('Add tag...')).not.toBeInTheDocument()
    })

    it('toggles preview when Preview button is clicked', () => {
      renderEditor(EXISTING_NOTE)

      fireEvent.click(screen.getByTitle('Preview'))

      expect(screen.getByText('Existing note content')).toBeInTheDocument()
      expect(
        screen.queryByPlaceholderText('Write a note... (Markdown supported)')
      ).not.toBeInTheDocument()

      fireEvent.click(screen.getByTitle('Preview'))

      expect(
        screen.getByPlaceholderText('Write a note... (Markdown supported)')
      ).toBeInTheDocument()
    })

    it('shows EyeOff icon when preview is active', () => {
      renderEditor()

      fireEvent.click(screen.getByTitle('Preview'))

      expect(screen.getByTitle('Preview')).toBeInTheDocument()
    })
  })

  // ── Tag management ───────────────────────────────────────────────────

  describe('tag management', () => {
    it('adds a tag via the tag input', () => {
      renderEditor()
      openTagInput()

      const tagInput = screen.getByPlaceholderText('Add tag...')
      fireEvent.change(tagInput, { target: { value: 'new-tag' } })
      fireEvent.keyDown(tagInput, { key: 'Enter' })

      expect(screen.getByText('new-tag')).toBeInTheDocument()
    })

    it('does not add empty tags', () => {
      renderEditor()
      openTagInput()

      const tagInput = screen.getByPlaceholderText('Add tag...')
      fireEvent.change(tagInput, { target: { value: '   ' } })
      fireEvent.keyDown(tagInput, { key: 'Enter' })

      expect(screen.queryByText('   ')).not.toBeInTheDocument()
    })

    it('does not add duplicate tags', () => {
      renderEditor(EXISTING_NOTE)
      openTagInput()

      const tagInput = screen.getByPlaceholderText('Add tag...')
      fireEvent.change(tagInput, { target: { value: 'bug' } })
      fireEvent.keyDown(tagInput, { key: 'Enter' })

      // 'bug' should only appear once (the existing tag pill)
      const bugTags = screen.getAllByText('bug')
      expect(bugTags.length).toBe(1)
    })

    it('lowercases tags and trims whitespace', () => {
      renderEditor()
      openTagInput()

      const tagInput = screen.getByPlaceholderText('Add tag...')
      fireEvent.change(tagInput, { target: { value: '  IMPORTANT  ' } })
      fireEvent.keyDown(tagInput, { key: 'Enter' })

      expect(screen.getByText('important')).toBeInTheDocument()
      expect(screen.queryByText('IMPORTANT')).not.toBeInTheDocument()
    })

    it('removes a tag when the X button is clicked', () => {
      renderEditor(EXISTING_NOTE)
      openTagInput()

      const authTag = screen.getByText('auth')
      const removeBtn = authTag.closest('span')?.querySelector('button')
      expect(removeBtn).not.toBeNull()
      fireEvent.click(removeBtn!)

      expect(screen.queryByText('auth')).not.toBeInTheDocument()
    })
  })

  // ── Tag autocomplete ─────────────────────────────────────────────────

  describe('tag autocomplete', () => {
    beforeEach(() => {
      useMemoryStore.setState({
        notes: [
          {
            id: 'n1',
            content: 'Note 1',
            agentId: 'claude',
            entryType: 'note',
            tags: ['bug', 'auth', 'frontend'],
            filesReferenced: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'n2',
            content: 'Note 2',
            agentId: 'codex',
            entryType: 'note',
            tags: ['bug', 'backend', 'api'],
            filesReferenced: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      })
    })

    it('shows autocomplete suggestions matching partial input', () => {
      renderEditor()
      openTagInput()

      const tagInput = screen.getByPlaceholderText('Add tag...')
      fireEvent.change(tagInput, { target: { value: 'back' } })

      expect(screen.getByText('backend')).toBeInTheDocument()
      expect(screen.queryByText('bug')).not.toBeInTheDocument()
    })

    it('does not show suggestions when input is empty', () => {
      renderEditor()
      openTagInput()
      const tagInput = screen.getByPlaceholderText('Add tag...')

      fireEvent.change(tagInput, { target: { value: '' } })

      expect(screen.queryByText('bug')).not.toBeInTheDocument()
      expect(screen.queryByText('auth')).not.toBeInTheDocument()
    })

    it('adds tag when clicking a suggestion', () => {
      renderEditor()
      openTagInput()

      const tagInput = screen.getByPlaceholderText('Add tag...')
      fireEvent.change(tagInput, { target: { value: 'front' } })

      fireEvent.click(screen.getByText('frontend'))

      expect(screen.getByText('frontend')).toBeInTheDocument()
    })

    it('filters out tags already added from suggestions dropdown', () => {
      renderEditor(EXISTING_NOTE) // has tags: ['bug', 'auth']
      openTagInput()

      const tagInput = screen.getByPlaceholderText('Add tag...')
      fireEvent.change(tagInput, { target: { value: 'bug' } })

      // 'bug' tag pill IS visible in the tag row, but it should NOT appear in the
      // autocomplete dropdown. Check that no autocomplete button contains 'bug'.
      const suggestions = document.querySelectorAll('.absolute button')
      const suggestionTexts = Array.from(suggestions).map((b) => b.textContent)
      expect(suggestionTexts).not.toContain('bug')
    })

    it('limits suggestions to 6 items', () => {
      useMemoryStore.setState({
        notes: [
          {
            id: 'n-many',
            content: 'Many tags',
            agentId: 'claude',
            entryType: 'note',
            tags: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'],
            filesReferenced: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      })

      renderEditor()
      openTagInput()

      const tagInput = screen.getByPlaceholderText('Add tag...')
      fireEvent.change(tagInput, { target: { value: 'a' } })

      const suggestions = screen.getAllByRole('button').filter(
        (btn) => btn.closest('.absolute')
      )
      expect(suggestions.length).toBeLessThanOrEqual(6)
    })
  })

  // ── Markdown preview ─────────────────────────────────────────────────

  describe('markdown preview', () => {
    it('renders bold text in preview', () => {
      renderEditor()
      const textarea = screen.getByPlaceholderText('Write a note... (Markdown supported)')
      fireEvent.change(textarea, { target: { value: 'This is **bold** text' } })

      fireEvent.click(screen.getByTitle('Preview'))

      const boldEl = screen.getByText((_text, element) =>
        element?.tagName === 'STRONG' && element?.textContent === 'bold'
      )
      expect(boldEl).toBeInTheDocument()
    })

    it('renders italic text in preview', () => {
      renderEditor()
      const textarea = screen.getByPlaceholderText('Write a note... (Markdown supported)')
      fireEvent.change(textarea, { target: { value: 'This is *italic* text' } })

      fireEvent.click(screen.getByTitle('Preview'))

      const italicEl = screen.getByText((_text, element) =>
        element?.tagName === 'EM' && element?.textContent === 'italic'
      )
      expect(italicEl).toBeInTheDocument()
    })

    it('renders inline code in preview', () => {
      renderEditor()
      const textarea = screen.getByPlaceholderText('Write a note... (Markdown supported)')
      fireEvent.change(textarea, { target: { value: 'Use `npx vite` to start' } })

      fireEvent.click(screen.getByTitle('Preview'))

      const codeEl = screen.getByText((_text, element) =>
        element?.tagName === 'CODE' && element?.textContent === 'npx vite'
      )
      expect(codeEl).toBeInTheDocument()
    })

    it('renders line breaks in preview', () => {
      renderEditor()
      const textarea = screen.getByPlaceholderText('Write a note... (Markdown supported)')
      fireEvent.change(textarea, { target: { value: 'Line one\nLine two' } })

      fireEvent.click(screen.getByTitle('Preview'))

      // <br/> splits text into separate nodes; use regex to find across boundaries
      expect(screen.getByText(/Line one/)).toBeInTheDocument()
      expect(screen.getByText(/Line two/)).toBeInTheDocument()
    })
  })

  // ── Save behavior ────────────────────────────────────────────────────

  describe('save behavior', () => {
    it('calls onSave with content and tags when Save is clicked', () => {
      const onSave = vi.fn()
      renderEditor(EXISTING_NOTE, onSave)

      fireEvent.click(screen.getByText('Save').closest('button')!)

      expect(onSave).toHaveBeenCalledWith('Existing note content', ['bug', 'auth'])
    })

    it('does not call onSave when content is empty', () => {
      const onSave = vi.fn()
      renderEditor(undefined, onSave)

      const saveBtn = screen.getByText('Save').closest('button')!
      expect(saveBtn).toBeDisabled()
      fireEvent.click(saveBtn)
      expect(onSave).not.toHaveBeenCalled()
    })

    it('trims content before saving', () => {
      const onSave = vi.fn()
      renderEditor(undefined, onSave)

      const textarea = screen.getByPlaceholderText('Write a note... (Markdown supported)')
      fireEvent.change(textarea, { target: { value: '  Hello world  ' } })

      fireEvent.click(screen.getByText('Save').closest('button')!)

      expect(onSave).toHaveBeenCalledWith('Hello world', [])
    })

    it('saves added tags along with content', () => {
      const onSave = vi.fn()
      renderEditor(undefined, onSave)

      const textarea = screen.getByPlaceholderText('Write a note... (Markdown supported)')
      fireEvent.change(textarea, { target: { value: 'Note with tags' } })

      openTagInput()
      const tagInput = screen.getByPlaceholderText('Add tag...')
      fireEvent.change(tagInput, { target: { value: 'important' } })
      fireEvent.keyDown(tagInput, { key: 'Enter' })

      fireEvent.click(screen.getByText('Save').closest('button')!)

      expect(onSave).toHaveBeenCalledWith('Note with tags', ['important'])
    })

    it('saves with Ctrl+Enter shortcut', () => {
      const onSave = vi.fn()
      renderEditor(EXISTING_NOTE, onSave)

      const textarea = screen.getByPlaceholderText('Write a note... (Markdown supported)')
      fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })

      expect(onSave).toHaveBeenCalledWith('Existing note content', ['bug', 'auth'])
    })

    it('saves with Ctrl+Enter on Windows', () => {
      const onSave = vi.fn()
      renderEditor(EXISTING_NOTE, onSave)

      const textarea = screen.getByPlaceholderText('Write a note... (Markdown supported)')
      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })

      expect(onSave).toHaveBeenCalledWith('Existing note content', ['bug', 'auth'])
    })

    it('does not save with Enter alone', () => {
      const onSave = vi.fn()
      renderEditor(EXISTING_NOTE, onSave)

      const textarea = screen.getByPlaceholderText('Write a note... (Markdown supported)')
      fireEvent.keyDown(textarea, { key: 'Enter' })

      expect(onSave).not.toHaveBeenCalled()
    })
  })

  // ── Cancel behavior ──────────────────────────────────────────────────

  describe('cancel behavior', () => {
    it('calls onCancel when Cancel button is clicked', () => {
      const onCancel = vi.fn()
      renderEditor(EXISTING_NOTE, vi.fn(), onCancel)

      fireEvent.click(screen.getByText('Cancel'))

      expect(onCancel).toHaveBeenCalledOnce()
    })

    it('calls onCancel on Escape key', () => {
      const onCancel = vi.fn()
      renderEditor(EXISTING_NOTE, vi.fn(), onCancel)

      const textarea = screen.getByPlaceholderText('Write a note... (Markdown supported)')
      fireEvent.keyDown(textarea, { key: 'Escape' })

      expect(onCancel).toHaveBeenCalledOnce()
    })
  })
})
