import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface Editors {
  vsCode: boolean
  cursor: boolean
}

/**
 * Auto-detect which editors (VS Code, Cursor) are installed on the host system.
 *
 * Returns `{ vsCode, cursor }` — each boolean indicates whether that editor
 * binary was found via `check_editor_available`. Falls back to showing both
 * editors if the IPC call fails (e.g. running outside Tauri).
 */
export function useEditorDetection(): Editors {
  const [editors, setEditors] = useState<Editors>({ vsCode: false, cursor: false })

  useEffect(() => {
    Promise.all([
      invoke<boolean>('check_editor_available', { editor: 'code' }),
      invoke<boolean>('check_editor_available', { editor: 'cursor' }),
    ])
      .then(([vsc, cur]) => setEditors({ vsCode: vsc, cursor: cur }))
      .catch(() => setEditors({ vsCode: true, cursor: true }))
  }, [])

  return editors
}
