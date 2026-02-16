import React, { useState, useEffect } from 'react';
import { ArrowLeft, MapPin, Phone, ExternalLink, Share, MessageCircle, Smile, Meh, Frown, Star, Users, TrendingUp, AlertCircle, Info } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlaceDetails } from '@/hooks/usePlaceDetails';
import { Progress } from '@/components/ui/progress';
import { ScoreIndicator, getWelcomingLevel } from '@/components/business/ScoreIndicator';
import { ResponseBreakdownChart } from '@/components/charts/ResponseBreakdownChart';
import { WelcomeWinksScore } from '@/components/business/WelcomeWinksScore';
import { HighlightedText } from '@/components/ui/highlighted-text';
import { Separator } from '@/components/ui/separator';
import ReportBusinessButton from '@/components/business/ReportBusinessButton';
import { ratingsService, SURVEY_QUESTIONS } from '@/services/ratings.service';
import { Business, BusinessRating } from '@/types/firebase';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthProvider';
import { usePreferencePersistence } from '@/hooks/usePreferencePersistence';

// Use centralized survey questions configuration
const surveyQuestions = SURVEY_QUESTIONS.map(q => ({
  ...q,
  score_normal: !q.reverseScored, // Convert reverseScored to score_normal for backward compatibility
  firebaseKey: q.firebaseKey as keyof BusinessRating['responses']
}));

const BusinessPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { place, isLoading, error } = usePlaceDetails(id);
  const { toast } = useToast();
  const auth = useAuth();
  const { trackBusinessView } = usePreferencePersistence();

  // Real data from Firestore
  const [business, setBusiness] = useState<Business | null>(null);
  const [ratings, setRatings] = useState<BusinessRating[]>([]);
  const [loadingRatings, setLoadingRatings] = useState(true);
  const [ratingsError, setRatingsError] = useState<string | null>(null);

  // User rating state
  const [userRating, setUserRating] = useState<BusinessRating | null>(null);
  const [checkingUserRating, setCheckingUserRating] = useState(false);

  // Track view time
  const [viewStartTime] = useState<Date>(new Date());

  // Share functionality
  const handleShare = async () => {
    const shareData = {
      title: `${place?.name} - Welcome Winks`,
      text: `Check out ${place?.name} on Welcome Winks${winksScore ? ` - Welcoming Score: ${winksScore.toFixed(1)}/5.0` : ''}`,
      url: window.location.href
    };

    try {
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        // Use native share API on mobile
        await navigator.share(shareData);
        toast({
          title: "Shared successfully!",
          description: "Thanks for sharing this business with others.",
        });
      } else {
        // Fallback to clipboard
        await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
        toast({
          title: "Link copied!",
          description: "The business link has been copied to your clipboard.",
        });
      }
    } catch (error) {
      console.error('Error sharing:', error);
      // Fallback to clipboard
      try {
        await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
        toast({
          title: "Link copied!",
          description: "The business link has been copied to your clipboard.",
        });
      } catch (clipboardError) {
        console.error('Clipboard error:', clipboardError);
        toast({
          title: "Share failed",
          description: "Unable to share. Please copy the URL manually.",
          variant: "destructive"
        });
      }
    }
  };

  // Fetch business and ratings data
  useEffect(() => {
    const fetchBusinessData = async () => {
      // Use place_id from the place object, or fall back to the URL parameter
      const businessId = place?.place_id || id;

      if (!businessId) {
        console.log('No place_id or URL id available');
        return;
      }

      console.log('Fetching data for business ID:', businessId);
      setLoadingRatings(true);
      setRatingsError(null);

      try {
        // Try to get business from Firestore
        console.log('Looking for business with ID:', businessId);
        const businessData = await ratingsService.getBusiness(businessId);
        setBusiness(businessData);
        console.log('Found business data:', businessData);

        // Get ratings for this business
        console.log('Looking for ratings for business ID:', businessId);
        const ratingsData = await ratingsService.getBusinessRatings(businessId);
        setRatings(ratingsData);
        console.log('Found ratings data:', ratingsData);

        // Also try to find businesses with similar names
        if (!businessData && !ratingsData.length && place.name) {
          console.log('No data found for exact place_id, searching by name...');

          try {
            const searchResults = await ratingsService.searchBusinessesByName(place.name);
            console.log('Search results by name:', searchResults);

            if (searchResults.length > 0) {
              // Use the first matching business
              const matchedBusiness = searchResults[0];
              console.log('Using matched business:', matchedBusiness);
              setBusiness(matchedBusiness);

              const matchedRatings = await ratingsService.getBusinessRatings(matchedBusiness.businessId);
              console.log('Found ratings for matched business:', matchedRatings);
              setRatings(matchedRatings);
            }
          } catch (searchError) {
            console.log('Search by name failed:', searchError);
          }
        }
      } catch (error) {
        console.error('Error fetching business data:', error);
        setRatingsError('Failed to load ratings data');
      } finally {
        setLoadingRatings(false);
      }
    };

    fetchBusinessData();
  }, [place?.place_id, place?.name, id]);

  // Check if current user has already rated this business
  useEffect(() => {
    const checkUserRating = async () => {
      const businessId = place?.place_id || id;
      if (!businessId) return;

      const currentAccount = auth.getCurrentAccount();
      if (currentAccount.type === 'none') return;

      const userId = currentAccount.type === 'full'
        ? (currentAccount.data as any)?.uid // eslint-disable-line @typescript-eslint/no-explicit-any
        : (currentAccount.data as any)?.cookieId; // eslint-disable-line @typescript-eslint/no-explicit-any

      if (!userId) return;

      setCheckingUserRating(true);
      try {
        console.log('🔍 Checking user rating for:', { businessId, userId });
        const existingRating = await ratingsService.getUserRatingForBusiness(businessId, userId);
        setUserRating(existingRating);
        console.log('✅ User rating check result:', {
          found: !!existingRating,
          ratingId: existingRating?.ratingId,
          totalScore: existingRating?.totalScore
        });
      } catch (error) {
        console.warn('❌ Failed to check user rating:', error);
      } finally {
        setCheckingUserRating(false);
      }
    };

    checkUserRating();
  }, [place?.place_id, id, auth]);

  // Track business view on unmount
  useEffect(() => {
    return () => {
      const businessId = place?.place_id || id;
      if (businessId) {
        const viewEndTime = new Date();
        const durationSeconds = Math.floor((viewEndTime.getTime() - viewStartTime.getTime()) / 1000);
        trackBusinessView(businessId, durationSeconds);
      }
    };
  }, [place?.place_id, id, viewStartTime, trackBusinessView]);

  // Calculate real statistics
  const winksScore = business?.averageScore ?? null;
  const totalRatings = business?.totalRatings ?? 0;
  const hasRatings = totalRatings > 0;
  const welcomingLevel = winksScore !== null ? getWelcomingLevel(winksScore) : null;

  // Calculate aggregated response breakdown for chart
  const getAggregatedResponseBreakdown = () => {
    if (!ratings.length) return [];

    return surveyQuestions.map((question, index) => {
      const questionKey = question.firebaseKey;
      const responses = ratings.map(r => r.responses[questionKey]).filter(r => r !== undefined);

      if (responses.length === 0) return null;

      // Calculate average response value
      const averageResponseValue = responses.reduce((sum, val) => sum + val, 0) / responses.length;

      // Map to response text based on value
      let answerText = '';
      if (averageResponseValue >= 0.7) answerText = 'Yes';
      else if (averageResponseValue >= 0.4) answerText = 'Probably';
      else if (averageResponseValue >= 0.1) answerText = 'Probably Not';
      else answerText = 'No';

      return {
        question: question.text,
        answer: answerText,
        score: averageResponseValue,
        isReverse: !question.score_normal,
        responseValue: averageResponseValue
      };
    }).filter(Boolean);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !place) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center p-4">
          <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
          <h2 className="text-xl font-semibold mb-2">Error loading details</h2>
          <Button variant="outline" onClick={() => navigate(-1)}>Go Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-8">
      {/* Header (Mobile Only) */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-lg border-b p-4 md:hidden">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex gap-2">
            <ReportBusinessButton
              businessId={id || ''}
              businessName={place?.name || 'Unknown Business'}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleShare}
              className="hover:bg-primary/10 hover:text-primary transition-colors"
            >
              <Share className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
        {/* Desktop Back Button */}
        <div className="hidden md:flex items-center justify-between mb-4">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Explore
          </Button>
          <div className="flex gap-2">
            <ReportBusinessButton
              businessId={id || ''}
              businessName={place?.name || 'Unknown Business'}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
            >
              <Share className="h-4 w-4 mr-2" />
              Share
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* Left Column: Business Info & Actions */}
          <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-6">
            <Card className="overflow-hidden border-border/50 shadow-sm">
              <div className="aspect-video w-full bg-muted relative">
                {place.photos && <img src={place.photos[0].getUrl()} alt={place.name} className="w-full h-full object-cover" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 text-white">
                  <h1 className="text-2xl font-bold leading-tight shadow-sm">{place.name}</h1>
                  <p className="text-white/90 text-sm mt-1">{place.types?.[0].replace(/_/g, ' ')}</p>
                </div>
              </div>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-muted">{place.user_ratings_total} Google reviews</Badge>
                  <div className="flex items-center gap-1 text-sm font-medium text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                    <Star className="h-3.5 w-3.5 fill-current" />
                    <span>{place.rating}</span>
                  </div>
                </div>

                <div className="space-y-3 pt-2 text-sm text-muted-foreground">
                  <div className="flex items-start gap-3">
                    <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{place.vicinity}</span>
                  </div>
                  {place.formatted_phone_number && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 flex-shrink-0" />
                      <a href={`tel:${place.formatted_phone_number}`} className="hover:text-primary transition-colors">{place.formatted_phone_number}</a>
                    </div>
                  )}
                  {place.website && (
                    <div className="flex items-center gap-3">
                      <ExternalLink className="h-4 w-4 flex-shrink-0" />
                      <a href={place.website} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors underline decoration-dotted underline-offset-4 line-clamp-1">
                        Website
                      </a>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Desktop CTA Location */}
                <div className="pt-2">
                  <Button
                    size="lg"
                    className="w-full shadow-md"
                    onClick={() => {
                      navigate('/mark', {
                        state: {
                          placeName: place?.name,
                          placeData: {
                            place_id: place?.place_id,
                            name: place?.name,
                            formatted_address: place?.formatted_address,
                            vicinity: place?.vicinity,
                            geometry: place?.geometry ? {
                              location: {
                                lat: typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat,
                                lng: typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng
                              }
                            } : null,
                            types: place?.types,
                            rating: place?.rating,
                            user_ratings_total: place?.user_ratings_total
                          },
                          existingRating: userRating
                        }
                      });
                    }}
                    disabled={checkingUserRating}
                  >
                    <MessageCircle className="h-5 w-5 mr-2" />
                    {checkingUserRating
                      ? 'Checking...'
                      : userRating
                        ? 'Edit Your Rating'
                        : hasRatings
                          ? 'Rate This Place'
                          : 'Be the First to Rate'
                    }
                  </Button>
                  <p className="text-xs text-center text-muted-foreground mt-3">
                    Join {totalRatings} others in rating this place
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* User's Existing Rating Alert */}
            {userRating && (
              <Card className="bg-blue-50/50 border-blue-100">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      <ScoreIndicator
                        score={userRating.totalScore}
                        size="medium"
                        variant="full"
                        showLabel={false}
                      />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium text-blue-900">Your Rating</h3>
                      <p className="text-sm text-blue-700 mt-1">
                        You gave a <span className="font-medium">{userRating.totalScore.toFixed(1)}</span>
                        {userRating.updatedAt && (
                          <span className="opacity-80"> on {new Date(userRating.updatedAt).toLocaleDateString()}</span>
                        )}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column: Welcome Winks Score & Data */}
          <div className="lg:col-span-8 space-y-6">

            {/* Main Score Card */}
            {loadingRatings ? (
              <Card>
                <CardContent className="p-8">
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <Skeleton className="h-24 w-24 rounded-full" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-8 w-1/3" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <WelcomeWinksScore
                score={winksScore}
                totalRatings={totalRatings}
                maxPossibleScore={5.0}
                size="large"
                showDetails={true}
                className="shadow-sm border-border/50"
              />
            )}

            {/* Analysis Section */}
            {hasRatings ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Breakdown */}
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="text-lg">Community Insights</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Based on {totalRatings} verified response{totalRatings !== 1 ? 's' : ''}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {loadingRatings ? (
                      <div className="space-y-4">
                        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                      </div>
                    ) : ratingsError ? (
                      <div className="text-center py-4">
                        <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">{ratingsError}</p>
                      </div>
                    ) : (
                      <>
                        {surveyQuestions.map((question, index) => {
                          const questionKey = question.firebaseKey;
                          const responses = ratings.map(r => r.responses[questionKey]).filter(r => r !== undefined);

                          if (responses.length === 0) return null;

                          const positiveResponses = responses.filter(r => r > 0).length;
                          const negativeResponses = responses.filter(r => r < 0).length;
                          const positivePercent = Math.round((positiveResponses / responses.length) * 100);
                          const negativePercent = Math.round((negativeResponses / responses.length) * 100);

                          return (
                            <div key={question.id} className="space-y-2">
                              <p className="text-sm font-medium leading-tight">
                                <HighlightedText text={question.text} />
                              </p>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-success font-medium">Yes {positivePercent}%</span>
                                  <span className="text-destructive font-medium">No {negativePercent}%</span>
                                </div>
                                <div className="relative">
                                  <Progress value={positivePercent} className="w-full h-2.5" />
                                </div>
                              </div>
                              {index < surveyQuestions.length - 1 && <Separator className="mt-4" />}
                            </div>
                          );
                        })}
                        <div className="pt-2">
                          <p className="text-xs text-muted-foreground text-center">
                            These responses contribute to the overall Welcome Winks Score.
                          </p>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Chart & Legend */}
                <div className="space-y-6">
                  <ResponseBreakdownChart
                    responses={getAggregatedResponseBreakdown()}
                    totalScore={winksScore || 0}
                    maxPossibleScore={5.0}
                  />

                  <Card className="bg-muted/30 border-none">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Info className="h-4 w-4" />
                        Understanding the Score
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="flex items-center gap-3">
                        <ScoreIndicator score={4} size="small" variant="icon" />
                        <span className="font-medium text-success text-xs">Very Welcoming (3.5+)</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <ScoreIndicator score={2} size="small" variant="icon" />
                        <span className="font-medium text-warning text-xs">Moderately Welcoming (1.5-3.4)</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <ScoreIndicator score={1} size="small" variant="icon" />
                        <span className="font-medium text-destructive text-xs">Not Very Welcoming (&lt;1.5)</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="text-center py-12">
                  <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center mb-4">
                    <AlertCircle className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                  <h3 className="font-medium text-lg">No Survey Data Yet</h3>
                  <p className="text-muted-foreground mt-1 max-w-sm mx-auto">
                    This business hasn't been surveyed by the community yet. Be the first to share your experience!
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Mobile Sticky CTA (Only visible on small screens) */}
        <div className="sticky bottom-4 md:hidden">
          <Button
            size="lg"
            className="w-full shadow-lg"
            onClick={() => {
              navigate('/mark', {
                state: {
                  placeName: place?.name,
                  placeData: {
                    place_id: place?.place_id,
                    name: place?.name,
                    formatted_address: place?.formatted_address,
                    vicinity: place?.vicinity,
                    geometry: place?.geometry ? {
                      location: {
                        lat: typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat,
                        lng: typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng
                      }
                    } : null,
                    types: place?.types,
                    rating: place?.rating,
                    user_ratings_total: place?.user_ratings_total
                  },
                  existingRating: userRating
                }
              });
            }}
            disabled={checkingUserRating}
          >
            <MessageCircle className="h-5 w-5 mr-2" />
            {checkingUserRating
              ? 'Checking...'
              : userRating
                ? 'Edit Your Rating'
                : hasRatings
                  ? 'Rate This Place'
                  : 'Be the First to Rate'
            }
          </Button>
        </div>
      </div>
    </div>
  );
};

export default BusinessPage;