import { useThemeStore, type Theme } from '../../stores/themeStore'
import { Sun, Moon, Monitor } from 'lucide-react'

const THEME_OPTIONS: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' },
]

export function ThemeToggle() {
  const { theme, setTheme } = useThemeStore()

  return (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-c-surface/50">
      {THEME_OPTIONS.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          title={label}
          className={`p-1.5 rounded-md transition-colors ${
            theme === value
              ? 'bg-c-surface text-c-text shadow-sm'
              : 'text-c-muted hover:text-c-text-dim'
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  )
}
