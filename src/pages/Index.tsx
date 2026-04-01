import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { MapPin, Search, Plus, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import heroImage from '@/assets/hero-image.jpg';
import { useIsMobile } from '@/hooks/use-mobile';
import InteractiveMap from '@/components/maps/InteractiveMap';
import { useNavigate } from 'react-router-dom';
import { useLocation } from '@/contexts/LocationProvider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { PlacesSearchBar } from '@/components/ui/places-search-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import { useOnboarding } from '@/contexts/OnboardingProvider';
import { useOnboardingFlow } from '@/hooks/useOnboardingFlow';
import { LocationData, UserGoal } from '@/types/onboarding';
import { cn } from '@/lib/utils';
import MobileErrorBoundary from '@/components/mobile/MobileErrorBoundary';
import { ratingsService } from '@/services/ratings.service';
import { Business } from '@/types/firebase';
import { getWelcomingLevel } from '@/components/business/ScoreIndicator';
import { collection, onSnapshot, query, where, limit } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { calculateDistance } from '@/utils/geolocation';
import { placesService } from '@/services/places.service';
import {
  GOOGLE_MAPS_AUTH_FAILURE_EVENT,
  geocodeManualLocation,
  isGoogleMapsReady,
  toManualLocationData
} from '@/utils/googleMaps';

const quickFilters = [
  'Nearest', 'Recently Marked', 'Highly Marked', 'Safe Spots', 'Food', 'Bars'
];

const Index = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { location, updateManualLocation } = useLocation();
  const { shouldShowOnboarding, isOnboardingComplete, state } = useOnboarding();
  const { navigateToGoal } = useOnboardingFlow();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [manualLocation, setManualLocation] = useState('');
  const [manualLocationError, setManualLocationError] = useState<string | null>(null);
  const [isSavingManualLocation, setIsSavingManualLocation] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [nearbyPlaces, setNearbyPlaces] = useState<google.maps.places.PlaceResult[]>([]);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false);
  const [mapCenter, setMapCenter] = useState({ lat: 40.7128, lng: -74.006 }); // Default to NYC
  const [showWelcomeMessage, setShowWelcomeMessage] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [hasGoogleMapsAuthFailure, setHasGoogleMapsAuthFailure] = useState(false);

  // Firebase businesses state
  const [firebaseBusinesses, setFirebaseBusinesses] = useState<Business[]>([]);
  const [isLoadingBusinesses, setIsLoadingBusinesses] = useState(false);
  const [businessesError, setBusinessesError] = useState<string | null>(null);
  const canRenderMap = isGoogleMapsReady() && !hasGoogleMapsAuthFailure;

  useEffect(() => {
    const handleGoogleMapsAuthFailure = () => {
      setHasGoogleMapsAuthFailure(true);
    };

    window.addEventListener(GOOGLE_MAPS_AUTH_FAILURE_EVENT, handleGoogleMapsAuthFailure);
    return () => {
      window.removeEventListener(GOOGLE_MAPS_AUTH_FAILURE_EVENT, handleGoogleMapsAuthFailure);
    };
  }, []);

  useEffect(() => {
    if (location.latitude && location.longitude) {
      setMapCenter({ lat: location.latitude, lng: location.longitude });
    } else if (location.error) {
      // If geolocation fails, prompt user to enter location manually
      setIsModalOpen(true);
    }
  }, [location]);

  // Initialize loading state when location changes
  useEffect(() => {
    if (location.latitude && location.longitude) {
      console.log('🔍 Index.tsx - Location available, starting real-time listener:', {
        latitude: location.latitude,
        longitude: location.longitude
      });
      setIsLoadingBusinesses(true);
      setBusinessesError(null);
    } else {
      console.log('🔍 Index.tsx - No location data:', { location });
      setFirebaseBusinesses([]);
      setIsLoadingBusinesses(false);
    }
  }, [location.latitude, location.longitude]);

  // Set up real-time listener for business ratings - single source of truth
  useEffect(() => {
    if (!location.latitude || !location.longitude) {
      setIsLoadingBusinesses(false);
      return;
    }

    console.log('🔍 Index.tsx - Setting up real-time listener for businesses');

    // Calculate approximate bounding box for the radius (5km)
    const latDelta = 5 / 111; // Rough conversion: 1 degree ≈ 111 km
    const lngDelta = 5 / (111 * Math.cos(location.latitude * Math.PI / 180));

    const minLat = location.latitude - latDelta;
    const maxLat = location.latitude + latDelta;

    // Set up real-time listener for businesses in the area
    const businessesRef = collection(db, 'businesses');
    const q = query(
      businessesRef,
      where('location.latitude', '>=', minLat),
      where('location.latitude', '<=', maxLat),
      limit(50)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        console.log('🔍 Index.tsx - Real-time snapshot received, processing...');

        const businesses: Business[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          // Convert Firestore timestamps to dates
          businesses.push({
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
          } as Business);
        });

        // Filter by longitude and exact distance
        const filteredBusinesses = businesses.filter(business => {
          const distance = calculateDistance(
            { latitude: location.latitude!, longitude: location.longitude! },
            { latitude: business.location.latitude, longitude: business.location.longitude }
          );
          return distance <= 3.1; // Convert 5km to miles (5km ≈ 3.1 miles)
        });

        console.log('🔍 Index.tsx - Real-time Firebase businesses loaded:', {
          total: businesses.length,
          filtered: filteredBusinesses.length,
          timestamp: new Date().toISOString(),
          businesses: filteredBusinesses.map(b => ({
            name: b.name,
            businessId: b.businessId,
            status: b.status,
            averageScore: b.averageScore,
            totalRatings: b.totalRatings,
            updatedAt: b.updatedAt,
            ratingBreakdown: b.ratingBreakdown
          }))
        });

        // Update state and stop loading (with small delay to prevent flicker)
        setFirebaseBusinesses(filteredBusinesses);
        setTimeout(() => {
          setIsLoadingBusinesses(false);
        }, 100);
        setBusinessesError(null);
      },
      (error) => {
        console.error('🔍 Index.tsx - Real-time listener error:', error);
        setBusinessesError('Failed to sync business ratings');
        setIsLoadingBusinesses(false);
      }
    );

    return () => {
      console.log('🔍 Index.tsx - Cleaning up real-time listener');
      unsubscribe();
    };
  }, [location.latitude, location.longitude]);

  // No longer needed - PlacesSearchBar handles autocomplete internally

  // Show welcome message only once for first-time users
  useEffect(() => {
    if (isOnboardingComplete && state.lastOnboardingDate) {
      const completionTime = new Date(state.lastOnboardingDate).getTime();
      const now = new Date().getTime();
      const timeDiff = now - completionTime;

      // Check if welcome message has been shown before
      const hasShownWelcome = localStorage.getItem('welcome-winks-shown');

      // Show welcome message if onboarding was completed within the last 5 minutes AND it hasn't been shown before
      if (timeDiff < 5 * 60 * 1000 && !hasShownWelcome) {
        setShowWelcomeMessage(true);
        // Mark that welcome message has been shown
        localStorage.setItem('welcome-winks-shown', 'true');
        setTimeout(() => {
          setShowWelcomeMessage(false);
        }, 3000);
      }
    }
  }, [isOnboardingComplete, state.lastOnboardingDate]);

  // Fetch nearby places using places service
  useEffect(() => {
    if (!location.latitude || !location.longitude) {
      console.log('📍 Index.tsx - No location available for places fetch');
      return;
    }

    // Wait for Google Maps API to be ready
    if (!window.google?.maps) {
      console.log('📍 Index.tsx - Google Maps API not ready yet');
      return;
    }

    // If we already have places, don't reload
    if (nearbyPlaces.length > 0) {
      console.log('📍 Index.tsx - Places already loaded, skipping fetch');
      return;
    }

    // If already loading, don't start again
    if (isLoadingPlaces) {
      console.log('📍 Index.tsx - Already loading places, skipping');
      return;
    }

    const loadPlaces = async () => {
      console.log('📍 Index.tsx - Starting to fetch nearby places');
      setIsLoadingPlaces(true);

      // Double check maps availability before calling service
      if (!window.google?.maps?.places) {
        console.warn('📍 Index.tsx - Google Maps Places library missing. Aborting fetch.');
        setIsLoadingPlaces(false);
        return;
      }

      try {
        const result = await placesService.searchNearbyPlaces({
          latitude: location.latitude,
          longitude: location.longitude,
          radius: 5000
        });

        console.log('📍 Index.tsx - Places fetched:', result.places.length);
        setNearbyPlaces(result.places);

        // Safety: ensure loading state is cleared
        setIsLoadingPlaces(false);
      } catch (error) {
        console.error('📍 Index.tsx - Error loading places:', error);
        setIsLoadingPlaces(false);
      }
    };

    loadPlaces();
  }, [location.latitude, location.longitude, nearbyPlaces.length, isLoadingPlaces]);

  const handlePlacesFetched = useCallback((places: google.maps.places.PlaceResult[]) => {
    setNearbyPlaces(places);
    setIsLoadingPlaces(false);
  }, []);

  const handlePlaceSelect = (place: google.maps.places.PlaceResult) => {
    // Navigate to the selected place's business page
    navigate(`/business/${place.place_id || place.name?.replace(/\s+/g, '-').toLowerCase()}`);
  };

  const handleLocationChange = async () => {
    const trimmedLocation = manualLocation.trim();
    if (!trimmedLocation) {
      setManualLocationError('Enter a city or address to continue.');
      return;
    }

    setIsSavingManualLocation(true);
    setManualLocationError(null);

    try {
      const resolvedLocation = await geocodeManualLocation(trimmedLocation);

      if (!resolvedLocation) {
        setManualLocationError('We could not find that location. Please try a more specific address.');
        return;
      }

      updateManualLocation(toManualLocationData(resolvedLocation));
      setMapCenter({ lat: resolvedLocation.latitude, lng: resolvedLocation.longitude });
      setManualLocation(resolvedLocation.address);
      setIsModalOpen(false);
    } catch (error) {
      console.error('Manual location lookup failed:', error);
      setManualLocationError('We could not update your location right now. Please try again.');
    } finally {
      setIsSavingManualLocation(false);
    }
  };

  const handleBusinessSelect = (business: any) => {
    navigate(`/business/${business.place_id || business.id}`);
  };

  // Handle onboarding completion with smooth transition
  const handleOnboardingComplete = (userPreferences: { location: LocationData; goal: UserGoal }) => {
    setIsTransitioning(true);
    setShowWelcomeMessage(true);

    // Show welcome message briefly, then navigate or show main app
    setTimeout(() => {
      setShowWelcomeMessage(false);
      setIsTransitioning(false);

      // Navigate to the appropriate page based on the selected goal
      if (userPreferences.goal === 'mark-business') {
        navigate('/mark');
      } else if (userPreferences.goal === 'find-welcoming') {
        navigate('/explore');
      }
      // If no specific goal, stay on home page (main app will show)
    }, 2000);
  };

  // Handle onboarding skip with smooth transition
  const handleOnboardingSkip = () => {
    setIsTransitioning(true);

    // Brief transition before showing main app
    setTimeout(() => {
      setIsTransitioning(false);
    }, 500);
  };

  const displayLocation = manualLocation || (location.error ? 'Location not found' : location.city || 'Loading...');

  // Get Firebase rating data for places
  const placeScores = useMemo(() => {
    const scores: Record<string, number | null> = {};
    const ratingCounts: Record<string, number> = {};

    // First, set all places to null (unrated)
    nearbyPlaces.forEach(place => {
      if (place.place_id) {
        scores[place.place_id] = null;
        ratingCounts[place.place_id] = 0;
      }
    });

    // Then, update with Firebase data where available
    firebaseBusinesses.forEach(business => {
      if (business.businessId && business.status === 'rated') {
        // Try to match by businessId first, then by name as fallback
        const matchingPlaceId = Object.keys(scores).find(placeId => {
          const place = nearbyPlaces.find(p => p.place_id === placeId);
          return place && (
            place.place_id === business.businessId ||
            place.name?.toLowerCase() === business.name?.toLowerCase()
          );
        });

        if (matchingPlaceId) {
          scores[matchingPlaceId] = business.averageScore;
          ratingCounts[matchingPlaceId] = business.totalRatings;
        }
      }
    });

    return { scores, ratingCounts };
  }, [nearbyPlaces, firebaseBusinesses]);

  // Top rated businesses (sorted by Winks Score)
  const topRatedBusinesses = useMemo(() => {
    console.log('🔍 Index.tsx - Filtering top rated businesses:', {
      timestamp: new Date().toISOString(),
      totalBusinesses: firebaseBusinesses.length,
      businessesWithScores: firebaseBusinesses.filter(b => b.averageScore !== null && b.averageScore !== undefined).length,
      businessesWithStatus: firebaseBusinesses.filter(b => b.status === 'rated').length,
      allBusinesses: firebaseBusinesses.map(b => ({
        name: b.name,
        status: b.status,
        averageScore: b.averageScore,
        totalRatings: b.totalRatings
      }))
    });

    return firebaseBusinesses
      .filter(business => {
        // Check if business has been rated (status is 'rated' and has actual ratings)
        const isRated = business.status === 'rated';
        const hasValidScore = business.averageScore !== null && business.averageScore !== undefined && business.averageScore > 0;
        const hasValidRatings = business.totalRatings !== null && business.totalRatings !== undefined && business.totalRatings > 0;

        console.log('🔍 Index.tsx - Business filter check:', {
          name: business.name,
          status: business.status,
          averageScore: business.averageScore,
          totalRatings: business.totalRatings,
          isRated,
          hasValidScore,
          hasValidRatings,
          passes: isRated && hasValidScore && hasValidRatings
        });

        return isRated && hasValidScore && hasValidRatings;
      })
      .sort((a, b) => (b.averageScore || 0) - (a.averageScore || 0))
      .slice(0, 3);
  }, [firebaseBusinesses]);

  // Recently rated businesses (sorted by most recent rating)
  const recentlyRatedBusinesses = useMemo(() => {
    console.log('🔍 Index.tsx - Filtering recently rated businesses:', {
      totalBusinesses: firebaseBusinesses.length,
      businessesWithRatings: firebaseBusinesses.filter(b => b.totalRatings && b.totalRatings > 0).length
    });

    return firebaseBusinesses
      .filter(business => {
        // Check if business has been rated (status is 'rated' and has actual ratings)
        const isRated = business.status === 'rated';
        const hasValidRatings = business.totalRatings !== null && business.totalRatings !== undefined && business.totalRatings > 0;

        console.log('🔍 Index.tsx - Recent business filter check:', {
          name: business.name,
          status: business.status,
          totalRatings: business.totalRatings,
          updatedAt: business.updatedAt,
          isRated,
          hasValidRatings,
          passes: isRated && hasValidRatings
        });

        return isRated && hasValidRatings;
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 3);
  }, [firebaseBusinesses]);

  // Unrated businesses that could be rated
  const unratedBusinesses = useMemo(() => {
    const unrated = firebaseBusinesses
      .filter(business => {
        const isUnrated = business.status === 'neutral' || !business.totalRatings || business.totalRatings === 0;

        console.log('🔍 Index.tsx - Unrated business check:', {
          name: business.name,
          status: business.status,
          totalRatings: business.totalRatings,
          averageScore: business.averageScore,
          isUnrated
        });

        return isUnrated;
      })
      .slice(0, 3);

    console.log('🔍 Index.tsx - Unrated businesses found:', unrated.length);
    return unrated;
  }, [firebaseBusinesses]);

  // Show welcome message after onboarding completion
  if (showWelcomeMessage) {
    return (
      <div className="min-h-screen bg-gradient-surface flex items-center justify-center">
        <Card className="w-full max-w-md mx-auto animate-in fade-in-0 zoom-in-95 duration-500">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Welcome to Welcome Winks!</h2>
            <p className="text-muted-foreground">
              {state.preferredGoal === 'mark-business'
                ? "Let's help you mark your first business!"
                : state.preferredGoal === 'find-welcoming'
                  ? "Let's explore welcoming places in your area!"
                  : "You're all set to start exploring!"
              }
            </p>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Show onboarding for new users
  if (shouldShowOnboarding && !isOnboardingComplete && !isTransitioning) {
    return (
      <OnboardingWizard
        onComplete={handleOnboardingComplete}
        onSkip={handleOnboardingSkip}
        className="min-h-screen"
      />
    );
  }

  // Show loading state during transition
  if (isTransitioning) {
    return (
      <div className="min-h-screen bg-gradient-surface flex items-center justify-center">
        <div className="animate-pulse">
          <div className="w-8 h-8 bg-primary rounded-full animate-bounce"></div>
        </div>
      </div>
    );
  }

  // Show main app interface for users who have completed onboarding
  return (
    <MobileErrorBoundary>
      <div className={cn(
        "min-h-screen bg-gradient-surface",
        isOnboardingComplete && "animate-in fade-in-0 duration-700"
      )}>
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-[2.5rem] shadow-md">
        <div className="relative h-96 md:h-[500px]">
          <img
            src={heroImage}
            alt="Welcome to the community"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/40" />
        </div>

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center px-4 max-w-md">
            <h1 className="text-2xl md:text-4xl font-bold text-white mb-4 drop-shadow-lg">
              Find Your Vibration
            </h1>
            <p className="text-lg text-white/90 mb-8 drop-shadow">
              Discover welcoming places through community insights
            </p>

          </div>
        </div>
      </section>

      {/* Search Section */}
      <section className="px-4 -mt-8 relative z-10">
        <div className="max-w-md mx-auto">
          <Card className="shadow-xl border-0 bg-card/95 backdrop-blur-sm">
            <CardContent className="p-6 space-y-4">
              <PlacesSearchBar
                placeholder="Search places or enter location..."
                onPlaceSelect={handlePlaceSelect}
                onTextChange={setSearchQuery}
                value={searchQuery}
                showLocationIndicator={true}
              />

              <div className="flex items-center justify-between bg-muted/50 p-3 rounded-lg border border-border/50">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm font-medium text-foreground truncate max-w-[200px]">
                    {manualLocation || (location.error ? 'Location not found' : location.city || 'Locating...')}
                  </span>
                </div>
                <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 hover:bg-primary/10 h-auto py-1 px-2 text-xs font-medium" onClick={() => setIsModalOpen(true)}>
                  Change
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Location Change Modal */}
      <Dialog
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) {
            setManualLocationError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Location</DialogTitle>
            <DialogDescription>
              Enter a new city or address to find places near you.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="location" className="text-right">
                Location
              </Label>
              <Input
                id="location"
                value={manualLocation}
                onChange={(e) => {
                  setManualLocation(e.target.value);
                  if (manualLocationError) {
                    setManualLocationError(null);
                  }
                }}
                className="col-span-3"
                placeholder="e.g., Brooklyn, NY"
              />
            </div>
            {manualLocationError && (
              <p className="text-sm text-destructive">{manualLocationError}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" onClick={handleLocationChange} disabled={isSavingManualLocation}>
              {isSavingManualLocation ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Filters */}
      <section className="px-4 mt-8">
        <div className="max-w-md mx-auto">
          <h2 className="text-lg font-semibold mb-4">Quick filters</h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {quickFilters.map((filter) => (
              <Badge
                key={filter}
                variant="outline"
                className="cursor-pointer whitespace-nowrap interactive-scale hover:bg-primary hover:text-primary-foreground"
              >
                {filter}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      {/* Interactive Map Section */}
      <section className="px-4 mt-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-lg font-semibold mb-4">Places near you</h2>
          {canRenderMap ? (
            <InteractiveMap
              height="400px"
              center={mapCenter}
              places={nearbyPlaces}
              placeScores={placeScores.scores}
              onPlacesFetched={handlePlacesFetched}
              onBusinessSelect={handleBusinessSelect}
            />
          ) : (
            <Card className="h-[400px] flex items-center justify-center bg-muted/50">
              <div className="text-center p-6">
                <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold">Map unavailable right now</h3>
                <p className="text-muted-foreground max-w-xs mx-auto">
                  Search and location updates still work. If the map does not load on this device, try using the search bar or entering your location manually.
                </p>
              </div>
            </Card>
          )}
        </div>
      </section>

      {/* Quick Lists Section */}
      <section className="px-4 mt-8 space-y-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Top Rated List */}
            <Card className="interactive-scale hover:shadow-brand">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Top rated nearby</h3>
                  <Button variant="link" size="sm" onClick={() => navigate('/explore')}>View all</Button>
                </div>
                <div className="space-y-3">
                  {isLoadingBusinesses ? (
                    Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
                  ) : topRatedBusinesses.length > 0 ? (
                    topRatedBusinesses.map((business) => {
                      const normalizedScore = Math.min(business.averageScore || 0, 5.0);
                      const welcomingLevel = getWelcomingLevel(normalizedScore);
                      const scoreColor = welcomingLevel === 'very-welcoming' ? 'text-success' :
                        welcomingLevel === 'moderately-welcoming' ? 'text-warning' : 'text-destructive';

                      return (
                        <div key={business.businessId} className="flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/business/${business.businessId}`)}>
                          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                            <span className={`text-xs font-medium ${scoreColor}`}>
                              {Math.min(business.averageScore || 0, 5.0).toFixed(1)}
                            </span>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{business.name}</p>
                            <p className="text-xs text-muted-foreground">{business.address}</p>
                            <p className="text-xs text-muted-foreground">
                              {business.totalRatings} Wink{business.totalRatings !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  ) : unratedBusinesses.length > 0 ? (
                    unratedBusinesses.map((business) => (
                      <div key={business.businessId} className="flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/business/${business.businessId}`)}>
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                          <span className="text-xs font-medium text-muted-foreground">?</span>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{business.name}</p>
                          <p className="text-xs text-muted-foreground">{business.address}</p>
                          <p className="text-xs text-primary">Not rated yet - be the first!</p>
                        </div>
                      </div>
                    ))
                  ) : firebaseBusinesses.length > 0 ? (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground">
                        {firebaseBusinesses.length} business{firebaseBusinesses.length !== 1 ? 'es' : ''} found nearby
                      </p>
                      <p className="text-xs text-muted-foreground mb-2">No ratings yet</p>
                      <Button variant="link" size="sm" onClick={() => navigate('/mark')}>
                        Be the first to rate
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center py-8 space-y-4">
                      <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center">
                        <MapPin className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-lg font-medium">No places found nearby</p>
                        <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-1">
                          We couldn't find any user-rated places in this area yet.
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 max-w-xs mx-auto">
                        <Button onClick={() => navigate('/mark')}>
                          <Plus className="mr-2 h-4 w-4" />
                          Be the first to rate a place
                        </Button>
                        <p className="text-xs text-muted-foreground mt-2">
                          Start by searching for a place you know!
                        </p>
                        {/* Dev helper for seeding */}
                        {process.env.NODE_ENV === 'development' && (
                          <Button variant="outline" size="sm" onClick={() => navigate('/admin')} className="mt-2">
                            Go to Admin to Seed Data
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Recently Rated */}
            <Card className="interactive-scale hover:shadow-brand">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">Recently rated</h3>
                  <Button variant="link" size="sm" onClick={() => navigate('/explore')}>View all</Button>
                </div>
                <div className="space-y-3">
                  {isLoadingBusinesses ? (
                    Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
                  ) : recentlyRatedBusinesses.length > 0 ? (
                    recentlyRatedBusinesses.map((business) => {
                      const normalizedScore = Math.min(business.averageScore || 0, 5.0);
                      const welcomingLevel = getWelcomingLevel(normalizedScore);
                      const scoreColor = welcomingLevel === 'very-welcoming' ? 'text-success' :
                        welcomingLevel === 'moderately-welcoming' ? 'text-warning' : 'text-destructive';

                      return (
                        <div key={business.businessId} className="flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/business/${business.businessId}`)}>
                          <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                            <span className={`text-xs font-medium ${scoreColor}`}>
                              {Math.min(business.averageScore || 0, 5.0).toFixed(1)}
                            </span>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{business.name}</p>
                            <p className="text-xs text-muted-foreground">{business.address}</p>
                            <p className="text-xs text-muted-foreground">
                              {business.totalRatings} Wink{business.totalRatings !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  ) : unratedBusinesses.length > 0 ? (
                    unratedBusinesses.map((business) => (
                      <div key={business.businessId} className="flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/business/${business.businessId}`)}>
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                          <span className="text-xs font-medium text-muted-foreground">?</span>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{business.name}</p>
                          <p className="text-xs text-muted-foreground">{business.address}</p>
                          <p className="text-xs text-primary">Not rated yet - be the first!</p>
                        </div>
                      </div>
                    ))
                  ) : firebaseBusinesses.length > 0 ? (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground">
                        {firebaseBusinesses.length} business{firebaseBusinesses.length !== 1 ? 'es' : ''} found nearby
                      </p>
                      <p className="text-xs text-muted-foreground mb-2">No recent ratings yet</p>
                      <Button variant="link" size="sm" onClick={() => navigate('/mark')}>
                        Rate a place
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground">No businesses found nearby</p>
                      <Button variant="link" size="sm" onClick={() => navigate('/mark')}>
                        Add a business
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div >
      </section >

      {/* CTA Section */}
      < section className="px-4 mt-8 mb-20 md:mb-8" >
        <div className="max-w-md mx-auto text-center">
          <h2 className="text-xl font-semibold mb-2">Ready to help your community?</h2>
          <p className="text-muted-foreground mb-6">
            Mark a place to share your experience and help others choose where to go.
          </p>
          <Button size="lg" className="btn-hero" onClick={() => navigate('/mark')}>
            <Plus className="h-5 w-5 mr-2" />
            Mark a place
          </Button>
        </div>
      </section >
      </div >
    </MobileErrorBoundary>
  );
};

export default Index;
