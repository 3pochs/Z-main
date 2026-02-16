import React, { useState, useEffect, useCallback } from 'react';
import { GoogleMap, Marker, InfoWindow } from '@react-google-maps/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreIndicator, getWelcomingLevel } from '@/components/business/ScoreIndicator';
import { useTheme } from 'next-themes';

const DARK_MODE_STYLES = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#263c3f" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6b9a76" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#38414e" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#212a37" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9ca5b3" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#746855" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1f2835" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#f3d19c" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#2f3948" }],
  },
  {
    featureType: "transit.station",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#17263c" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#515c6d" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#17263c" }],
  },
];

const containerStyle = {
  width: '100%',
  height: '100%',
};

interface InteractiveMapProps {
  height?: string;
  center: { lat: number; lng: number };
  places: google.maps.places.PlaceResult[];
  onPlacesFetched: (places: google.maps.places.PlaceResult[]) => void;
  onBusinessSelect?: (business: any) => void;
  // Enhanced with score data
  placeScores?: Record<string, number>; // place_id -> score mapping
}

const InteractiveMap: React.FC<InteractiveMapProps> = ({
  height = '400px',
  center,
  places,
  onPlacesFetched,
  onBusinessSelect,
  placeScores = {},
}) => {
  const { theme, resolvedTheme } = useTheme(); // Use theme hook with resolvedTheme
  const [selectedBusiness, setSelectedBusiness] = useState<google.maps.places.PlaceResult | null>(null);
  const [hoveredBusiness, setHoveredBusiness] = useState<google.maps.places.PlaceResult | null>(null);
  const [businessPhotos, setBusinessPhotos] = useState<string[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const mapRef = React.useRef<google.maps.Map | null>(null);

  // Memoize options to prevent re-renders
  // Memoize options to prevent re-renders
  const mapOptions = React.useMemo(() => ({
    disableDefaultUI: true,
    zoomControl: true,
    // mapId removed to allow JSON styling
    styles: (theme === 'dark' || resolvedTheme === 'dark') ? DARK_MODE_STYLES : [],
  }), [theme, resolvedTheme]);

  // Fetch Google Maps photos for a place
  const fetchPlacePhotos = useCallback(async (placeId: string) => {
    if (!mapRef.current || !window.google) return;

    setLoadingPhotos(true);
    setBusinessPhotos([]);

    try {
      const service = new google.maps.places.PlacesService(mapRef.current);
      const request: google.maps.places.PlaceDetailsRequest = {
        placeId: placeId,
        fields: ['photos']
      };

      service.getDetails(request, (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && place?.photos) {
          // Get up to 3 photos
          const photoUrls = place.photos.slice(0, 3).map(photo =>
            photo.getUrl({ maxWidth: 300, maxHeight: 200 })
          );
          setBusinessPhotos(photoUrls);
        }
        setLoadingPhotos(false);
      });
    } catch (error) {
      console.error('Error fetching place photos:', error);
      setLoadingPhotos(false);
    }
  }, []);

  // Handle marker click with photo loading
  const handleMarkerClick = useCallback((place: google.maps.places.PlaceResult) => {
    setSelectedBusiness(place);
    if (place.place_id) {
      fetchPlacePhotos(place.place_id);
    }
  }, [fetchPlacePhotos]);

  // Create custom marker icon based on welcoming score - mobile optimized
  const createScoreMarkerIcon = React.useMemo(() => {
    const iconCache = new Map<string, google.maps.Icon>();

    return (score: number | null): google.maps.Icon => {
      const level = getWelcomingLevel(score);
      const cacheKey = `${level}-${score}`;

      // Return cached icon if available
      if (iconCache.has(cacheKey)) {
        return iconCache.get(cacheKey)!;
      }

      let color: string;
      let symbol: string;

      switch (level) {
        case 'very-welcoming':
          color = '#22c55e'; // green
          symbol = '😊';
          break;
        case 'moderately-welcoming':
          color = '#eab308'; // yellow
          symbol = '😐';
          break;
        case 'not-welcoming':
          color = '#ef4444'; // red
          symbol = '😞';
          break;
        case 'unrated':
        default:
          color = '#6b7280'; // gray
          symbol = '?';
          break;
      }

      // Smaller markers for mobile
      const isMobile = window.innerWidth < 768;
      const size = isMobile ? 24 : 32;
      const height = isMobile ? 30 : 40;

      // Create SVG marker with score indicator
      const svg = `
        <svg width="${size}" height="${height}" viewBox="0 0 ${size} ${height}" xmlns="http://www.w3.org/2000/svg">
          <path d="M${size / 2} 0C${size * 0.224} 0 0 ${size * 0.224} 0 ${size / 2}c0 ${size / 2} ${size / 2} ${size * 0.75} ${size / 2} ${size * 0.75}s${size / 2}-${size * 0.25} ${size / 2}-${size * 0.75}C${size} ${size * 0.224} ${size * 0.776} 0 ${size / 2} 0z" fill="${color}"/>
          <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.3}" fill="white"/>
          <text x="${size / 2}" y="${size * 0.625}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${isMobile ? '8' : '12'}" font-weight="bold" fill="${color}">${symbol}</text>
        </svg>
      `;

      const iconUrl = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

      const icon = {
        url: iconUrl,
        scaledSize: new google.maps.Size(size, height),
        anchor: new google.maps.Point(size / 2, height),
      };

      // Cache the icon
      iconCache.set(cacheKey, icon);

      return icon;
    };
  }, []);

  const onLoad = useCallback(function callback(map: google.maps.Map) {
    mapRef.current = map;
  }, []);

  // Map component now only displays places, doesn't fetch them
  // Places are fetched by the parent component using placesService

  const onUnmount = useCallback(function callback() {
    mapRef.current = null;
  }, []);

  // Ensure the Map constructor is actually available before rendering (prevents crash on restricted keys)
  const isMapsValid = React.useMemo(() => {
    return typeof window !== 'undefined' &&
      window.google?.maps &&
      typeof window.google.maps.Map === 'function';
  }, []);

  if (!isMapsValid) {
    // If google.maps exists but Map is strictly not a function, it usually means the Key is restricted/blocked
    if (typeof window !== 'undefined' && window.google?.maps) {
      return (
        <div className="w-full bg-muted flex flex-col items-center justify-center text-center p-4 border border-destructive/20 rounded-md" style={{ height }}>
          <p className="font-bold text-destructive mb-1">Map Configuration Error</p>
          <p className="text-sm text-muted-foreground mb-4 max-w-[250px]">
            The Google Maps API blocked this request. Check API Key restrictions.
          </p>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      );
    }
    return <Skeleton className="w-full" style={{ height }} />;
  }

  return (
    <div className="relative w-full" style={{ height }}>
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={13}
        onLoad={onLoad}
        onUnmount={onUnmount}
        options={mapOptions}
      >
        {places && places.map((place) => {
          const score = place.place_id ? placeScores[place.place_id] : null;

          return place.geometry?.location && (
            <Marker
              key={place.place_id}
              position={place.geometry.location}
              icon={createScoreMarkerIcon(score)}
              onClick={() => handleMarkerClick(place)}
              onMouseOver={() => setHoveredBusiness(place)}
              onMouseOut={() => setHoveredBusiness(null)}
              title={`${place.name}${score !== null ? ` - Score: ${score}` : ' - Not yet rated'}`}
            />
          );
        })}

        {selectedBusiness && selectedBusiness.geometry?.location && (
          <InfoWindow
            position={selectedBusiness.geometry.location}
            onCloseClick={() => {
              setSelectedBusiness(null);
              setBusinessPhotos([]);
            }}
          >
            <div className="font-sans p-3 min-w-[250px] max-w-[350px]">
              {/* Photos Section */}
              {(businessPhotos.length > 0 || loadingPhotos) && (
                <div className="mb-3">
                  {loadingPhotos ? (
                    <div className="flex gap-2">
                      <Skeleton className="w-20 h-16 rounded" />
                      <Skeleton className="w-20 h-16 rounded" />
                      <Skeleton className="w-20 h-16 rounded" />
                    </div>
                  ) : (
                    <div className="flex gap-2 overflow-x-auto">
                      {businessPhotos.map((photoUrl, index) => (
                        <img
                          key={index}
                          src={photoUrl}
                          alt={`${selectedBusiness.name} photo ${index + 1}`}
                          className="w-20 h-16 object-cover rounded flex-shrink-0"
                          loading="lazy"
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-start gap-3 mb-2">
                <ScoreIndicator
                  score={selectedBusiness.place_id ? placeScores[selectedBusiness.place_id] || null : null}
                  size="medium"
                  variant="full"
                  showLabel={false}
                />
                <div className="flex-1">
                  <h3 className="font-semibold text-base">{selectedBusiness.name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedBusiness.vicinity}</p>
                  {selectedBusiness.rating && (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-yellow-500">★</span>
                      <span className="text-xs text-muted-foreground">
                        {selectedBusiness.rating} ({selectedBusiness.user_ratings_total} reviews)
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {selectedBusiness.place_id && placeScores[selectedBusiness.place_id] !== undefined ? (
                <div className="mb-3">
                  <p className="text-xs text-muted-foreground">
                    Welcoming Score: <span className="font-medium text-primary">{placeScores[selectedBusiness.place_id]}</span>
                  </p>
                </div>
              ) : (
                <div className="mb-3">
                  <p className="text-xs text-muted-foreground">Not yet rated</p>
                </div>
              )}

              <Button
                size="sm"
                variant="default"
                className="w-full"
                onClick={() => onBusinessSelect?.(selectedBusiness)}
              >
                View Details
              </Button>
            </div>
          </InfoWindow>
        )}

        {/* Compact hover tooltip */}
        {hoveredBusiness && hoveredBusiness.geometry?.location && hoveredBusiness !== selectedBusiness && (
          <InfoWindow
            position={hoveredBusiness.geometry.location}
            options={{
              disableAutoPan: true,
              pixelOffset: new google.maps.Size(0, -40),
            }}
          >
            <div
              className="font-sans text-center min-w-0"
              style={{
                padding: '4px 6px',
                margin: 0,
                lineHeight: '1.2',
                fontSize: '11px'
              }}
            >
              <p className="font-medium mb-0" style={{ margin: 0, marginBottom: '2px' }}>
                {hoveredBusiness.name}
              </p>
              {hoveredBusiness.place_id && placeScores[hoveredBusiness.place_id] !== undefined ? (
                <p className="text-muted-foreground" style={{ margin: 0, opacity: 0.7 }}>
                  Score: {placeScores[hoveredBusiness.place_id]}
                </p>
              ) : (
                <p className="text-muted-foreground" style={{ margin: 0, opacity: 0.7 }}>
                  Not yet rated
                </p>
              )}
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
    </div>
  );
};

export default InteractiveMap;