import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Check, Smile, Meh, Frown, MapPin, ThumbsUp, ThumbsDown, Info, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useNavigate, useLocation as useRouterLocation } from 'react-router-dom';
import { usePlacesAutocomplete } from '@/hooks/usePlacesAutocomplete';
import { useLocation } from '@/contexts/LocationProvider';
import { Input } from '@/components/ui/input';
import { ScoreIndicator } from '@/components/business/ScoreIndicator';
import { ResponseBreakdownChart } from '@/components/charts/ResponseBreakdownChart';
import { HighlightedText } from '@/components/ui/highlighted-text';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RegistrationPrompt, RegistrationForm } from '@/components/onboarding';
import { useRegistrationPrompt } from '@/hooks/useRegistrationPrompt';
import { useAuth } from '@/contexts/AuthProvider';
import { ratingsService, SurveyResponses, SURVEY_QUESTIONS, DEFAULT_RESPONSE_VALUES } from '@/services/ratings.service';
import { ipAddressService } from '@/services/ipAddress.service';
import { usePreferencePersistence } from '@/hooks/usePreferencePersistence';

// Use the centralized survey questions configuration
const surveyQuestions = SURVEY_QUESTIONS.map(q => ({
  ...q,
  score_normal: !q.reverseScored // Convert reverseScored to score_normal for backward compatibility
}));



const MarkPage: React.FC = () => {
  const navigate = useNavigate();
  const routerLocation = useRouterLocation();
  const { location } = useLocation();
  const auth = useAuth();
  const { trackBusinessRating } = usePreferencePersistence();

  // UI State
  const [currentStep, setCurrentStep] = useState(0);
  const [placeName, setPlaceName] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<any>(null); // Google Places data
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [finalScore, setFinalScore] = useState(0);
  const [allQuestionsAnswered, setAllQuestionsAnswered] = useState(false);

  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [showDisagreeDialog, setShowDisagreeDialog] = useState(false);

  // Firebase State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [hasExistingRating, setHasExistingRating] = useState(false);
  const [existingRating, setExistingRating] = useState<any>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isCheckingExistingRating, setIsCheckingExistingRating] = useState(false);
  const [isFetchingPlaceDetails, setIsFetchingPlaceDetails] = useState(false);

  // Memoize places options to prevent infinite loops
  const placesOptions = useMemo(() => ({
    location: location.latitude && location.longitude ? {
      lat: location.latitude,
      lng: location.longitude
    } : undefined,
    // Omit types to let Google decide the best suggestions
    radius: 5000 // 5km radius for local suggestions
  }), [location.latitude, location.longitude]);

  const {
    suggestions,
    loading: placesLoading,
    error: placesError,
    searchPlaces,
    clearSuggestions
  } = usePlacesAutocomplete(placesOptions);

  // Registration prompt logic
  const {
    showPrompt,
    showForm,
    isLoading: isRegistrationLoading,
    showRegistrationPrompt,
    handleRegister,
    handleSkip,
    handleRemindLater,
    handleFormSubmit,
    handleFormBack,
    hidePrompt,
    completedGoal,
    // New AccountOptions methods
    handleFullAccount,
    handleCookieAccount,
    handleDeclineAccount,
  } = useRegistrationPrompt();

  useEffect(() => {
    if (routerLocation.state?.placeName && routerLocation.state?.placeData) {
      console.log('Pre-selected place from BusinessPage:', routerLocation.state.placeData);
      console.log('Place ID from BusinessPage:', routerLocation.state.placeData.place_id);
      console.log('🔍 ROUTER STATE DEBUG:', {
        hasExistingRating: !!routerLocation.state?.existingRating,
        existingRating: routerLocation.state?.existingRating,
        fullState: routerLocation.state
      });

      // Debug: Check what's in the router state
      console.log('🔍 ROUTER STATE DEBUG:', {
        hasExistingRating: !!routerLocation.state?.existingRating,
        existingRating: routerLocation.state?.existingRating,
        fullState: routerLocation.state
      });

      setPlaceName(routerLocation.state.placeName);
      setSelectedPlace(routerLocation.state.placeData);

      // Check if we're editing an existing rating
      if (routerLocation.state?.existingRating) {
        console.log('🔄 EDIT MODE: Received existing rating from BusinessPage:', routerLocation.state.existingRating);
        setExistingRating(routerLocation.state.existingRating);
        setIsEditMode(true);
        setHasExistingRating(true);

        // Pre-populate answers from existing rating
        const existingAnswers: Record<string, number> = {};
        const responses = routerLocation.state.existingRating.responses;

        // Convert Firebase responses back to UI format
        Object.entries(responses).forEach(([key, value]) => {
          existingAnswers[key] = value as number;
        });

        setAnswers(existingAnswers);
        console.log('✅ EDIT MODE ACTIVATED from BusinessPage:', {
          isEditMode: true,
          hasExistingRating: true,
          existingRatingId: routerLocation.state.existingRating.ratingId,
          prePopulatedAnswers: existingAnswers
        });
      } else {
        console.log('ℹ️ No existing rating passed from BusinessPage - checking as fallback...');

        // Fallback: Check for existing rating even if not passed from BusinessPage
        const checkFallbackRating = async () => {
          const currentAccount = auth.getCurrentAccount();
          if (currentAccount.type === 'none') return;

          const userId = currentAccount.type === 'full'
            ? (currentAccount.data as any)?.uid
            : (currentAccount.data as any)?.cookieId;

          if (!userId || !routerLocation.state.placeData.place_id) return;

          console.log('🔍 FALLBACK: Checking for existing rating...', { userId, placeId: routerLocation.state.placeData.place_id });
          try {
            const fallbackRating = await ratingsService.getUserRatingForBusiness(
              routerLocation.state.placeData.place_id,
              userId
            );

            if (fallbackRating) {
              console.log('🔄 FALLBACK EDIT MODE: Found existing rating:', fallbackRating);
              setExistingRating(fallbackRating);
              setIsEditMode(true);
              setHasExistingRating(true);

              // Pre-populate answers
              const existingAnswers: Record<string, number> = {};
              Object.entries(fallbackRating.responses).forEach(([key, value]) => {
                existingAnswers[key] = value as number;
              });

              setAnswers(existingAnswers);
              console.log('✅ FALLBACK EDIT MODE ACTIVATED:', {
                isEditMode: true,
                existingRatingId: fallbackRating.ratingId,
                prePopulatedAnswers: existingAnswers
              });
            } else {
              console.log('ℹ️ No existing rating found in fallback check');
            }
          } catch (error) {
            console.warn('❌ Fallback rating check failed:', error);
          }
        };

        checkFallbackRating();
      }

      setCurrentStep(1); // Skip to the first question
    }
  }, [routerLocation.state]);

  // Trigger places search when placeName changes
  useEffect(() => {
    if (placeName && placeName.length >= 3 && !selectedPlace) {
      // Only search if we don't have a selected place
      searchPlaces(placeName);
    } else if (placeName.length < 3) {
      clearSuggestions();
    }
  }, [placeName, selectedPlace]); // searchPlaces and clearSuggestions are stable callbacks

  // Check for existing rating when place is selected
  useEffect(() => {
    const checkExistingRating = async () => {
      console.log('🔍 checkExistingRating called with selectedPlace:', selectedPlace?.place_id);
      if (!selectedPlace?.place_id) return;

      const currentAccount = auth.getCurrentAccount();

      // Only check if user has an account (don't create one just for checking)
      if (currentAccount.type === 'none') return;

      const userId = currentAccount.type === 'full'
        ? (currentAccount.data as any)?.uid
        : (currentAccount.data as any)?.cookieId;

      if (!userId) return;

      console.log('🔍 CHECKING EXISTING RATING:', {
        placeId: selectedPlace.place_id,
        userId,
        accountType: currentAccount.type
      });

      setIsCheckingExistingRating(true);
      try {
        const existingRatingData = await ratingsService.getUserRatingForBusiness(
          selectedPlace.place_id,
          userId
        );

        if (existingRatingData) {
          console.log('✅ Found existing rating:', existingRatingData);
          console.log('🔧 Setting edit mode states...');
          setHasExistingRating(true);
          setExistingRating(existingRatingData);
          setIsEditMode(true);

          // Pre-populate answers from existing rating
          const existingAnswers: Record<string, number> = {};
          const responses = existingRatingData.responses;

          // Convert Firebase responses to UI format
          Object.entries(responses).forEach(([key, value]) => {
            existingAnswers[key] = value as number;
          });

          setAnswers(existingAnswers);
          console.log('✅ Edit mode activated:', {
            hasExistingRating: true,
            isEditMode: true,
            existingRatingId: existingRatingData.ratingId,
            prePopulatedAnswers: existingAnswers
          });
        } else {
          console.log('ℹ️ No existing rating found - new rating mode');
          setHasExistingRating(false);
          setExistingRating(null);
          setIsEditMode(false);
        }
      } catch (error) {
        console.warn('Failed to check existing rating:', error);
      } finally {
        setIsCheckingExistingRating(false);
      }
    };

    checkExistingRating();
  }, [selectedPlace, auth]);

  const handleSuggestionClick = async (suggestion: any) => {
    console.log('Suggestion clicked:', suggestion);

    // Set the display name to the business name, not the full address
    setPlaceName(suggestion.name || suggestion.formatted_address);

    // If this is just an autocomplete result, we need to fetch full place details
    if (!suggestion.geometry && suggestion.place_id) {
      setIsFetchingPlaceDetails(true);
      try {
        // Fetch full place details using Google Places API
        if (window.google) {
          const dummyDiv = document.createElement('div');
          const service = new google.maps.places.PlacesService(dummyDiv);

          const request: google.maps.places.PlaceDetailsRequest = {
            placeId: suggestion.place_id,
            fields: ['name', 'formatted_address', 'geometry', 'place_id', 'vicinity', 'rating', 'user_ratings_total', 'types', 'website', 'formatted_phone_number', 'photos'],
          };

          service.getDetails(request, (result, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && result) {
              console.log('Place details fetched:', result);
              setSelectedPlace(result);
            } else {
              console.error('Failed to fetch place details:', status);
              setSelectedPlace(suggestion); // Fallback to autocomplete result
            }
            setIsFetchingPlaceDetails(false);
          });
        } else {
          setSelectedPlace(suggestion); // Fallback if Google Maps not loaded
          setIsFetchingPlaceDetails(false);
        }
      } catch (error) {
        console.error('Error fetching place details:', error);
        setSelectedPlace(suggestion); // Fallback to autocomplete result
        setIsFetchingPlaceDetails(false);
      }
    } else {
      // Already has full details (came from BusinessPage or has geometry)
      console.log('Using suggestion directly:', suggestion);
      setSelectedPlace(suggestion);
    }

    // Clear suggestions after selection
    clearSuggestions();
  };

  const progress = ((currentStep) / (surveyQuestions.length + 1)) * 100;
  const currentQuestion = surveyQuestions[currentStep - 1];

  // Debug: Log current question info
  console.log('Current question:', {
    step: currentStep,
    questionId: currentQuestion?.id,
    questionText: currentQuestion?.text,
    reverseScored: currentQuestion?.reverseScored
  });

  // Calculate final score when all questions are answered
  useEffect(() => {
    if (allQuestionsAnswered && Object.keys(answers).length === surveyQuestions.length) {
      console.log('All questions answered, calculating final score...');
      calculateAndSetFinalScore();
      setAllQuestionsAnswered(false); // Reset flag
    }
  }, [allQuestionsAnswered, answers, surveyQuestions.length]);

  const handleAnswer = (questionId: string, responseValue: number, isNormal: boolean) => {
    // Map response values to new scoring system
    const responseValueMap = {
      2: DEFAULT_RESPONSE_VALUES.yes,        // Yes
      1: DEFAULT_RESPONSE_VALUES.probably,   // Probably  
      "-1": DEFAULT_RESPONSE_VALUES.probablyNot, // Probably Not
      "-2": DEFAULT_RESPONSE_VALUES.no         // No
    };

    const mappedValue = responseValueMap[responseValue as keyof typeof responseValueMap];

    // For reverse-scored questions, invert the scoring:
    // Yes (0.833) becomes No (0.0), No (0.0) becomes Yes (0.833), etc.
    const calculatedScore = isNormal ? mappedValue : (DEFAULT_RESPONSE_VALUES.yes - mappedValue);

    // Debug logging
    console.log('Answer Debug:', {
      questionId,
      questionText: currentQuestion.text,
      responseValue,
      isNormal,
      mappedValue,
      calculatedScore,
      reverseScored: currentQuestion.reverseScored,
      currentQuestionId: currentQuestion.id
    });

    setAnswers(prev => {
      const newAnswers = { ...prev, [questionId]: calculatedScore };
      console.log('Updated answers state:', newAnswers);
      return newAnswers;
    });

    if (currentStep < surveyQuestions.length) {
      setCurrentStep(prev => prev + 1);
    } else {
      // Mark that we've completed all questions
      setAllQuestionsAnswered(true);
    }
  };

  const calculateAndSetFinalScore = () => {
    console.log('Calculating final score. Selected place:', selectedPlace);
    console.log('Answers:', answers);

    // Safety check - ensure we have a selected place
    if (!selectedPlace || (!selectedPlace.place_id && !selectedPlace.name)) {
      console.error('No valid place selected when calculating score');
      setSubmitError('No business selected. Please go back and select a business first.');
      setCurrentStep(0);
      return;
    }

    const rawTotalScore = Object.values(answers).reduce((acc, val) => acc + val, 0);
    const totalScore = Math.min(rawTotalScore, 5.0); // Cap at 5.0 to handle any edge cases
    console.log('Calculated total score:', totalScore, '(raw:', rawTotalScore, ')');

    // Debug: Log each answer individually
    Object.entries(answers).forEach(([questionId, score]) => {
      const question = surveyQuestions.find(q => q.id === questionId);
      console.log(`Question ${questionId}: ${question?.text} - Score: ${score} (Reverse: ${question?.reverseScored})`);
    });
    setFinalScore(totalScore);
    setShowConfirmation(true); // Show confirmation step instead of moving to final screen
  };

  const handleConfirmScore = async () => {
    console.log('🎯 Confirming score - Current states:', {
      isEditMode,
      hasExistingRating,
      existingRatingId: existingRating?.ratingId,
      selectedPlaceId: selectedPlace?.place_id
    });
    await submitRatingToFirebase();
  };

  const handleDisagreeScore = () => {
    setShowDisagreeDialog(true);
  };

  const handleRetakeSurvey = () => {
    setShowDisagreeDialog(false);
    setShowConfirmation(false);
    setAnswers({});
    setCurrentStep(1); // Go back to first question
  };

  const handleSubmitAnyway = async () => {
    setShowDisagreeDialog(false);
    await submitRatingToFirebase();
  };

  // Submit rating to Firebase
  const submitRatingToFirebase = async () => {
    console.log('Submitting rating - selectedPlace:', selectedPlace);
    console.log('Place ID:', selectedPlace?.place_id);
    console.log('Has geometry:', !!selectedPlace?.geometry);
    console.log('Geometry location:', selectedPlace?.geometry?.location);

    if (!selectedPlace || (!selectedPlace.place_id && !selectedPlace.name)) {
      console.error('Submit rating: No valid place selected');
      setSubmitError('No business selected. Please go back and select a business first.');
      return;
    }

    const currentAccount = auth.getCurrentAccount();

    // If no account, create a simple anonymous session
    let anonymousUserId: string | null = null;
    if (currentAccount.type === 'none') {
      console.log('Creating simple anonymous session...');
      anonymousUserId = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      console.log('Anonymous session created:', anonymousUserId);
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Additional safety check for existing ratings
      if (hasExistingRating && !isEditMode) {
        console.error('🚨 Safety check failed: User has existing rating but not in edit mode');
        setSubmitError('You have already rated this business. Please refresh the page to edit your existing rating.');
        setIsSubmitting(false);
        return;
      }
      // Get user ID and account type
      let userId: string;
      let accountType: 'full' | 'cookie' | 'anonymous';

      const updatedAccount = auth.getCurrentAccount();
      if (updatedAccount.type === 'full') {
        userId = (updatedAccount.data as any)?.uid || '';
        accountType = 'full';
      } else if (updatedAccount.type === 'cookie') {
        userId = (updatedAccount.data as any)?.cookieId || '';
        accountType = 'cookie';
      } else if (anonymousUserId) {
        // Use the anonymous Firebase user ID we created
        userId = anonymousUserId;
        accountType = 'anonymous';
      } else {
        throw new Error('User ID not found');
      }

      if (!userId) {
        throw new Error('User ID not found');
      }

      // Convert answers to Firebase format
      const surveyResponses: SurveyResponses = {
        trumpWelcome: answers['trumpWelcome'] || 0,
        obamaWelcome: answers['obamaWelcome'] || 0,
        personOfColorComfort: answers['personOfColorComfort'] || 0,
        lgbtqSafety: answers['lgbtqSafety'] || 0,
        undocumentedSafety: answers['undocumentedSafety'] || 0,
        firearmNormal: answers['firearmNormal'] || 0,
      };

      // Get user's IP address (optional for anonymous users)
      let userIpAddress: string;
      try {
        userIpAddress = await ipAddressService.getCurrentIPAddress();
      } catch (error) {
        console.warn('Failed to get IP address:', error);
        userIpAddress = '0.0.0.0'; // Fallback for anonymous users
      }

      // Create or get business first
      // Ensure we have a business ID
      const businessId = selectedPlace.place_id || `manual_${selectedPlace.name?.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`;

      const businessData = {
        ...selectedPlace,
        place_id: businessId
      };

      console.log('Creating business with data:', businessData);
      await ratingsService.createBusiness(businessData);

      console.log('🔍 SUBMISSION DEBUG - Current States:', {
        isEditMode,
        hasExistingRating,
        existingRatingId: existingRating?.ratingId,
        userId,
        accountType,
        businessId
      });

      // Debug logging for submission mode
      console.log('🔍 DETAILED Submission Debug Info:', {
        isEditMode,
        hasExistingRating,
        existingRating: existingRating ? {
          ratingId: existingRating.ratingId,
          businessId: existingRating.businessId,
          totalScore: existingRating.totalScore
        } : null,
        businessId,
        userId,
        accountType,
        conditionCheck: isEditMode && existingRating,
        typeof_isEditMode: typeof isEditMode,
        typeof_existingRating: typeof existingRating
      });

      // Double-check for existing rating before submission
      if (!isEditMode && selectedPlace?.place_id) {
        console.log('🔍 Double-checking for existing rating before new submission...');
        try {
          const doubleCheckRating = await ratingsService.getUserRatingForBusiness(selectedPlace.place_id, userId);
          if (doubleCheckRating) {
            console.error('🚨 CRITICAL: Found existing rating during double-check!', doubleCheckRating);
            setSubmitError('You have already rated this business. Please refresh the page to edit your existing rating.');
            setIsSubmitting(false);
            return;
          }
        } catch (error) {
          console.warn('Double-check failed:', error);
        }
      }

      // ALWAYS do final check for existing rating to determine submission method
      console.log('🔍 ALWAYS doing final existing rating check before submission...');
      let finalExistingRating = null;
      try {
        finalExistingRating = await ratingsService.getUserRatingForBusiness(businessId, userId);
        console.log('🔍 Final check result:', {
          found: !!finalExistingRating,
          ratingId: finalExistingRating?.ratingId,
          businessId,
          userId
        });
      } catch (error) {
        console.warn('❌ Final existing rating check failed:', error);
      }

      // Submit or update rating based on final check
      if (finalExistingRating) {
        console.log('🔄 UPDATING existing rating:', finalExistingRating.ratingId);
        await ratingsService.updateRating(
          finalExistingRating.ratingId,
          businessId,
          userId,
          accountType,
          surveyResponses,
          userIpAddress
        );
        console.log('✅ Rating updated successfully');
      } else {
        console.log('🆕 SUBMITTING new rating');
        await ratingsService.submitRating(
          businessId,
          userId,
          accountType,
          surveyResponses,
          userIpAddress
        );
        console.log('✅ New rating submitted successfully');
      }

      // Track the rating in preferences for learning
      trackBusinessRating(businessId, finalScore);

      // Success - move to final screen
      setIsConfirmed(true);
      setShowConfirmation(false);
      setCurrentStep(prev => prev + 1);

      // Show registration prompt after completing the business winking goal
      setTimeout(() => {
        showRegistrationPrompt('mark-business');
      }, 1000);

    } catch (error) {
      console.error('Failed to submit rating:', error);

      if (error instanceof Error) {
        if (error.message.includes('already rated')) {
          setSubmitError('You have already rated this business. Each user can only rate a business once.');
          setHasExistingRating(true);
        } else {
          setSubmitError(error.message);
        }
      } else {
        setSubmitError('Failed to submit rating. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const getScoreBreakdown = () => {
    return surveyQuestions.map((question, index) => {
      const answer = answers[question.id];
      if (answer === undefined) return null;

      // Find which response value this matches
      let answerText = '';
      let responseValue = 0;

      if (Math.abs(answer - DEFAULT_RESPONSE_VALUES.yes) < 0.01) {
        answerText = 'Yes';
        responseValue = DEFAULT_RESPONSE_VALUES.yes;
      } else if (Math.abs(answer - DEFAULT_RESPONSE_VALUES.probably) < 0.01) {
        answerText = 'Probably';
        responseValue = DEFAULT_RESPONSE_VALUES.probably;
      } else if (Math.abs(answer - DEFAULT_RESPONSE_VALUES.probablyNot) < 0.01) {
        answerText = 'Probably Not';
        responseValue = DEFAULT_RESPONSE_VALUES.probablyNot;
      } else if (Math.abs(answer - DEFAULT_RESPONSE_VALUES.no) < 0.01) {
        answerText = 'No';
        responseValue = DEFAULT_RESPONSE_VALUES.no;
      } else {
        // For reverse scored questions, calculate the original response
        if (!question.score_normal) {
          const originalValue = DEFAULT_RESPONSE_VALUES.yes - answer;
          if (Math.abs(originalValue - DEFAULT_RESPONSE_VALUES.yes) < 0.01) {
            answerText = 'Yes';
            responseValue = DEFAULT_RESPONSE_VALUES.yes;
          } else if (Math.abs(originalValue - DEFAULT_RESPONSE_VALUES.probably) < 0.01) {
            answerText = 'Probably';
            responseValue = DEFAULT_RESPONSE_VALUES.probably;
          } else if (Math.abs(originalValue - DEFAULT_RESPONSE_VALUES.probablyNot) < 0.01) {
            answerText = 'Probably Not';
            responseValue = DEFAULT_RESPONSE_VALUES.probablyNot;
          } else if (Math.abs(originalValue - DEFAULT_RESPONSE_VALUES.no) < 0.01) {
            answerText = 'No';
            responseValue = DEFAULT_RESPONSE_VALUES.no;
          }
        }
      }

      return {
        question: question.text,
        answer: answerText,
        score: answer,
        isReverse: !question.score_normal,
        responseValue: responseValue
      };
    }).filter(Boolean);
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    } else {
      navigate(-1);
    }
  };

  // Step 0: Place Name
  if (currentStep === 0) {
    const currentAccount = auth.getCurrentAccount();
    const isAuthenticated = currentAccount.type !== 'none';

    return (
      <div className="max-w-md mx-auto p-4">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={handleBack}><ArrowLeft className="h-5 w-5" /></Button>
          <Progress value={0} className="h-2 flex-1" />
        </div>



        <Card>
          <CardContent className="p-6 space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold">
                {isEditMode ? 'Edit Your Rating' : 'Wink at a Place'}
              </h2>
              <p className="text-muted-foreground text-sm">
                {isEditMode
                  ? 'Update your responses for this establishment.'
                  : 'Start by finding the establishment.'
                }
              </p>
              {isEditMode && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    You're editing your existing rating. Your previous responses are pre-filled.
                  </p>
                </div>
              )}
            </div>

            <div className="relative">
              <Input
                placeholder="Enter the place name..."
                value={placeName}
                onChange={(e) => {
                  const newValue = e.target.value;
                  setPlaceName(newValue);

                  // Only clear selection if the user is actually typing something different
                  // Don't clear if they're just editing the current selection
                  if (selectedPlace && newValue !== selectedPlace.name && newValue !== selectedPlace.formatted_address) {
                    setSelectedPlace(null);
                  }
                }}
                className="text-lg"
              />
              {suggestions.length > 0 && (
                <Card className="absolute z-10 w-full mt-2 max-h-60 overflow-y-auto">
                  <CardContent className="p-2">
                    {suggestions.map((suggestion) => (
                      <div
                        key={suggestion.place_id}
                        className="p-3 hover:bg-accent rounded-md cursor-pointer border-b border-border last:border-b-0"
                        onClick={() => handleSuggestionClick(suggestion)}
                      >
                        <div className="font-medium text-sm">
                          {suggestion.name || 'Unknown Business'}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {suggestion.formatted_address || suggestion.vicinity || 'No address available'}
                        </div>
                        {suggestion.types && suggestion.types[0] && (
                          <div className="text-xs text-muted-foreground mt-1 capitalize">
                            {suggestion.types[0].replace(/_/g, ' ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
              {placesLoading && placeName.length >= 3 && (
                <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    Searching for places...
                  </p>
                </div>
              )}
              {placesError && (
                <div className="mt-2 p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-800 dark:text-red-200">
                    {placesError.message}
                  </p>
                </div>
              )}
              {placeName && placeName.length >= 3 && !selectedPlace && suggestions.length === 0 && !placesLoading && !placesError && (
                <div className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    No suggestions found. Try typing a more specific business name or address.
                  </p>
                </div>
              )}
            </div>

            {selectedPlace && (
              <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-start justify-between gap-2 text-sm text-green-800 dark:text-green-200">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-medium">
                        {selectedPlace.name || 'Selected Business'}
                      </div>
                      <div className="text-xs opacity-75 mt-1">
                        {selectedPlace.formatted_address || selectedPlace.vicinity || 'Address not available'}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedPlace(null);
                      setPlaceName('');
                    }}
                    className="h-6 w-6 p-0 text-green-600 hover:text-green-800"
                  >
                    ×
                  </Button>
                </div>
              </div>
            )}

            {/* Place Details Loading */}
            {isFetchingPlaceDetails && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading place details...
              </div>
            )}

            {/* Existing Rating Check */}
            {isCheckingExistingRating && selectedPlace && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking if you've already rated this business...
              </div>
            )}

            {hasExistingRating && existingRating && (
              <Alert className="bg-blue-50 border-blue-200">
                <AlertCircle className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">You've already rated this business</p>
                      <p className="text-sm mt-1">
                        Current score: {existingRating.totalScore.toFixed(1)}/5.0
                        {existingRating.updatedAt && (
                          <span> • Updated {new Date(existingRating.updatedAt).toLocaleDateString()}</span>
                        )}
                      </p>
                    </div>
                    <ScoreIndicator
                      score={existingRating.totalScore}
                      size="small"
                      variant="icon"
                    />
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <Button
              onClick={() => setCurrentStep(1)}
              className="w-full"
              disabled={!selectedPlace || isCheckingExistingRating || isFetchingPlaceDetails}
            >
              {isFetchingPlaceDetails ? 'Loading place details...' :
                !selectedPlace && placeName ? 'Please select from suggestions' :
                  hasExistingRating ? 'Edit Your Rating' : 'Continue'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Score Confirmation Step
  if (showConfirmation) {
    // Safety check - if no place is selected, go back to step 0
    if (!selectedPlace || (!selectedPlace.place_id && !selectedPlace.name)) {
      console.error('Confirmation step: No valid place selected');
      setShowConfirmation(false);
      setCurrentStep(0);
      setSubmitError('No business selected. Please select a business first.');
      return null;
    }

    const scoreBreakdown = getScoreBreakdown();

    return (
      <>
        <div className="max-w-md mx-auto p-4">
          <div className="flex items-center gap-4 mb-6">
            <Button variant="ghost" size="icon" onClick={() => setShowConfirmation(false)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Progress value={100} className="h-2 flex-1" />
          </div>

          <Card>
            <CardHeader className="text-center pb-4">
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-2">
                <MapPin className="h-4 w-4" />
                <span>Reviewing: <strong>{placeName}</strong></span>
              </div>
              <CardTitle className="text-xl">
                {isEditMode ? 'Confirm Your Updated Rating' : 'Confirm Your Assessment'}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {isEditMode
                  ? 'Please review your updated welcoming score based on your new responses'
                  : 'Please review the calculated welcoming score based on your responses'
                }
              </p>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Score Display */}
              <div className="text-center py-4 border rounded-lg bg-muted/20">
                <h3 className="text-lg font-semibold mb-3">Calculated Winks Score</h3>
                <ScoreIndicator
                  score={finalScore}
                  size="large"
                  variant="full"
                  showLabel={true}
                  className="mx-auto"
                />
              </div>

              {/* Score Explanation */}
              <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                      How Winks Scores Work
                    </p>
                    <p className="text-blue-700 dark:text-blue-300">
                      Scores range from 0 to 5.0. Higher scores indicate more welcoming environments.
                      Some questions are reverse-scored to ensure balanced assessment.
                    </p>
                  </div>
                </div>
              </div>

              {/* Score Breakdown Chart */}
              <ResponseBreakdownChart
                responses={scoreBreakdown}
                totalScore={finalScore}
                maxPossibleScore={5.0}
                className="mt-6"
              />

              {/* Error Display */}
              {submitError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              )}

              {/* Confirmation Buttons */}
              <div className="space-y-3">
                <Button
                  onClick={handleConfirmScore}
                  className="w-full h-12 text-base bg-success hover:bg-success/90 text-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02]"
                  size="lg"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      {isEditMode ? 'Updating Rating...' : 'Submitting Rating...'}
                    </>
                  ) : (
                    <>
                      <ThumbsUp className="h-5 w-5 mr-2" />
                      {isEditMode ? 'Update My Rating' : 'This looks accurate - Submit'}
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleDisagreeScore}
                  variant="outline"
                  className="w-full h-12 text-base border-2 hover:bg-muted/50 transition-all duration-200 hover:scale-[1.01]"
                  size="lg"
                  disabled={isSubmitting}
                >
                  <ThumbsDown className="h-5 w-5 mr-2" />
                  This doesn't seem right
                </Button>
              </div>

              {/* Additional Context */}
              <div className="text-center text-xs text-muted-foreground pt-2">
                Your assessment helps build a more welcoming community
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Disagree Dialog */}
        <AlertDialog open={showDisagreeDialog} onOpenChange={setShowDisagreeDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Score doesn't look right?</AlertDialogTitle>
              <AlertDialogDescription>
                If the calculated score doesn't match your assessment of this business, you can retake the survey or submit it anyway.
                Your honest responses help build a more accurate community picture.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowDisagreeDialog(false)} disabled={isSubmitting}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleRetakeSurvey} disabled={isSubmitting}>
                Retake Survey
              </AlertDialogAction>
              <AlertDialogAction onClick={handleSubmitAnyway} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Anyway'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // Final Step: Show Score
  if (currentStep > surveyQuestions.length) {
    return (
      <div className="max-w-md mx-auto p-4 text-center">
        <Card className="border-success/20 shadow-lg">
          <CardContent className="p-6 space-y-6">
            <div className="text-center">
              <div className="relative">
                <div className="absolute inset-0 bg-success/10 rounded-full animate-pulse"></div>
                <Check className="h-16 w-16 text-success mx-auto mb-4 relative z-10 animate-bounce" />
              </div>
              <h2 className="text-2xl font-bold text-success mb-2">
                {isEditMode ? 'Rating Updated!' : 'Mark Submitted!'}
              </h2>
              <p className="text-muted-foreground">
                {isEditMode
                  ? 'Your rating has been successfully updated'
                  : 'Thank you for contributing to our welcoming community database'
                }
              </p>
            </div>

            <div className="py-6 border rounded-lg bg-gradient-to-br from-success/5 to-primary/5 border-success/20">
              <h3 className="text-lg font-semibold mb-4">
                {isEditMode ? 'Updated Winks Score for' : 'Final Winks Score for'}
              </h3>
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-4">
                <MapPin className="h-4 w-4" />
                <span className="font-medium">{placeName}</span>
              </div>
              <ScoreIndicator
                score={finalScore}
                size="large"
                variant="full"
                showLabel={true}
                className="mx-auto"
              />
              {isConfirmed && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-success">
                  <ThumbsUp className="h-4 w-4" />
                  <span>Confirmed by you</span>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <Button
                onClick={() => navigate('/explore')}
                className="w-full h-12 bg-primary hover:bg-primary/90 shadow-md hover:shadow-lg transition-all duration-200"
                size="lg"
              >
                Explore More Businesses
              </Button>
              <Button
                onClick={() => navigate('/')}
                variant="outline"
                className="w-full h-10"
              >
                Back to Home
              </Button>
            </div>

            <div className="text-xs text-muted-foreground pt-2 border-t">
              Your contribution helps others find welcoming places in the community
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Survey Steps
  return (
    <div className="max-w-md mx-auto p-4">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={handleBack}><ArrowLeft className="h-5 w-5" /></Button>
        <Progress value={progress} className="h-2" />
      </div>
      <Card>
        <CardContent className="p-6 space-y-6">
          {/* Existing Rating Warning */}
          {isEditMode && existingRating && (
            <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <ScoreIndicator
                    score={existingRating.totalScore}
                    size="small"
                    variant="icon"
                  />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-blue-900 text-sm">You're editing your existing rating</h3>
                  <p className="text-xs text-blue-700 mt-1">
                    Current score: <span className="font-medium">{existingRating.totalScore.toFixed(1)}/5.0</span>
                    {existingRating.updatedAt && (
                      <span> • Last updated {new Date(existingRating.updatedAt).toLocaleDateString()}</span>
                    )}
                  </p>
                  <p className="text-xs text-blue-600 mt-2">
                    Your previous answers are pre-filled. Make any changes you'd like.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground border-b pb-4">
            <MapPin className="h-4 w-4" />
            <span>Reviewing: <strong>{placeName}</strong></span>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Question {currentStep} of {surveyQuestions.length}</p>
            <h2 className="text-xl font-semibold mt-2">
              <HighlightedText text={currentQuestion.text} />
            </h2>
            {isEditMode && answers[currentQuestion.id] !== undefined && (
              <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  Current answer: <span className="font-medium">
                    {(() => {
                      const value = answers[currentQuestion.id];
                      const responseMap = {
                        [DEFAULT_RESPONSE_VALUES.yes]: 'Yes',
                        [DEFAULT_RESPONSE_VALUES.probably]: 'Probably',
                        [DEFAULT_RESPONSE_VALUES.probablyNot]: 'Probably Not',
                        [DEFAULT_RESPONSE_VALUES.no]: 'No'
                      };

                      // For reverse scored questions, we need to flip the display
                      if (currentQuestion.reverseScored) {
                        const flippedValue = DEFAULT_RESPONSE_VALUES.yes - value;
                        return responseMap[flippedValue] || 'Unknown';
                      }

                      return responseMap[value] || 'Unknown';
                    })()}
                  </span>
                </p>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Button variant="outline" className="h-20 text-lg" onClick={() => handleAnswer(currentQuestion.id, 2, currentQuestion.score_normal)}>Yes</Button>
            <Button variant="outline" className="h-20 text-lg" onClick={() => handleAnswer(currentQuestion.id, -2, currentQuestion.score_normal)}>No</Button>
            <Button variant="outline" className="h-20 text-lg" onClick={() => handleAnswer(currentQuestion.id, 1, currentQuestion.score_normal)}>Probably</Button>
            <Button variant="outline" className="h-20 text-lg" onClick={() => handleAnswer(currentQuestion.id, -1, currentQuestion.score_normal)}>Probably Not</Button>
          </div>
        </CardContent>
      </Card>

      {/* Registration Prompt */}
      {showPrompt && completedGoal && (
        <RegistrationPrompt
          completedGoal={completedGoal}
          onFullAccount={handleFullAccount}
          onCookieAccount={handleCookieAccount}
          onDeclineAccount={handleDeclineAccount}
          onClose={hidePrompt}
          // Backward compatibility
          onRegister={handleRegister}
          onSkip={handleSkip}
          onRemindLater={handleRemindLater}
        />
      )}

      {/* Registration Form */}
      {showForm && (
        <RegistrationForm
          onSubmit={handleFormSubmit}
          onBack={handleFormBack}
          isLoading={isRegistrationLoading}
        />
      )}
    </div>
  );
};

export default MarkPage;
