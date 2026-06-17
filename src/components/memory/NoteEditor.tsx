import { useState, useRef, useEffect, useCallback, memo } from 'react'
import { useMemoryStore, type MemoryNote } from '../../stores/memoryStore'
import { Bold, Italic, Eye, EyeOff, Tag, X, Check } from 'lucide-react'

// --- NoteEditor ---
// Rich-ish text editor with tag autocomplete and markdown preview.

interface NoteEditorProps {
  note?: MemoryNote
  onSave: (content: string, tags: string[]) => void
  onCancel: () => void
  agentId?: string
}

export const NoteEditor = memo(function NoteEditor({
  note,
  onSave,
  onCancel,
}: NoteEditorProps) {
  const [content, setContent] = useState(note?.content ?? '')
  const [tags, setTags] = useState<string[]>(note?.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [showTagInput, setShowTagInput] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)

  // Existing tags for autocomplete
  const allTags = useMemoryStore((s) => {
    const tagSet = new Set<string>()
    s.notes.forEach((n) => n.tags.forEach((t) => tagSet.add(t)))
    return Array.from(tagSet)
  })

  // Focus textarea on mount
  useEffect(() => {
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [])

  // Focus tag input when shown
  useEffect(() => {
    if (showTagInput) {
      requestAnimationFrame(() => tagInputRef.current?.focus())
    }
  }, [showTagInput])

  // Tag suggestions (filtered by current input)
  const tagSuggestions = tagInput
    ? allTags.filter(
        (t) =>
          t.toLowerCase().includes(tagInput.toLowerCase()) && !tags.includes(t)
      )
    : []

  const addTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim().toLowerCase()
      if (trimmed && !tags.includes(trimmed)) {
        setTags([...tags, trimmed])
      }
      setTagInput('')
    },
    [tags]
  )

  const removeTag = useCallback(
    (tag: string) => {
      setTags(tags.filter((t) => t !== tag))
    },
    [tags]
  )

  const handleSave = () => {
    if (!content.trim()) return
    onSave(content.trim(), tags)
  }

  // Simple markdown-to-HTML for preview
  const renderPreview = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code class="px-1 py-0.5 bg-c-surface rounded text-[10px] font-mono">$1</code>')
      .replace(/\n/g, '<br/>')
  }

  return (
    <div className="flex flex-col gap-2 p-2 bg-c-surface/50 rounded-lg border border-c-border-strong/30">
      {/* Toolbar */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => {
            const ta = textareaRef.current
            if (!ta) return
            const start = ta.selectionStart
            const end = ta.selectionEnd
            const text = content
            setContent(text.slice(0, start) + '**' + text.slice(start, end) + '**' + text.slice(end))
          }}
          className="p-1 rounded hover:bg-c-surface-hover text-c-muted-light hover:text-c-muted transition-colors"
          title="Bold"
        >
          <Bold className="w-3 h-3" />
        </button>
        <button
          onClick={() => {
            const ta = textareaRef.current
            if (!ta) return
            const start = ta.selectionStart
            const end = ta.selectionEnd
            const text = content
            setContent(text.slice(0, start) + '*' + text.slice(start, end) + '*' + text.slice(end))
          }}
          className="p-1 rounded hover:bg-c-surface-hover text-c-muted-light hover:text-c-muted transition-colors"
          title="Italic"
        >
          <Italic className="w-3 h-3" />
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setShowTagInput(!showTagInput)}
          className={`p-1 rounded transition-colors ${
            showTagInput
              ? 'bg-mothership-600/10 text-mothership-400'
              : 'hover:bg-c-surface-hover text-c-muted-light hover:text-c-muted'
          }`}
          title="Add tags"
        >
          <Tag className="w-3 h-3" />
        </button>
        <button
          onClick={() => setShowPreview(!showPreview)}
          className={`p-1 rounded transition-colors ${
            showPreview
              ? 'bg-mothership-600/10 text-mothership-400'
              : 'hover:bg-c-surface-hover text-c-muted-light hover:text-c-muted'
          }`}
          title="Preview"
        >
          {showPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        </button>
      </div>

      {/* Editor / Preview */}
      {showPreview ? (
        <div
          className="px-2 py-1.5 text-[11px] text-c-text-dim leading-relaxed min-h-[80px]"
          dangerouslySetInnerHTML={{ __html: renderPreview(content) }}
        />
      ) : (
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write a note... (Markdown supported)"
          rows={4}
          className="w-full px-2 py-1.5 bg-transparent border-0 text-[11px] text-c-text-dim placeholder:text-c-muted-light outline-none resize-none leading-relaxed"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave()
            if (e.key === 'Escape') onCancel()
          }}
        />
      )}

      {/* Tag input with autocomplete */}
      {showTagInput && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1 flex-wrap">
            {tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] bg-mothership-600/15 text-mothership-400 rounded-full"
              >
                {tag}
                <button onClick={() => removeTag(tag)} className="hover:text-red-400">
                  <X className="w-2 h-2" />
                </button>
              </span>
            ))}
          </div>
          <div className="relative">
            <input
              ref={tagInputRef}
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tagInput.trim()) {
                  e.preventDefault()
                  addTag(tagInput)
                }
              }}
              placeholder="Add tag..."
              className="w-full px-2 py-1 bg-transparent border border-c-border-strong rounded text-[10px] text-c-text-dim placeholder:text-c-muted-light outline-none focus:border-mothership-500/50"
            />
            {/* Autocomplete suggestions */}
            {tagSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-0.5 bg-c-card border border-c-border rounded shadow-lg z-10 max-h-24 overflow-y-auto">
                {tagSuggestions.slice(0, 6).map((s) => (
                  <button
                    key={s}
                    onClick={() => addTag(s)}
                    className="w-full text-left px-2 py-1 text-[10px] text-c-text-dim hover:bg-c-surface transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-c-muted-light">
          {content.length > 0 ? `${content.length} chars` : 'Ctrl+Enter to save'}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onCancel}
            className="px-2 py-0.5 text-[10px] text-c-muted hover:text-c-text-dim transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!content.trim()}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-mothership-600 text-white rounded hover:bg-mothership-500 disabled:opacity-40 transition-colors"
          >
            <Check className="w-2.5 h-2.5" />
            Save
          </button>
        </div>
      </div>
    </div>
  )
})
