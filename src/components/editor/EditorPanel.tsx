import { useCallback, useState, useRef } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { useFileStore } from '../../stores/fileStore'
import { FileBrowser } from './FileBrowser'
import { CodeEditor } from './CodeEditor'
import { DiffReviewPanel } from './DiffReviewPanel'
import { X, Save, FileText, Check, AlertCircle, GitPullRequest } from 'lucide-react'

export function EditorPanel() {
  const {
    openFiles,
    activeFilePath,
    closeFile,
    setActiveFile,
    updateContent,
    markSaved,
    pendingChanges,
    showDiffReview,
    setShowDiffReview,
  } = useEditorStore()
  const writeFileContent = useFileStore((s) => s.writeFileContent)

  const activeFile = openFiles.find((f) => f.path === activeFilePath)

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const handleSave = useCallback(
    async (content: string) => {
      if (!activeFilePath) return
      setSaveStatus('saving')
      try {
        await writeFileContent(activeFilePath, content)
        markSaved(activeFilePath)
        setSaveStatus('saved')
        // Reset status after 2s
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
      } catch (e) {
        console.error('Failed to save file:', e)
        setSaveStatus('error')
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000)
      }
    },
    [activeFilePath, writeFileContent, markSaved]
  )

  const handleChange = useCallback(
    (content: string) => {
      if (!activeFilePath) return
      updateContent(activeFilePath, content)
    },
    [activeFilePath, updateContent]
  )

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: File browser */}
      <div className="w-56 flex-shrink-0 border-r border-c-border bg-c-card/50">
        <FileBrowser />
      </div>

      {/* Right: Editor area */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeFile ? (
          <>
            {/* Editor tab bar */}
            <div className="flex items-center border-b border-c-border bg-c-card">
              {openFiles.map((file) => {
                const isActive = file.path === activeFilePath
                return (
                  <div
                    key={file.path}
                    className={`group flex items-center gap-1.5 px-3 py-1.5 text-[11px] cursor-pointer border-r border-c-border transition-colors ${
                      isActive
                        ? 'bg-c-surface text-c-text'
                        : 'text-c-muted hover:text-c-muted-light hover:bg-c-surface/50'
                    }`}
                    onClick={() => setActiveFile(file.path)}
                  >
                    <FileText className="w-3 h-3 text-c-muted-light flex-shrink-0" />
                    <span className="font-medium truncate max-w-[120px]">{file.name}</span>
                    {file.isDirty && (
                      <span className="w-1.5 h-1.5 rounded-full bg-mothership-400 flex-shrink-0" />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        closeFile(file.path)
                      }}
                      className="ml-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-c-surface-hover text-c-muted hover:text-c-text-dim transition-all"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Editor toolbar */}
            <div className="flex items-center justify-between px-3 py-1 border-b border-c-border/50 bg-c-surface/30">
              <div className="flex items-center gap-2 text-[10px] text-c-muted-light">
                <span className="font-mono">{activeFile.path}</span>
                {activeFile.isDirty && (
                  <span className="text-mothership-400 font-medium">Modified</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-c-muted-light px-1.5 py-0.5 rounded bg-c-surface">
                  {activeFile.language}
                </span>
                {/* Review Changes button */}
                {pendingChanges.filter((c) => c.status === 'pending').length > 0 && (
                  <button
                    onClick={() => setShowDiffReview(!showDiffReview)}
                    className={`flex items-center gap-1 px-2 py-0.5 text-[10px] rounded transition-colors ${
                      showDiffReview
                        ? 'bg-mothership-600 text-white'
                        : 'bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30'
                    }`}
                  >
                    <GitPullRequest className="w-2.5 h-2.5" />
                    Review ({pendingChanges.filter((c) => c.status === 'pending').length})
                  </button>
                )}
                <button
                  onClick={() => handleSave(activeFile.content)}
                  disabled={!activeFile.isDirty || saveStatus === 'saving'}
                  className={`flex items-center gap-1 px-2 py-0.5 text-[10px] rounded transition-colors ${
                    saveStatus === 'saved'
                      ? 'bg-green-600/20 text-green-400'
                      : saveStatus === 'error'
                      ? 'bg-red-600/20 text-red-400'
                      : 'bg-mothership-600 text-white hover:bg-mothership-500'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                  title="Save (Ctrl+S)"
                >
                  {saveStatus === 'saving' ? (
                    <span className="w-2.5 h-2.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : saveStatus === 'saved' ? (
                    <Check className="w-2.5 h-2.5" />
                  ) : saveStatus === 'error' ? (
                    <AlertCircle className="w-2.5 h-2.5" />
                  ) : (
                    <Save className="w-2.5 h-2.5" />
                  )}
                  {saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Error' : saveStatus === 'saving' ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            {/* Diff Review overlay */}
            {showDiffReview && (
              <div className="absolute inset-0 z-20 bg-c-bg/95 backdrop-blur-sm">
                <DiffReviewPanel />
              </div>
            )}

            {/* CodeMirror editor */}
            <div className="flex-1 overflow-hidden">
              <CodeEditor
                content={activeFile.content}
                language={activeFile.language}
                filePath={activeFile.path}
                onChange={handleChange}
                onSave={handleSave}
              />
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-c-muted p-6">
            <FileText className="w-10 h-10 mb-3 text-c-muted-light" />
            <h3 className="text-sm font-medium text-c-muted mb-1">No file open</h3>
            <p className="text-xs text-c-muted-light text-center max-w-xs">
              Select a file from the browser to start editing. Changes are saved with Ctrl+S.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
