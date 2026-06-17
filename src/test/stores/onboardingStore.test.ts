import { describe, it, expect, beforeEach } from 'vitest'
import { useOnboardingStore } from '../../stores/onboardingStore'

describe('onboardingStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useOnboardingStore.setState({
      isOnboarding: false,
      currentStep: 'welcome',
      completedSteps: [],
      hasCompletedOnboarding: false,
    })
  })

  it('starts onboarding', () => {
    useOnboardingStore.getState().startOnboarding()
    const state = useOnboardingStore.getState()
    expect(state.isOnboarding).toBe(true)
    expect(state.currentStep).toBe('welcome')
  })

  it('advances to next step', () => {
    useOnboardingStore.getState().startOnboarding()
    useOnboardingStore.getState().nextStep()
    expect(useOnboardingStore.getState().currentStep).toBe('agents')
  })

  it('goes back to previous step', () => {
    useOnboardingStore.getState().startOnboarding()
    useOnboardingStore.getState().nextStep()
    useOnboardingStore.getState().prevStep()
    expect(useOnboardingStore.getState().currentStep).toBe('welcome')
  })

  it('skips onboarding', () => {
    useOnboardingStore.getState().startOnboarding()
    useOnboardingStore.getState().skipOnboarding()
    const state = useOnboardingStore.getState()
    expect(state.isOnboarding).toBe(false)
    expect(state.hasCompletedOnboarding).toBe(true)
  })

  it('completes onboarding', () => {
    useOnboardingStore.getState().startOnboarding()
    useOnboardingStore.getState().nextStep()
    useOnboardingStore.getState().nextStep()
    useOnboardingStore.getState().nextStep()
    useOnboardingStore.getState().completeOnboarding()
    const state = useOnboardingStore.getState()
    expect(state.isOnboarding).toBe(false)
    expect(state.hasCompletedOnboarding).toBe(true)
  })

  it('persists completion to localStorage', () => {
    useOnboardingStore.getState().startOnboarding()
    useOnboardingStore.getState().completeOnboarding()
    expect(localStorage.getItem('mothership-onboarding-complete')).toBe('true')
  })

  it('goes to specific step', () => {
    useOnboardingStore.getState().startOnboarding()
    useOnboardingStore.getState().goToStep('project')
    expect(useOnboardingStore.getState().currentStep).toBe('project')
  })
})
