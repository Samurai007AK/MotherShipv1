import { useState, useRef, useEffect, useCallback } from 'react'
import { Sparkles } from 'lucide-react'

// ── Menu definitions ──────────────────────────────────────────────────────

interface MenuAction {
  label?: string
  shortcut?: string
  disabled?: boolean
  separator?: boolean
  onClick: () => void
}

interface Menu {
  label: string
  items: MenuAction[]
}

// ── Dropdown Menu ─────────────────────────────────────────────────────────

function DropdownMenu({
  menu,
  onClose,
}: {
  menu: Menu
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay to avoid immediate close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-0.5 min-w-[200px] bg-c-card border border-c-border-strong/50 rounded-lg shadow-2xl shadow-c-bg/50 py-1 z-50 animate-tooltip-in"
    >
      {menu.items.map((item, i) => {
        if (item.separator) {
          return <div key={i} className="my-1 border-t border-c-border" />
        }
        return (
          <button
            key={i}
            onClick={() => {
              if (!item.disabled) {
                item.onClick()
                onClose()
              }
            }}
            disabled={item.disabled}
            className={`w-full flex items-center justify-between px-3 py-1.5 text-[11px] text-left transition-colors ${
              item.disabled
                ? 'text-c-muted-light cursor-not-allowed'
                : 'text-c-text-dim hover:bg-c-surface-hover hover:text-c-text'
            }`}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span className="text-[9px] text-c-muted-light ml-4">{item.shortcut}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Main MenuBar ──────────────────────────────────────────────────────────

export function MenuBar({
  onAction,
}: {
  onAction: (action: string) => void
}) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  const buildMenu = useCallback(
    (label: string): Menu => {
      switch (label) {
        case 'File':
          return {
            label: 'File',
            items: [
              { label: 'New Terminal', shortcut: '⌘T', onClick: () => onAction('new-terminal') },
              { label: 'Close Terminal', shortcut: '⌘W', onClick: () => onAction('close-terminal') },
              { separator: true, label: '', onClick: () => {} },
              { label: 'Exit', onClick: () => onAction('exit') },
            ],
          }
        case 'Edit':
          return {
            label: 'Edit',
            items: [
              { label: 'Undo', shortcut: '⌘Z', disabled: true, onClick: () => {} },
              { label: 'Redo', shortcut: '⌘⇧Z', disabled: true, onClick: () => {} },
              { separator: true, onClick: () => {} },
              { label: 'Cut', shortcut: '⌘X', disabled: true, onClick: () => {} },
              { label: 'Copy', shortcut: '⌘C', disabled: true, onClick: () => {} },
              { label: 'Paste', shortcut: '⌘V', disabled: true, onClick: () => {} },
            ],
          }
        case 'View':
          return {
            label: 'View',
            items: [
              { label: 'Command Palette', shortcut: '⌘K', onClick: () => onAction('command-palette') },
              { separator: true, onClick: () => {} },
              { label: 'Memory Panel', shortcut: '⌘M', onClick: () => onAction('toggle-memory') },
              { label: 'Editor', onClick: () => onAction('open-editor') },
              { label: 'Worktrees', onClick: () => onAction('open-worktrees') },
              { label: 'War Room', onClick: () => onAction('open-war-room') },
              { label: 'Task Graph', onClick: () => onAction('open-task-graph') },
              { separator: true, onClick: () => {} },
              { label: 'Ports', onClick: () => onAction('open-ports') },
            ],
          }
        case 'Help':
          return {
            label: 'Help',
            items: [
              { label: 'About Crew', onClick: () => onAction('about') },
              { label: 'Toggle Developer Tools', shortcut: '⌘⌥I', onClick: () => onAction('devtools') },
            ],
          }
        default:
          return { label, items: [] }
      }
    },
    [onAction]
  )

  return (
    <div
      ref={barRef}
      className="flex items-center h-7 px-3 bg-c-card border-b border-c-border select-none shrink-0"
    >
      {/* App icon + name */}
      <div className="flex items-center gap-1.5 mr-3">
        <div className="w-3.5 h-3.5 rounded bg-mothership-600 flex items-center justify-center">
          <Sparkles className="w-2 h-2 text-white" />
        </div>
        <span className="text-[10px] font-bold text-c-text tracking-wide hidden sm:inline">MOTHERSHIP</span>
      </div>

      {/* Menu items */}
      {['File', 'Edit', 'View', 'Help'].map((menuLabel) => (
        <div key={menuLabel} className="relative">
          <button
            onMouseEnter={() => setOpenMenu(menuLabel)}
            onClick={() => setOpenMenu(openMenu === menuLabel ? null : menuLabel)}
            className={`px-2.5 py-0.5 text-[11px] rounded transition-colors ${
              openMenu === menuLabel
                ? 'bg-c-surface-hover text-c-text'
                : 'text-c-text-dim hover:text-c-text hover:bg-c-surface/50'
            }`}
          >
            {menuLabel}
          </button>
          {openMenu === menuLabel && (
            <DropdownMenu menu={buildMenu(menuLabel)} onClose={() => setOpenMenu(null)} />
          )}
        </div>
      ))}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Status text */}
      <span className="text-[9px] text-c-muted-light hidden md:inline">Crew · Agent Workspace</span>
    </div>
  )
}
