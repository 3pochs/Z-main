import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Loader2, AlertCircle, CheckCircle, RefreshCw, Search } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import { LocationData, LocationSource } from '../../types/onboarding';
// import { useGeolocation } from '../../hooks/useGeolocation'; // Removed local hook usage
import { useLocation } from '../../contexts/LocationProvider';
import { usePlacesAutocomplete } from '../../hooks/usePlacesAutocomplete';
import {
  announceToScreenReader,
  handleKeyboardNavigation,
  generateId
} from '../../lib/accessibility';
import { geocodeManualLocation, toManualLocationData } from '../../utils/googleMaps';

interface LocationDetectorProps {
  onLocationDetected: (location: LocationData) => void;
  onLocationError: (error: string) => void;
}

export const LocationDetector: React.FC<LocationDetectorProps> = ({
  onLocationDetected,
  onLocationError,
}) => {
  const {
    location,
    loading,
    confirmLocation,
    updateManualLocation,
    retryLocationDetection,
    canRetry,
    retryCount,
    maxRetries,
    lastError,
    detectLocation
  } = useLocation();
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualLocationQuery, setManualLocationQuery] = useState('');
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isResolvingManualLocation, setIsResolvingManualLocation] = useState(false);
  const [manualEntryError, setManualEntryError] = useState<string | null>(null);

  const {
    suggestions,
    loading: placesLoading,
    searchPlaces,
    clearSuggestions,
  } = usePlacesAutocomplete();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsListRef = useRef<HTMLDivElement>(null);
  const locationStatusId = generateId('location-status');
  const searchInputId = generateId('location-search');
  const suggestionsId = generateId('location-suggestions');
  const hasCoordinates = location.latitude !== null && location.longitude !== null;

  // Handle location updates
  useEffect(() => {
    if (hasCoordinates && !location.error) {
      announceToScreenReader(`Location detected: ${location.city || 'Unknown location'}`, 'polite');
      onLocationDetected(location);
    } else if (location.error) {
      announceToScreenReader(`Location detection failed: ${location.error}`, 'assertive');
      onLocationError(location.error);
    }
  }, [location]); // Removed onLocationDetected and onLocationError from dependencies

  // Reset suggestion selection when suggestions change
  useEffect(() => {
    setSelectedSuggestionIndex(-1);
  }, [suggestions]);

  // Auto-show manual entry if location error occurs
  useEffect(() => {
    if (location.error) {
      setShowManualEntry(true);
      // Focus the input after a short delay for transition
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [location.error]);

  const handleRetryLocation = async () => {
    setIsRetrying(true);
    try {
      await retryLocationDetection();
      announceToScreenReader('Retrying location detection...', 'polite');
    } catch (error) {
      console.error('Retry failed:', error);
      announceToScreenReader('Retry failed. Please try manual entry.', 'assertive');
    } finally {
      setIsRetrying(false);
    }
  };

  const handleConfirmLocation = () => {
    confirmLocation();
    if (hasCoordinates) {
      announceToScreenReader('Location confirmed. Proceeding to next step.', 'polite');
      onLocationDetected({ ...location, userConfirmed: true });
    }
  };

  const handleManualLocationSelect = (place: google.maps.places.PlaceResult) => {
    if (place.geometry?.location) {
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();

      const manualLocationData: Partial<LocationData> = {
        latitude: lat,
        longitude: lng,
        city: place.name || place.formatted_address || 'Selected Location',
        address: place.formatted_address || place.name || 'Selected Location',
        source: 'manual' as LocationSource,
        accuracy: null,
        userConfirmed: false,
        error: null,
      };

      updateManualLocation(manualLocationData);
      setShowManualEntry(false);
      setManualLocationQuery('');
      setManualEntryError(null);
      clearSuggestions();
    }
  };

  const handleManualLocationSubmit = async () => {
    const trimmedQuery = manualLocationQuery.trim();
    if (!trimmedQuery) {
      setManualEntryError('Enter a city or address to continue.');
      return;
    }

    setIsResolvingManualLocation(true);
    setManualEntryError(null);

    try {
      const resolvedLocation = await geocodeManualLocation(trimmedQuery);

      if (!resolvedLocation) {
        setManualEntryError('We could not find that location. Try a more specific city or address.');
        return;
      }

      updateManualLocation(toManualLocationData(resolvedLocation));
      setShowManualEntry(false);
      setManualLocationQuery('');
      clearSuggestions();
      announceToScreenReader(`Location selected: ${resolvedLocation.city}`, 'polite');
    } catch (error) {
      console.error('Manual location lookup failed:', error);
      setManualEntryError('We could not update your location right now. Please try again.');
    } finally {
      setIsResolvingManualLocation(false);
    }
  };

  const handleManualSearch = (query: string) => {
    setManualLocationQuery(query);
    setManualEntryError(null);
    if (query.length > 2) {
      searchPlaces(query);
      announceToScreenReader(`Searching for locations matching "${query}"`, 'polite');
    } else {
      clearSuggestions();
    }
  };

  // Handle keyboard navigation in search suggestions
  const handleSearchKeyDown = (event: React.KeyboardEvent) => {
    handleKeyboardNavigation(event, {
      onArrowDown: () => {
        if (suggestions.length > 0) {
          setSelectedSuggestionIndex(prev =>
            prev < suggestions.length - 1 ? prev + 1 : 0
          );
        }
      },
      onArrowUp: () => {
        if (suggestions.length > 0) {
          setSelectedSuggestionIndex(prev =>
            prev > 0 ? prev - 1 : suggestions.length - 1
          );
        }
      },
      onEnter: () => {
        if (selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
          handleManualLocationSelect(suggestions[selectedSuggestionIndex]);
        } else if (manualLocationQuery.trim()) {
          void handleManualLocationSubmit();
        }
      },
      onEscape: () => {
        clearSuggestions();
        setShowManualEntry(false);
        setManualLocationQuery('');
      },
    });
  };

  const getAccuracyIndicator = () => {
    if (!location.accuracy) return null;

    if (location.accuracy <= 100) {
      return <Badge variant="default" className="bg-green-100 text-green-800">High Accuracy</Badge>;
    } else if (location.accuracy <= 1000) {
      return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Medium Accuracy</Badge>;
    } else {
      return <Badge variant="outline" className="bg-red-100 text-red-800">Low Accuracy</Badge>;
    }
  };

  const getSourceIndicator = () => {
    const sourceLabels = {
      gps: { label: 'GPS', icon: MapPin, color: 'bg-green-100 text-green-800' },
      ip: { label: 'IP Location', icon: AlertCircle, color: 'bg-yellow-100 text-yellow-800' },
      manual: { label: 'Manual', icon: Search, color: 'bg-blue-100 text-blue-800' },
    };

    const source = sourceLabels[location.source];
    const Icon = source.icon;

    return (
      <Badge variant="outline" className={source.color}>
        <Icon className="w-3 h-3 mr-1" />
        {source.label}
      </Badge>
    );
  };

  // Initial Idle State (Waiting for user gesture) - Critical for iOS
  if (!loading && !hasCoordinates && !location.error) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <MapPin className="w-5 h-5 text-primary" />
            Find Your Location
          </CardTitle>
          <CardDescription>
            We need to know where you are to show you relevant businesses nearby.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <MapPin className="w-8 h-8 text-primary" />
            </div>
          </div>
          <Button
            onClick={() => detectLocation()}
            className="w-full"
            size="lg"
          >
            <MapPin className="w-4 h-4 mr-2" />
            Use My Current Location
          </Button>
          <Button
            onClick={() => {
              setShowManualEntry(true);
              setTimeout(() => searchInputRef.current?.focus(), 100);
            }}
            variant="outline"
            className="w-full"
          >
            <Search className="w-4 h-4 mr-2" />
            Enter Location Manually
          </Button>

          {showManualEntry && (
            <div className="space-y-3 pt-4 border-t" role="search" aria-label="Manual location entry">
              <div className="relative">
                <label htmlFor={searchInputId} className="sr-only">
                  Enter your city or address
                </label>
                <Input
                  ref={searchInputRef}
                  id={searchInputId}
                  placeholder="Enter your city or address..."
                  value={manualLocationQuery}
                  onChange={(e) => handleManualSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  className="pr-10"
                  aria-describedby={suggestions.length > 0 ? suggestionsId : undefined}
                  aria-expanded={suggestions.length > 0}
                  aria-haspopup="listbox"
                  aria-autocomplete="list"
                  role="combobox"
                />
                {placesLoading && (
                  <Loader2
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 animate-spin"
                    aria-hidden="true"
                  />
                )}
              </div>

              {suggestions.length > 0 && (
                <div
                  ref={suggestionsListRef}
                  id={suggestionsId}
                  className="border rounded-md bg-background max-h-48 overflow-y-auto"
                  role="listbox"
                  aria-label="Location suggestions"
                >
                  {suggestions.map((place, index) => (
                    <button
                      key={index}
                      onClick={() => handleManualLocationSelect(place)}
                      className={`w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b last:border-b-0 ${index === selectedSuggestionIndex ? 'bg-muted' : ''
                        }`}
                      role="option"
                      aria-selected={index === selectedSuggestionIndex}
                      aria-label={`Select ${place.name}${place.formatted_address ? `, ${place.formatted_address}` : ''}`}
                    >
                      <div className="font-medium">{place.name}</div>
                      {place.formatted_address && (
                        <div className="text-sm text-muted-foreground">
                          {place.formatted_address}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {manualEntryError && (
                <p className="text-sm text-destructive">{manualEntryError}</p>
              )}

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => void handleManualLocationSubmit()}
                disabled={isResolvingManualLocation || !manualLocationQuery.trim()}
              >
                {isResolvingManualLocation ? 'Using location...' : 'Use this location'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="w-full max-w-md mx-auto" role="status" aria-live="polite">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
            Detecting Your Location
          </CardTitle>
          <CardDescription>
            We're finding your location to show you nearby businesses
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-center" aria-hidden="true">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <MapPin className="w-8 h-8 text-primary animate-pulse" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground text-center" id={locationStatusId}>
            This may take a few seconds...
          </p>
        </CardContent>
      </Card>
    );
  }

  if (location.error) {
    return (
      <Card className="w-full max-w-md mx-auto" role="alert">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5" aria-hidden="true" />
            Location Detection Failed
          </CardTitle>
          <CardDescription>
            We couldn't detect your location automatically
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert role="alert" aria-live="assertive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>
              {location.error}
              {lastError && !lastError.retryable && (
                <div className="mt-2 text-sm">
                  This error cannot be automatically resolved. Please try manual entry.
                </div>
              )}
            </AlertDescription>
          </Alert>

          {retryCount > 0 && (
            <div className="text-sm text-muted-foreground text-center">
              Attempt {retryCount} of {maxRetries}
            </div>
          )}

          <div className="space-y-2" role="group" aria-label="Location detection options">
            {canRetry && (
              <Button
                onClick={handleRetryLocation}
                className="w-full"
                variant="outline"
                disabled={isRetrying}
                aria-label={`Retry automatic location detection (${maxRetries - retryCount} attempts remaining)`}
              >
                {isRetrying ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
                )}
                {isRetrying ? 'Retrying...' : `Try Again (${maxRetries - retryCount} left)`}
              </Button>
            )}

            <Button
              onClick={() => {
                setShowManualEntry(true);
                setTimeout(() => searchInputRef.current?.focus(), 100);
              }}
              className="w-full"
              aria-label="Enter your location manually"
            >
              <Search className="w-4 h-4 mr-2" aria-hidden="true" />
              Enter Location Manually
            </Button>
          </div>

          {showManualEntry && (
            <div className="space-y-3 pt-4 border-t" role="search" aria-label="Manual location entry">
              <div className="relative">
                <label htmlFor={searchInputId} className="sr-only">
                  Enter your city or address
                </label>
                <Input
                  ref={searchInputRef}
                  id={searchInputId}
                  placeholder="Enter your city or address..."
                  value={manualLocationQuery}
                  onChange={(e) => handleManualSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  className="pr-10"
                  aria-describedby={suggestions.length > 0 ? suggestionsId : undefined}
                  aria-expanded={suggestions.length > 0}
                  aria-haspopup="listbox"
                  aria-autocomplete="list"
                  role="combobox"
                />
                {placesLoading && (
                  <Loader2
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 animate-spin"
                    aria-hidden="true"
                  />
                )}
              </div>

              {suggestions.length > 0 && (
                <div
                  ref={suggestionsListRef}
                  id={suggestionsId}
                  className="border rounded-md bg-background max-h-48 overflow-y-auto"
                  role="listbox"
                  aria-label="Location suggestions"
                >
                  {suggestions.map((place, index) => (
                    <button
                      key={index}
                      onClick={() => handleManualLocationSelect(place)}
                      className={`w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b last:border-b-0 ${index === selectedSuggestionIndex ? 'bg-muted' : ''
                        }`}
                      role="option"
                      aria-selected={index === selectedSuggestionIndex}
                      aria-label={`Select ${place.name}${place.formatted_address ? `, ${place.formatted_address}` : ''}`}
                    >
                      <div className="font-medium">{place.name}</div>
                      {place.formatted_address && (
                        <div className="text-sm text-muted-foreground">
                          {place.formatted_address}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {manualEntryError && (
                <p className="text-sm text-destructive">{manualEntryError}</p>
              )}

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => void handleManualLocationSubmit()}
                disabled={isResolvingManualLocation || !manualLocationQuery.trim()}
              >
                {isResolvingManualLocation ? 'Using location...' : 'Use this location'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto" role="region" aria-label="Location confirmation">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center gap-2">
          <MapPin className="w-5 h-5 text-primary" aria-hidden="true" />
          Location Detected
        </CardTitle>
        <CardDescription>
          Is this your current location?
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center space-y-2" role="region" aria-label="Detected location details">
          <div className="text-lg font-medium" id="detected-location">
            {location.city || location.address || 'Your Location'}
          </div>
          {location.address && location.address !== location.city && (
            <div className="text-sm text-muted-foreground" id="detected-address">
              {location.address}
            </div>
          )}
          {!location.city && !location.address && hasCoordinates && (
            <div className="text-sm text-muted-foreground" id="detected-address">
              Coordinates: {location.latitude?.toFixed(4)}, {location.longitude?.toFixed(4)}
            </div>
          )}
        </div>

        <div className="flex justify-center gap-2" role="group" aria-label="Location metadata">
          {getSourceIndicator()}
          {getAccuracyIndicator()}
        </div>

        {location.accuracy && (
          <div className="text-xs text-muted-foreground text-center" aria-label={`Location accuracy: plus or minus ${Math.round(location.accuracy)} meters`}>
            Accuracy: ±{Math.round(location.accuracy)}m
          </div>
        )}

        <div className="space-y-2" role="group" aria-label="Location confirmation options">
          {!location.userConfirmed ? (
            <>
              <Button
                onClick={handleConfirmLocation}
                className="w-full"
                aria-describedby="detected-location detected-address"
              >
                <CheckCircle className="w-4 h-4 mr-2" aria-hidden="true" />
                Yes, This is Correct
              </Button>
              <Button
                onClick={() => {
                  setShowManualEntry(true);
                  setTimeout(() => searchInputRef.current?.focus(), 100);
                }}
                variant="outline"
                className="w-full"
                aria-label="Use a different location instead"
              >
                <Search className="w-4 h-4 mr-2" aria-hidden="true" />
                Use Different Location
              </Button>
            </>
          ) : (
            <div
              className="flex items-center justify-center gap-2 text-green-600 font-medium"
              role="status"
              aria-live="polite"
            >
              <CheckCircle className="w-4 h-4" aria-hidden="true" />
              Location Confirmed
            </div>
          )}
        </div>

        {showManualEntry && (
          <div className="space-y-3 pt-4 border-t">
            <div className="relative">
              <Input
                placeholder="Enter your city or address..."
                value={manualLocationQuery}
                onChange={(e) => handleManualSearch(e.target.value)}
                className="pr-10"
              />
              {placesLoading && (
                <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 animate-spin" />
              )}
            </div>

            {suggestions.length > 0 && (
              <div className="border rounded-md bg-background max-h-48 overflow-y-auto">
                {suggestions.map((place, index) => (
                  <button
                    key={index}
                    onClick={() => handleManualLocationSelect(place)}
                    className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b last:border-b-0"
                  >
                    <div className="font-medium">{place.name}</div>
                    {place.formatted_address && (
                      <div className="text-sm text-muted-foreground">
                        {place.formatted_address}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {manualEntryError && (
              <p className="text-sm text-destructive">{manualEntryError}</p>
            )}

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => void handleManualLocationSubmit()}
              disabled={isResolvingManualLocation || !manualLocationQuery.trim()}
            >
              {isResolvingManualLocation ? 'Using location...' : 'Use this location'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
