import { memo } from 'react'
import { useOnboardingStore, type OnboardingStep } from '../../stores/onboardingStore'
import { useAgentStore } from '../../stores/agentStore'
import {
  Rocket,
  Bot,
  FolderOpen,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  X,
  Sparkles,
  Terminal,
  MemoryStick,
} from 'lucide-react'

const STEP_ICONS: Record<OnboardingStep, React.ReactNode> = {
  welcome: <Rocket className="w-8 h-8" />,
  agents: <Bot className="w-8 h-8" />,
  project: <FolderOpen className="w-8 h-8" />,
  complete: <CheckCircle2 className="w-8 h-8" />,
}

const STEP_TITLES: Record<OnboardingStep, string> = {
  welcome: 'Welcome to Crew',
  agents: 'Meet Your Agents',
  project: 'Start Your First Project',
  complete: "You're Ready!",
}

export const OnboardingWizard = memo(function OnboardingWizard() {
  const {
    isOnboarding,
    currentStep,
    nextStep,
    prevStep,
    skipOnboarding,
    completeOnboarding,
  } = useOnboardingStore()
  const { agents } = useAgentStore()

  if (!isOnboarding) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 bg-surface-base border border-c-border rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-c-border">
          <div className="flex items-center gap-3">
            <div className="text-mothership-500">{STEP_ICONS[currentStep]}</div>
            <div>
              <h2 className="text-sm font-semibold text-c-primary">
                {STEP_TITLES[currentStep]}
              </h2>
              <p className="text-[10px] text-c-secondary">
                Step {STEP_ORDER.indexOf(currentStep) + 1} of {STEP_ORDER.length}
              </p>
            </div>
          </div>
          <button
            onClick={skipOnboarding}
            className="p-1 text-c-secondary hover:text-c-primary rounded hover:bg-surface-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="h-0.5 bg-c-border">
          <div
            className="h-full bg-mothership-500 transition-all duration-300"
            style={{
              width: `${((STEP_ORDER.indexOf(currentStep) + 1) / STEP_ORDER.length) * 100}%`,
            }}
          />
        </div>

        {/* Content */}
        <div className="p-6 min-h-[300px]">
          {currentStep === 'welcome' && <WelcomeStep />}
          {currentStep === 'agents' && <AgentsStep agents={agents.slice(0, 4)} />}
          {currentStep === 'project' && <ProjectStep />}
          {currentStep === 'complete' && <CompleteStep />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-c-border">
          <button
            onClick={prevStep}
            disabled={currentStep === 'welcome'}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-c-secondary hover:text-c-primary rounded hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Back
          </button>

          <div className="flex gap-2">
            <button
              onClick={skipOnboarding}
              className="px-3 py-1.5 text-xs text-c-secondary hover:text-c-primary rounded hover:bg-surface-hover transition-colors"
            >
              Skip
            </button>
            {currentStep === 'complete' ? (
              <button
                onClick={completeOnboarding}
                className="flex items-center gap-1 px-4 py-1.5 bg-mothership-500 text-white text-xs font-medium rounded hover:bg-mothership-600 transition-colors"
              >
                Get Started
                <Sparkles className="w-3 h-3" />
              </button>
            ) : (
              <button
                onClick={nextStep}
                className="flex items-center gap-1 px-4 py-1.5 bg-mothership-500 text-white text-xs font-medium rounded hover:bg-mothership-600 transition-colors"
              >
                Next
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

function WelcomeStep() {
  return (
    <div className="text-center space-y-4">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-mothership-500/10 text-mothership-500">
        <Rocket className="w-8 h-8" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-c-primary mb-2">
          Welcome to Crew
        </h3>
        <p className="text-sm text-c-secondary max-w-sm mx-auto">
          Your desktop AI control center. Unify multiple AI agents into one
          memory-aware workspace with shared context and seamless handoffs.
        </p>
      </div>
      <div className="flex justify-center gap-6 text-[10px] text-c-secondary">
        <div className="flex items-center gap-1">
          <Terminal className="w-3 h-3 text-mothership-400" />
          Isolated Terminals
        </div>
        <div className="flex items-center gap-1">
          <MemoryStick className="w-3 h-3 text-mothership-400" />
          Shared Memory
        </div>
        <div className="flex items-center gap-1">
          <Bot className="w-3 h-3 text-mothership-400" />
          Multi-Agent
        </div>
      </div>
    </div>
  )
}

function AgentsStep({
  agents,
}: {
  agents: ReturnType<typeof useAgentStore.getState>['agents']
}) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-c-primary mb-2">
          Meet Your Agents
        </h3>
        <p className="text-sm text-c-secondary">
          These agents are ready to help. Each has its own terminal and can
          work independently or collaborate.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="flex items-center gap-3 p-3 bg-surface-subtle rounded-lg border border-c-border"
          >
            <div className="w-8 h-8 rounded-full bg-mothership-500/20 flex items-center justify-center">
              <Bot className="w-4 h-4 text-mothership-400" />
            </div>
            <div>
              <div className="text-xs font-medium text-c-primary">
                {agent.name}
              </div>
              <div className="text-[10px] text-c-secondary truncate max-w-[120px]">
                {agent.description}
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-c-secondary text-center">
        You can add more agents later from the sidebar.
      </p>
    </div>
  )
}

function ProjectStep() {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-c-primary mb-2">
          Start Your First Project
        </h3>
        <p className="text-sm text-c-secondary">
          Create a workspace to begin. Your agents will share context and
          memory across this project.
        </p>
      </div>
      <div className="space-y-3">
        <div className="p-4 bg-surface-subtle rounded-lg border border-c-border">
          <div className="flex items-center gap-2 mb-2">
            <FolderOpen className="w-4 h-4 text-mothership-400" />
            <span className="text-xs font-medium text-c-primary">
              Quick Start
            </span>
          </div>
          <p className="text-[10px] text-c-secondary">
            Open a terminal tab and start working. Your context is
            automatically captured and shared across agents.
          </p>
        </div>
        <div className="p-4 bg-surface-subtle rounded-lg border border-c-border">
          <div className="flex items-center gap-2 mb-2">
            <MemoryStick className="w-4 h-4 text-mothership-400" />
            <span className="text-xs font-medium text-c-primary">
              Shared Memory
            </span>
          </div>
          <p className="text-[10px] text-c-secondary">
            Notes, context, and search are shared across all agents. Use the
            Memory panel on the right to manage your knowledge.
          </p>
        </div>
      </div>
    </div>
  )
}

function CompleteStep() {
  return (
    <div className="text-center space-y-4">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 text-green-500">
        <CheckCircle2 className="w-8 h-8" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-c-primary mb-2">
          You're All Set!
        </h3>
        <p className="text-sm text-c-secondary max-w-sm mx-auto">
          Crew is ready. Start by selecting an agent from the sidebar
          and opening a terminal. Your workspace awaits.
        </p>
      </div>
      <div className="flex justify-center gap-4 text-[10px] text-c-secondary">
        <div className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 bg-surface-subtle rounded border border-c-border">
            ⌘K
          </kbd>
          Command Palette
        </div>
        <div className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 bg-surface-subtle rounded border border-c-border">
            ⌘T
          </kbd>
          New Terminal
        </div>
        <div className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 bg-surface-subtle rounded border border-c-border">
            ⌘\
          </kbd>
          Split Pane
        </div>
      </div>
    </div>
  )
}

const STEP_ORDER: OnboardingStep[] = ['welcome', 'agents', 'project', 'complete']
