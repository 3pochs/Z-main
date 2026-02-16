import React, { useState, useCallback, useMemo } from 'react';
import { Search, MapPin, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePlacesAutocomplete } from '@/hooks/usePlacesAutocomplete';
import { useLocation } from '@/contexts/LocationProvider';
import { cn } from '@/lib/utils';

interface PlacesSearchBarProps {
  placeholder?: string;
  onPlaceSelect?: (place: google.maps.places.PlaceResult) => void;
  onTextChange?: (text: string) => void;
  value?: string;
  className?: string;
  inputClassName?: string;
  showIcon?: boolean;
  showLocationIndicator?: boolean;
  variant?: 'default' | 'compact';
}

export const PlacesSearchBar: React.FC<PlacesSearchBarProps> = ({
  placeholder = "Search places...",
  onPlaceSelect,
  onTextChange,
  value = "",
  className,
  inputClassName,
  showIcon = true,
  showLocationIndicator = false,
  variant = 'default'
}) => {
  const [searchQuery, setSearchQuery] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const { location } = useLocation();

  // Memoize places options to prevent infinite loops
  const placesOptions = useMemo(() => ({
    location: location.latitude && location.longitude ? {
      lat: location.latitude,
      lng: location.longitude
    } : undefined,
    radius: 5000 // 5km radius for local suggestions
  }), [location.latitude, location.longitude]);

  const {
    suggestions,
    loading: placesLoading,
    error: placesError,
    searchPlaces,
    clearSuggestions
  } = usePlacesAutocomplete(placesOptions);

  // Sync internal state with value prop
  React.useEffect(() => {
    setSearchQuery(value);
  }, [value]);

  // Handle search query changes
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchQuery(newValue);

    // Trigger external handler
    onTextChange?.(newValue);

    // Trigger autocomplete search
    if (newValue && newValue.length >= 2) {
      searchPlaces(newValue);
    } else {
      clearSuggestions();
    }
  }, [searchPlaces, clearSuggestions, onTextChange]);

  // Handle suggestion selection
  const handleSuggestionClick = useCallback((suggestion: google.maps.places.PlaceResult) => {
    setSearchQuery(suggestion.name || suggestion.formatted_address || '');
    clearSuggestions();
    setIsFocused(false);
    onPlaceSelect?.(suggestion);
  }, [clearSuggestions, onPlaceSelect]);

  // Handle focus/blur
  const handleFocus = () => setIsFocused(true);
  const handleBlur = () => {
    // Delay hiding suggestions to allow for clicks
    setTimeout(() => setIsFocused(false), 200);
  };

  const showSuggestions = isFocused && suggestions.length > 0;
  const showLoading = placesLoading && searchQuery.length >= 2;
  const showError = placesError && searchQuery.length >= 2;

  return (
    <div className={cn("relative w-full", className)}>
      <div className="relative">
        {showIcon && (
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        )}
        <Input
          placeholder={placeholder}
          value={searchQuery}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className={cn(
            "rounded-xl border-input bg-background transition-all focus:bg-background focus:ring-2 focus:ring-primary/20",
            showIcon && "pl-10",
            variant === 'compact' && "h-9",
            inputClassName
          )}
        />
        {showLoading && (
          <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Location indicator */}
      {showLocationIndicator && location.city && (
        <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground ml-1">
          <MapPin className="h-3 w-3" />
          <span>Searching near {location.city}</span>
        </div>
      )}

      {/* Unified Dropdown Container */}
      {(showSuggestions || showLoading || showError || (isFocused && searchQuery.length >= 3 && !placesLoading && !placesError && suggestions.length === 0)) && (
        <Card className="absolute z-[100] w-full mt-2 shadow-xl rounded-xl border-border/50 bg-popover/95 backdrop-blur-md overflow-hidden">
          <CardContent className="p-0">
            {/* Loading State */}
            {showLoading && !showSuggestions && (
              <div className="p-4 text-center">
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching for places...
                </div>
              </div>
            )}

            {/* Error State */}
            {showError && !showSuggestions && !showLoading && (
              <div className="p-4 text-center">
                <div className="text-sm text-destructive">
                  {placesError.message}
                </div>
              </div>
            )}

            {/* No Results State */}
            {isFocused && searchQuery.length >= 3 && !placesLoading && !placesError && suggestions.length === 0 && (
              <div className="p-4 text-center">
                <div className="text-sm text-muted-foreground">
                  No places found. Try a different search term.
                </div>
              </div>
            )}

            {/* Suggestions List */}
            {showSuggestions && (
              <div className="max-h-60 overflow-y-auto p-2">
                {suggestions.map((suggestion, index) => (
                  <div
                    key={suggestion.place_id || index}
                    className="p-3 hover:bg-accent/50 rounded-lg cursor-pointer transition-colors"
                    onClick={() => handleSuggestionClick(suggestion)}
                  >
                    <div className="flex items-start gap-3">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {suggestion.name || 'Unknown Business'}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 truncate">
                          {suggestion.formatted_address || suggestion.vicinity || 'No address available'}
                        </div>
                        {suggestion.types && suggestion.types[0] && (
                          <Badge variant="secondary" className="mt-1 text-xs">
                            {suggestion.types[0].replace(/_/g, ' ')}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
