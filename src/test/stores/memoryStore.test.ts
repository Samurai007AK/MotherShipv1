import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useMemoryStore } from '../../stores/memoryStore'

// Mock @tauri-apps/api/core before any store imports it
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}))

describe('memoryStore', () => {
  beforeEach(() => {
    useMemoryStore.setState({
      notes: [],
      contextHistory: [],
      activeTab: 'notes',
      searchQuery: '',
      contextFilter: '',
      handoffHistory: [],
      sessions: [],
      globalSearchQuery: '',
      searchResults: [],
      isLoaded: false,
    })
  })

  it('adds a note', () => {
    const { addNote } = useMemoryStore.getState()
    addNote('Hello world', 'claude', ['test'])
    const { notes } = useMemoryStore.getState()
    expect(notes.length).toBe(1)
    expect(notes[0].content).toBe('Hello world')
    expect(notes[0].tags).toContain('test')
  })

  it('updates a note', () => {
    const { addNote, updateNote } = useMemoryStore.getState()
    addNote('Original content', 'claude', [])
    const noteId = useMemoryStore.getState().notes[0].id
    updateNote(noteId, { content: 'Updated content' })
    const note = useMemoryStore.getState().notes.find((n) => n.id === noteId)
    expect(note?.content).toBe('Updated content')
  })

  it('deletes a note', () => {
    const { addNote, deleteNote } = useMemoryStore.getState()
    addNote('To delete', 'claude', [])
    const noteId = useMemoryStore.getState().notes[0].id
    deleteNote(noteId)
    expect(useMemoryStore.getState().notes.find((n) => n.id === noteId)).toBeUndefined()
  })

  it('sets active tab', () => {
    const { setActiveTab } = useMemoryStore.getState()
    setActiveTab('context')
    expect(useMemoryStore.getState().activeTab).toBe('context')
  })

  it('adds context entry', () => {
    const { addContextEntry } = useMemoryStore.getState()
    addContextEntry({
      agentId: 'claude',
      entryType: 'output',
      content: 'Test output',
      filesReferenced: [],
    })
    expect(useMemoryStore.getState().contextHistory.length).toBe(1)
  })

  it('filters notes by search query', () => {
    const { addNote, setSearchQuery } = useMemoryStore.getState()
    addNote('React Hooks', 'claude', ['react'])
    addNote('Rust ownership', 'claude', ['rust'])
    setSearchQuery('React')
    const filtered = useMemoryStore.getState().getFilteredNotes()
    expect(filtered.length).toBe(1)
    expect(filtered[0].content).toBe('React Hooks')
  })
})
