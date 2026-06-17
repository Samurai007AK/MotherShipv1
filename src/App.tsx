import { useEffect } from 'react'
import { CommandPalette, useCommandPalette } from './components/command-palette/CommandPalette'
import { ResizableLayout } from './components/layout/ResizableLayout'
import { OnboardingWizard } from './components/onboarding/OnboardingWizard'
import { useThemeStore } from './stores/themeStore'
import { useContextCapture } from './hooks/useContextCapture'

export default function App() {
  const { isOpen, setIsOpen } = useCommandPalette()
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)

  // Global context capture — listens to terminal output, agent switches, heartbeat
  useContextCapture()

  // Sync resolved theme class onto <html>
  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(resolvedTheme)
  }, [resolvedTheme])

  return (
    <div className="flex h-screen overflow-hidden bg-c-bg text-c-text transition-colors duration-200">
      {/* Command Palette (Cmd+K) */}
      <CommandPalette isOpen={isOpen} onClose={() => setIsOpen(false)} />

      {/* Onboarding Wizard */}
      <OnboardingWizard />

      {/* Resizable three-panel layout */}
      <ResizableLayout />
    </div>
  )
}
