import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding } from '../contexts/OnboardingProvider';
import { OnboardingStep, UserGoal } from '../types/onboarding';

export interface OnboardingFlowHelpers {
  // Step management
  currentStep: OnboardingStep;
  isLocationStep: boolean;
  isGoalSelectionStep: boolean;
  isPreferencesStep: boolean;
  isAccountStep: boolean;
  isCompleted: boolean;

  // Navigation helpers
  goToNextStep: () => void;
  goToPreviousStep: () => void;
  goToStep: (step: OnboardingStep) => void;
  skipOnboarding: () => void;

  // Goal management
  selectGoal: (goal: UserGoal) => void;
  navigateToGoal: (goal: UserGoal) => void;

  // Completion helpers
  completeOnboardingFlow: () => void;
  shouldShowRegistrationPrompt: boolean;

  // Progress tracking
  getStepProgress: () => number;
  getStepTitle: () => string;
  getStepDescription: () => string;

  // Utility methods
  canGoBack: boolean;
  canGoForward: boolean;
  isFirstTimeUser: boolean;
}

const STEP_ORDER: OnboardingStep[] = ['location', 'goal-selection', 'preferences', 'completed'];

const STEP_TITLES: Record<OnboardingStep, string> = {
  location: 'Find Your Location',
  'goal-selection': 'What Would You Like to Do?',
  preferences: 'Set Your Dining Preferences (Optional)',
  account: 'Save Your Progress (Optional)',
  completed: 'Welcome to Welcome Winks!',
};

const STEP_DESCRIPTIONS: Record<OnboardingStep, string> = {
  location: 'We need to know where you are to show you relevant businesses nearby.',
  'goal-selection': 'Choose what you\'d like to do first - rate a business or find welcoming places.',
  preferences: 'Tell us your dining preferences to get personalized restaurant recommendations.',
  account: 'Create an account to save your ratings and preferences, or continue without one.',
  completed: 'You\'re all set! Start exploring welcoming businesses in your area.',
};

export const useOnboardingFlow = (): OnboardingFlowHelpers => {
  const {
    state,
    setStep,
    setPreferredGoal,
    completeOnboarding,
    isOnboardingComplete,
    shouldShowOnboarding,
  } = useOnboarding();

  const navigate = useNavigate();

  // Current step information
  const currentStep = state.currentStep;
  const isLocationStep = currentStep === 'location';
  const isGoalSelectionStep = currentStep === 'goal-selection';
  const isPreferencesStep = currentStep === 'preferences';
  const isAccountStep = currentStep === 'account';
  const isCompleted = currentStep === 'completed' || isOnboardingComplete;

  // Step navigation helpers
  const getCurrentStepIndex = useCallback(() => {
    return STEP_ORDER.indexOf(currentStep);
  }, [currentStep]);

  const goToNextStep = useCallback(() => {
    const currentIndex = getCurrentStepIndex();
    if (currentIndex < STEP_ORDER.length - 1) {
      const nextStep = STEP_ORDER[currentIndex + 1];
      setStep(nextStep);
    }
  }, [getCurrentStepIndex, setStep]);

  const goToPreviousStep = useCallback(() => {
    const currentIndex = getCurrentStepIndex();
    if (currentIndex > 0) {
      const previousStep = STEP_ORDER[currentIndex - 1];
      setStep(previousStep);
    }
  }, [getCurrentStepIndex, setStep]);

  const goToStep = useCallback((step: OnboardingStep) => {
    setStep(step);
  }, [setStep]);

  const skipOnboarding = useCallback(() => {
    completeOnboarding();
    navigate('/');
  }, [completeOnboarding, navigate]);

  const selectGoal = useCallback((goal: UserGoal) => {
    setPreferredGoal(goal);
    // Component handles navigation (with timeouts/logic)
  }, [setPreferredGoal]);

  const navigateToGoal = useCallback((goal: UserGoal) => {
    setPreferredGoal(goal);

    // Navigate to the appropriate page based on the goal
    switch (goal) {
      case 'mark-business':
        navigate('/mark');
        break;
      case 'find-welcoming':
        navigate('/explore');
        break;
      default:
        navigate('/');
    }
  }, [setPreferredGoal, navigate]);

  // Completion helpers
  const completeOnboardingFlow = useCallback(() => {
    completeOnboarding();

    // Navigate based on preferred goal or default to home
    if (state.preferredGoal) {
      navigateToGoal(state.preferredGoal);
    } else {
      navigate('/');
    }
  }, [completeOnboarding, state.preferredGoal, navigateToGoal, navigate]);

  const shouldShowRegistrationPrompt = useMemo(() => {
    return isOnboardingComplete && state.registrationStatus === 'not-prompted';
  }, [isOnboardingComplete, state.registrationStatus]);

  // Progress tracking
  const getStepProgress = useCallback(() => {
    const currentIndex = getCurrentStepIndex();
    const totalSteps = STEP_ORDER.length;
    return Math.round(((currentIndex + 1) / totalSteps) * 100);
  }, [getCurrentStepIndex]);

  const getStepTitle = useCallback(() => {
    return STEP_TITLES[currentStep] || 'Welcome';
  }, [currentStep]);

  const getStepDescription = useCallback(() => {
    return STEP_DESCRIPTIONS[currentStep] || '';
  }, [currentStep]);

  // Utility computed values
  const canGoBack = useMemo(() => {
    return getCurrentStepIndex() > 0;
  }, [getCurrentStepIndex]);

  const canGoForward = useMemo(() => {
    const currentIndex = getCurrentStepIndex();
    return currentIndex < STEP_ORDER.length - 1;
  }, [getCurrentStepIndex]);

  const isFirstTimeUser = useMemo(() => {
    return shouldShowOnboarding && !state.lastOnboardingDate;
  }, [shouldShowOnboarding, state.lastOnboardingDate]);

  return {
    // Step management
    currentStep,
    isLocationStep,
    isGoalSelectionStep,
    isPreferencesStep,
    isAccountStep,
    isCompleted,

    // Navigation helpers
    goToNextStep,
    goToPreviousStep,
    goToStep,
    skipOnboarding,

    // Goal management
    selectGoal,
    navigateToGoal,

    // Completion helpers
    completeOnboardingFlow,
    shouldShowRegistrationPrompt,

    // Progress tracking
    getStepProgress,
    getStepTitle,
    getStepDescription,

    // Utility methods
    canGoBack,
    canGoForward,
    isFirstTimeUser,
  };
};