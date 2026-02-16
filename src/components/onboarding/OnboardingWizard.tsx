import React, { useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, ArrowRight, X, CheckCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { Card, CardContent, CardHeader } from '../ui/card';
import { OnboardingBreadcrumb } from './OnboardingBreadcrumb';
import { OnboardingBackButton } from '../ui/enhanced-back-button';
import { OnboardingTransition } from '../ui/page-transition';
import { LocationData, UserGoal } from '../../types/onboarding';
import { useOnboardingFlow } from '../../hooks/useOnboardingFlow';
import { useEnhancedNavigation } from '../../hooks/useEnhancedNavigation';
import { useLocation } from '../../contexts/LocationProvider';
import { useOnboarding } from '../../contexts/OnboardingProvider';
import { useAuth } from '../../contexts/AuthProvider';
import { useCookieAccount } from '../../hooks/useCookieAccount';
import { usePreferences } from '../../contexts/PreferencesProvider';
import { PreferenceSetupWizard } from '../preferences/PreferenceSetupWizard';
import { DiningPreferences } from '../../types/preferences';
import { cn } from '../../lib/utils';
import {
  announceToScreenReader,
  handleKeyboardNavigation,
  generateAriaLabel,
  SkipLink
} from '../../lib/accessibility';
import {
  LazyLocationDetector,
  LazyGoalSelector,
  LazyAccountStep,
  PerformantOnboardingComponent,
  preloadOnboardingComponents
} from './LazyComponents';
import { LoadingSpinner, PerformanceErrorBoundary } from '../../lib/performance';
import { OnboardingErrorBoundary } from './OnboardingErrorBoundary';
import { useOnboardingErrorHandler } from '../../lib/onboarding-errors';

interface OnboardingWizardProps {
  onComplete?: (userPreferences: { location: LocationData; goal: UserGoal; accountType?: 'full' | 'cookie' | 'none' }) => void;
  onSkip?: () => void;
  className?: string;
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  onComplete,
  onSkip,
  className,
}) => {
  const {
    currentStep,
    isLocationStep,
    isGoalSelectionStep,
    isPreferencesStep,
    isAccountStep,
    isCompleted,
    goToNextStep,
    goToPreviousStep,
    selectGoal,
    completeOnboardingFlow,
    skipOnboarding,
    getStepProgress,
    getStepTitle,
    getStepDescription,
    canGoBack,
    canGoForward,
  } = useOnboardingFlow();

  const { state, updateUserPreferences } = useOnboarding();

  const { location, updateManualLocation } = useLocation();
  const { preferences, updateDiningPreferences, updateOnboardingPreferences, updateLocationPreferences } = usePreferences();

  const {
    setNavigationContext,
  } = useEnhancedNavigation();

  // Authentication integration
  const { user, userProfile, cookieAccount, loading: authLoading, getCurrentAccount } = useAuth();
  const {
    restoreCookieAccount,
    hasValidCookie,
    initializeActivityTracking,
    trackActivity
  } = useCookieAccount();

  const mainContentRef = useRef<HTMLDivElement>(null);
  const previousStepRef = useRef<string>(currentStep);
  const { handleError } = useOnboardingErrorHandler();
  const [accountDetected, setAccountDetected] = React.useState(false);
  const [restoringAccount, setRestoringAccount] = React.useState(false);

  // Preload components for better performance
  useEffect(() => {
    preloadOnboardingComponents();
  }, []);

  // Account detection and restoration on onboarding start
  useEffect(() => {
    const detectAndRestoreAccount = async () => {
      if (accountDetected || authLoading) {
        return;
      }

      setRestoringAccount(true);

      try {
        const currentAccount = getCurrentAccount();

        if (currentAccount.type === 'full' && user && userProfile) {
          // Full account detected - restore user preferences and data
          announceToScreenReader('Welcome back! Your account has been restored.', 'polite');
          setAccountDetected(true);

          // Initialize activity tracking for full account
          await trackActivity('onboarding_start');

          // If user has completed onboarding before, we could skip it
          // For now, let them go through it but with their data restored

        } else if (currentAccount.type === 'cookie' && cookieAccount && hasValidCookie) {
          // Cookie account detected - restore temporary data
          announceToScreenReader('Welcome back! Your temporary account has been restored.', 'polite');
          setAccountDetected(true);

          // Initialize activity tracking for cookie account
          initializeActivityTracking();
          await trackActivity('onboarding_start');

        } else {
          // No account detected - try to restore cookie account from storage
          const restoredCookie = await restoreCookieAccount();
          if (restoredCookie) {
            announceToScreenReader('Your previous session has been restored.', 'polite');
            setAccountDetected(true);
            initializeActivityTracking();
            await trackActivity('onboarding_start');
          }
        }
      } catch (error) {
        console.warn('Account detection/restoration failed:', error);
        // Continue with onboarding even if account restoration fails
      } finally {
        setRestoringAccount(false);
      }
    };

    detectAndRestoreAccount();
  }, [
    accountDetected,
    authLoading,
    user,
    userProfile,
    cookieAccount,
    hasValidCookie,
    getCurrentAccount,
    restoreCookieAccount,
    initializeActivityTracking,
    trackActivity
  ]);

  // Set navigation context when entering onboarding
  const previousStepContextRef = useRef<string | null>(null);

  useEffect(() => {
    // Only update if the step actually changed
    if (previousStepContextRef.current !== currentStep) {
      setNavigationContext({
        fromOnboarding: true,
        step: currentStep,
      });
      previousStepContextRef.current = currentStep;
    }

    // Cleanup when leaving onboarding
    return () => {
      setNavigationContext({
        fromOnboarding: false,
      });
    };
  }, [currentStep, setNavigationContext]);

  // Announce step changes to screen readers
  useEffect(() => {
    if (previousStepRef.current !== currentStep) {
      const stepTitle = getStepTitle();
      const stepProgress = getStepProgress();
      announceToScreenReader(
        `${stepTitle}. Step ${stepProgress}% complete.`,
        'polite'
      );

      // Focus main content when step changes
      if (mainContentRef.current) {
        mainContentRef.current.focus();
      }

      previousStepRef.current = currentStep;
    }
  }, [currentStep, getStepTitle, getStepProgress]);

  // Handle location detection with activity tracking
  const handleLocationDetected = useCallback(async (detectedLocation: LocationData) => {
    updateManualLocation(detectedLocation);

    // Track location detection activity
    try {
      await trackActivity('location_detected');
    } catch (error) {
      console.warn('Failed to track location detection:', error);
    }

    // Auto-advance to next step when location is confirmed
    if (detectedLocation.userConfirmed && isLocationStep) {
      setTimeout(() => {
        goToNextStep();
      }, 500); // Small delay for better UX
    }
  }, [updateManualLocation, trackActivity, isLocationStep, goToNextStep]);

  const handleLocationError = useCallback((error: string) => {
    const onboardingError = handleError(new Error(error), {
      step: currentStep,
      component: 'LocationDetector'
    });
    console.warn('Location detection error:', onboardingError);
    // Don't auto-advance on error, let user handle it
  }, [handleError, currentStep]);

  // Handle goal selection - now goes to preferences step
  const handleGoalSelected = useCallback(async (goal: UserGoal) => {
    selectGoal(goal);

    // Track goal selection activity
    try {
      await trackActivity('goal_selected');
    } catch (error) {
      console.warn('Failed to track goal selection:', error);
    }

    // Auto-advance to preferences step
    setTimeout(() => {
      goToNextStep();
    }, 300);
  }, [selectGoal, trackActivity, goToNextStep]);

  // Handle preferences setup completion
  const handlePreferencesComplete = useCallback(async (diningPreferences: DiningPreferences) => {
    // Save preferences
    updateDiningPreferences(diningPreferences);

    // Mark preferences setup as completed
    updateOnboardingPreferences({
      completedSteps: [...preferences.onboarding.completedSteps, 'preferences-setup'],
    });

    // Track preferences setup activity
    try {
      await trackActivity('preferences_setup_completed');
    } catch (error) {
      console.warn('Failed to track preferences setup:', error);
    }

    // Complete onboarding after preferences
    setTimeout(() => {
      const currentAccount = getCurrentAccount();
      const userPreferences = {
        location: location,
        goal: state.preferredGoal || 'find-welcoming',
        accountType: currentAccount.type
      };

      completeOnboardingFlow();
      onComplete?.(userPreferences);
    }, 300);
  }, [updateDiningPreferences, updateOnboardingPreferences, preferences.onboarding.completedSteps, trackActivity, getCurrentAccount, location, state.preferredGoal, completeOnboardingFlow, onComplete]);

  // Handle preferences skip
  const handlePreferencesSkip = useCallback(async () => {
    // Track preferences skip activity
    try {
      await trackActivity('preferences_setup_skipped');
    } catch (error) {
      console.warn('Failed to track preferences skip:', error);
    }

    // Complete onboarding after skipping preferences
    setTimeout(() => {
      const currentAccount = getCurrentAccount();
      const userPreferences = {
        location: location,
        goal: state.preferredGoal || 'find-welcoming',
        accountType: currentAccount.type
      };

      completeOnboardingFlow();
      onComplete?.(userPreferences);
    }, 300);
  }, [trackActivity, getCurrentAccount, location, state.preferredGoal, completeOnboardingFlow, onComplete]);

  // Handle account step completion
  const handleAccountStepComplete = useCallback(async () => {
    try {
      await trackActivity('account_step_completed');
    } catch (error) {
      console.warn('Failed to track account step completion:', error);
    }

    // Complete onboarding after account step
    setTimeout(() => {
      const currentAccount = getCurrentAccount();
      const preferences = {
        location: location,
        goal: state.preferredGoal || 'find-welcoming',
        accountType: currentAccount.type
      };

      completeOnboardingFlow();
      onComplete?.(preferences);
    }, 300);
  }, [trackActivity, getCurrentAccount, location, state.preferredGoal, completeOnboardingFlow, onComplete]);

  // Handle skip functionality
  const handleSkip = () => {
    announceToScreenReader('Onboarding skipped. Redirecting to main application.', 'polite');
    skipOnboarding();
    onSkip?.();
  };

  // Handle keyboard navigation for the entire wizard
  const handleWizardKeyDown = (event: React.KeyboardEvent) => {
    handleKeyboardNavigation(event, {
      onEscape: () => {
        if (canGoBack) {
          handleEnhancedBack();
        } else {
          handleSkip();
        }
      },
    });
  };

  // Enhanced navigation handlers
  const handleEnhancedBack = () => {
    if (canGoBack) {
      goToPreviousStep();
    } else {
      // Exit onboarding
      handleSkip();
    }
  };

  const handleEnhancedNext = () => {
    if (canGoForward) {
      goToNextStep();
    }
  };

  // Auto-advance from location step if location is already confirmed
  useEffect(() => {
    if (isLocationStep && location.userConfirmed && location.latitude && location.longitude) {
      const timer = setTimeout(() => {
        goToNextStep();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isLocationStep, location.userConfirmed, location.latitude, location.longitude, goToNextStep]);

  // Render step content with lazy loading and error boundaries
  const renderStepContent = () => {
    switch (currentStep) {
      case 'location':
        return (
          <PerformanceErrorBoundary>
            <PerformantOnboardingComponent componentName="LocationDetector">
              <LazyLocationDetector
                onLocationDetected={handleLocationDetected}
                onLocationError={handleLocationError}
              />
            </PerformantOnboardingComponent>
          </PerformanceErrorBoundary>
        );

      case 'goal-selection':
        return (
          <PerformanceErrorBoundary>
            <PerformantOnboardingComponent componentName="GoalSelector">
              <LazyGoalSelector
                location={location}
                onGoalSelected={handleGoalSelected}
              />
            </PerformantOnboardingComponent>
          </PerformanceErrorBoundary>
        );

      case 'preferences':
        return (
          <PerformanceErrorBoundary>
            <PerformantOnboardingComponent componentName="PreferenceSetupWizard">
              <PreferenceSetupWizard
                initialPreferences={preferences.dining}
                onComplete={handlePreferencesComplete}
                onSkip={handlePreferencesSkip}
                onHomeAddressChange={(address) => {
                  // Save address
                  updateLocationPreferences({ homeAddress: address });

                  // Geocode address
                  if (window.google && window.google.maps) {
                    const geocoder = new window.google.maps.Geocoder();
                    geocoder.geocode({ address }, (results, status) => {
                      if (status === 'OK' && results && results[0]) {
                        const { lat, lng } = results[0].geometry.location;
                        updateLocationPreferences({
                          homeCoordinates: { latitude: lat(), longitude: lng() }
                        });
                      }
                    });
                  }
                }}
              />
            </PerformantOnboardingComponent>
          </PerformanceErrorBoundary>
        );

      case 'completed':
        const currentAccount = getCurrentAccount();
        const accountMessage = currentAccount.type === 'full'
          ? 'Your account is ready and your data is securely saved.'
          : currentAccount.type === 'cookie'
            ? 'Your temporary account is active for 45 days.'
            : 'You can create an account anytime to save your progress.';

        return (
          <Card className="w-full max-w-md mx-auto" role="status" aria-live="polite">
            <CardHeader className="text-center">
              <div
                className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"
                aria-hidden="true"
              >
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">Welcome!</h2>
              <p className="text-muted-foreground mb-2">
                All set. Start exploring welcoming businesses.
              </p>
              <p className="text-sm text-muted-foreground">
                {currentAccount.type === 'full'
                  ? 'Your account is ready.'
                  : currentAccount.type === 'cookie'
                    ? 'Temporary account active (45 days).'
                    : 'Create an account to save progress.'}
              </p>
            </CardHeader>
            <CardContent>
              <Button
                onClick={completeOnboardingFlow}
                className="w-full"
                size="lg"
                aria-label="Complete onboarding and start using the app"
              >
                Get Started
              </Button>
            </CardContent>
          </Card>
        );

      default:
        return (
          <div className="flex items-center justify-center p-8">
            <LoadingSpinner size="large" />
          </div>
        );
    }
  };

  if (isCompleted) {
    return null; // Don't render if onboarding is complete
  }

  // Show loading state while restoring account
  if (restoringAccount || authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md mx-auto">
          <CardContent className="flex flex-col items-center justify-center p-8">
            <LoadingSpinner size="large" />
            <p className="mt-4 text-muted-foreground text-center">
              {restoringAccount ? 'Restoring your account...' : 'Loading...'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <OnboardingErrorBoundary
      onError={(error, errorInfo) => {
        handleError(error, {
          step: currentStep,
          component: 'OnboardingWizard',
          errorInfo
        });
      }}
    >
      <div
        className={cn('min-h-screen bg-background flex flex-col', className)}
        onKeyDown={handleWizardKeyDown}
        role="main"
        aria-label="Welcome Winks onboarding wizard"
      >
        <OnboardingTransition>
          {/* Skip to main content link */}
          <SkipLink href="#onboarding-main-content">
            Skip to main content
          </SkipLink>

          {/* Header with progress and navigation */}
          <header
            className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b"
            role="banner"
            aria-label="Onboarding navigation and progress"
          >
            <div className="container mx-auto px-4 py-4">
              <div className="flex items-center justify-between mb-4">
                {/* Enhanced back button */}
                <OnboardingBackButton
                  onBack={handleEnhancedBack}
                  showLabel={true}
                  className={cn(
                    'transition-opacity',
                    !canGoBack && 'opacity-50'
                  )}
                  aria-label={canGoBack ? 'Go back to previous step' : 'Exit onboarding'}
                  disabled={false}
                />

                {/* Skip button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkip}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Skip onboarding and go to main application"
                >
                  <X className="w-4 h-4 mr-2" aria-hidden="true" />
                  Skip
                </Button>
              </div>

              {/* Breadcrumb navigation */}
              <nav className="mb-4" aria-label="Onboarding breadcrumb navigation">
                <OnboardingBreadcrumb showHomeLink />
              </nav>

              {/* Progress bar */}
              <div className="space-y-2" role="region" aria-label="Onboarding progress">
                <div className="flex items-center justify-between text-sm">
                  <h1 className="font-medium text-foreground" id="step-title">
                    {getStepTitle()}
                  </h1>
                  <span
                    className="text-muted-foreground"
                    aria-label={generateAriaLabel.progress(getStepProgress(), 'Onboarding')}
                  >
                    {getStepProgress()}% complete
                  </span>
                </div>
                <Progress
                  value={getStepProgress()}
                  className="h-2"
                  aria-labelledby="step-title"
                  aria-valuenow={getStepProgress()}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
                <p className="text-sm text-muted-foreground" id="step-description">
                  {getStepDescription()}
                </p>
              </div>
            </div>
          </header>

          {/* Main content */}
          <main
            className="flex-1 flex items-center justify-center p-4"
            id="onboarding-main-content"
            ref={mainContentRef}
            tabIndex={-1}
            aria-labelledby="step-title"
            aria-describedby="step-description"
            role="main"
          >
            <div className="w-full max-w-4xl">
              {renderStepContent()}
            </div>
          </main>

          {/* Footer with navigation (only show for certain steps) */}
          {((isGoalSelectionStep && !location.userConfirmed) || isAccountStep) && (
            <footer
              className="sticky bottom-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t"
              role="contentinfo"
              aria-label="Step navigation controls"
            >
              <div className="container mx-auto px-4 py-4">
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={handleEnhancedBack}
                    disabled={!canGoBack}
                    aria-label="Go to previous step"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
                    Previous
                  </Button>

                  <Button
                    onClick={handleEnhancedNext}
                    disabled={!canGoForward}
                    aria-label="Go to next step"
                  >
                    Next
                    <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </footer>
          )}
        </OnboardingTransition>
      </div>
    </OnboardingErrorBoundary>
  );
};