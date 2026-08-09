import { useRef, useEffect } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightSpecialChars } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, foldGutter, indentOnInput } from '@codemirror/language'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { python } from '@codemirror/lang-python'
import { oneDark } from '@codemirror/theme-one-dark'
import { tags } from '@lezer/highlight'

// --- Language resolver ---

function getLanguageExtension(lang: string) {
  switch (lang) {
    case 'typescript':
    case 'javascript':
    case 'tsx':
    case 'jsx':
      return javascript({ jsx: true, typescript: true })
    case 'html':
      return html()
    case 'css':
      return css()
    case 'python':
      return python()
    default:
      return javascript()
  }
}

// --- Crew dark theme ---

const mothershipTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: '#d4d4d8',
    height: '100%',
    fontSize: '13px',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
  },
  '.cm-content': {
    padding: '8px 0',
    caretColor: '#a78bfa',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#a78bfa',
    borderLeftWidth: '2px',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
  },
  '.cm-panels': { backgroundColor: '#1a1a2e', color: '#d4d4d8' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid #2d2d44' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid #2d2d44' },
  '.cm-searchMatch': {
    backgroundColor: 'rgba(167, 139, 250, 0.2)',
    outline: '1px solid rgba(167, 139, 250, 0.4)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'rgba(167, 139, 250, 0.35)',
  },
  '.cm-activeLine': { backgroundColor: 'rgba(255, 255, 255, 0.04)' },
  '.cm-selectionMatch': { backgroundColor: 'rgba(139, 92, 246, 0.15)' },
  '&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket': {
    backgroundColor: 'rgba(167, 139, 250, 0.2)',
    outline: '1px solid rgba(167, 139, 250, 0.4)',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: '#52525b',
    border: 'none',
    paddingRight: '8px',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: '#a78bfa',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    border: '1px solid rgba(139, 92, 246, 0.3)',
    color: '#a78bfa',
  },
  '.cm-tooltip': {
    border: '1px solid #2d2d44',
    backgroundColor: '#1a1a2e',
  },
  '.cm-tooltip .cm-tooltip-arrow:before': {
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  '.cm-tooltip .cm-tooltip-arrow:after': {
    borderTopColor: '#1a1a2e',
    borderBottomColor: '#1a1a2e',
  },
  '.cm-tooltip-autocomplete': {
    '& > ul > li[aria-selected]': {
      backgroundColor: 'rgba(139, 92, 246, 0.15)',
      color: '#d4d4d8',
    },
  },
  '.cm-scroller': {
    overflow: 'auto',
  },
  '.cm-line': {
    padding: '0 12px',
  },
})

// --- Custom syntax highlighting for mothership ---

const mothershipHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#c084fc' },
  { tag: tags.operator, color: '#a78bfa' },
  { tag: tags.special(tags.variableName), color: '#93c5fd' },
  { tag: tags.typeName, color: '#67e8f9' },
  { tag: tags.atom, color: '#f9a8d4' },
  { tag: tags.number, color: '#fbbf24' },
  { tag: tags.definition(tags.variableName), color: '#67e8f9' },
  { tag: tags.string, color: '#86efac' },
  { tag: tags.special(tags.string), color: '#86efac' },
  { tag: tags.comment, color: '#6b7280', fontStyle: 'italic' },
  { tag: tags.variableName, color: '#d4d4d8' },
  { tag: tags.tagName, color: '#f87171' },
  { tag: tags.bracket, color: '#a78bfa' },
  { tag: tags.meta, color: '#fbbf24' },
  { tag: tags.link, color: '#67e8f9', textDecoration: 'underline' },
  { tag: tags.heading, color: '#c084fc', fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.bool, color: '#fbbf24' },
  { tag: tags.null, color: '#fbbf24' },
  { tag: tags.className, color: '#67e8f9' },
  { tag: tags.propertyName, color: '#93c5fd' },
  { tag: tags.function(tags.variableName), color: '#93c5fd' },
  { tag: tags.regexp, color: '#f9a8d4' },
  { tag: tags.self, color: '#c084fc' },
])

// --- Props ---

interface CodeEditorProps {
  content: string
  language: string
  filePath: string
  readOnly?: boolean
  onChange?: (content: string) => void
  onSave?: (content: string) => void
}

// --- Component ---

export function CodeEditor({
  content,
  language,
  filePath,
  readOnly = false,
  onChange,
  onSave,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)

  // Keep refs fresh
  onChangeRef.current = onChange
  onSaveRef.current = onSave

  // Create editor on mount
  useEffect(() => {
    if (!containerRef.current) return

    const saveKeymap = keymap.of([
      {
        key: 'Mod-s',
        preventDefault: true,
        run: (view) => {
          onSaveRef.current?.(view.state.doc.toString())
          return true
        },
      },
    ])

    const languageExtension = getLanguageExtension(language)

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        highlightSelectionMatches(),
        languageExtension,
        mothershipTheme,
        syntaxHighlighting(mothershipHighlightStyle),
        oneDark,
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        saveKeymap,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current?.(update.state.doc.toString())
          }
        }),
        EditorView.lineWrapping,
        readOnly ? EditorState.readOnly.of(true) : [],
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [filePath, language]) // Recreate when file or language changes

  // Update content from outside (e.g., AI edits)
  // Track previous content to avoid cursor-jumping loops
  const prevContentRef = useRef(content)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const currentContent = view.state.doc.toString()
    // Only replace if content actually differs AND we're not in the middle of a user edit
    // Use a transaction filter to preserve cursor position when possible
    if (currentContent !== content && prevContentRef.current !== currentContent) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: content,
        },
        // Preserve scroll position
        scrollIntoView: false,
      })
    }
    prevContentRef.current = content
  }, [content])

  // Focus on mount and when file changes
  useEffect(() => {
    // Small delay to ensure editor is mounted
    const timer = setTimeout(() => viewRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [filePath])

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden"
      data-testid="code-editor"
    />
  )
}
