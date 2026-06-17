import { create } from 'zustand'

export type OnboardingStep = 'welcome' | 'agents' | 'project' | 'complete'

interface OnboardingState {
  isOnboarding: boolean
  currentStep: OnboardingStep
  completedSteps: OnboardingStep[]
  hasCompletedOnboarding: boolean

  // Actions
  startOnboarding: () => void
  nextStep: () => void
  prevStep: () => void
  skipOnboarding: () => void
  completeOnboarding: () => void
  goToStep: (step: OnboardingStep) => void
}

const STEP_ORDER: OnboardingStep[] = ['welcome', 'agents', 'project', 'complete']

function loadOnboardingState(): boolean {
  try {
    return localStorage.getItem('mothership-onboarding-complete') === 'true'
  } catch {
    return false
  }
}

function saveOnboardingState(complete: boolean) {
  try {
    localStorage.setItem('mothership-onboarding-complete', String(complete))
  } catch {
    // Ignore storage errors
  }
}

export const useOnboardingStore = create<OnboardingState>()((set, get) => ({
  isOnboarding: false,
  currentStep: 'welcome',
  completedSteps: [],
  hasCompletedOnboarding: loadOnboardingState(),

  startOnboarding: () => {
    set({
      isOnboarding: true,
      currentStep: 'welcome',
      completedSteps: [],
    })
  },

  nextStep: () => {
    const { currentStep, completedSteps } = get()
    const nextIndex = STEP_ORDER.indexOf(currentStep) + 1

    if (nextIndex >= STEP_ORDER.length) {
      get().completeOnboarding()
      return
    }

    set({
      currentStep: STEP_ORDER[nextIndex],
      completedSteps: [...completedSteps, currentStep],
    })
  },

  prevStep: () => {
    const { currentStep } = get()
    const prevIndex = STEP_ORDER.indexOf(currentStep) - 1

    if (prevIndex >= 0) {
      set({ currentStep: STEP_ORDER[prevIndex] })
    }
  },

  skipOnboarding: () => {
    get().completeOnboarding()
  },

  completeOnboarding: () => {
    saveOnboardingState(true)
    set({
      isOnboarding: false,
      hasCompletedOnboarding: true,
      currentStep: 'welcome',
      completedSteps: [],
    })
  },

  goToStep: (step) => set({ currentStep: step }),
}))
