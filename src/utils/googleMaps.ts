import { LocationData, LocationSource } from '@/types/onboarding';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;

export const GOOGLE_MAPS_AUTH_FAILURE_EVENT = 'welcome-winks:google-maps-auth-failure';

interface GeocodeAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GeocodeResultLike {
  formatted_address?: string;
  geometry?: {
    location?: {
      lat: () => number;
      lng: () => number;
    };
  };
  address_components?: GeocodeAddressComponent[];
}

interface RestGeocodeResponse {
  results?: Array<{
    formatted_address?: string;
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
    address_components?: GeocodeAddressComponent[];
  }>;
}

export interface ResolvedLocation {
  latitude: number;
  longitude: number;
  city: string;
  address: string;
  source: LocationSource;
}

const buildLocationLabel = (
  addressComponents: GeocodeAddressComponent[] | undefined,
  formattedAddress: string | undefined,
  fallbackQuery: string
): string => {
  if (!addressComponents?.length) {
    return formattedAddress || fallbackQuery;
  }

  const locality =
    addressComponents.find(component => component.types.includes('locality'))?.long_name ||
    addressComponents.find(component => component.types.includes('postal_town'))?.long_name ||
    addressComponents.find(component => component.types.includes('administrative_area_level_2'))?.long_name;

  const region =
    addressComponents.find(component => component.types.includes('administrative_area_level_1'))?.short_name ||
    addressComponents.find(component => component.types.includes('country'))?.short_name;

  if (locality && region) {
    return `${locality}, ${region}`;
  }

  return locality || formattedAddress || fallbackQuery;
};

const normalizeGeocodeResult = (
  result: GeocodeResultLike | undefined,
  fallbackQuery: string
): ResolvedLocation | null => {
  const lat = result?.geometry?.location?.lat();
  const lng = result?.geometry?.location?.lng();

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return null;
  }

  const address = result?.formatted_address || fallbackQuery;
  const city = buildLocationLabel(result?.address_components, address, fallbackQuery);

  return {
    latitude: lat,
    longitude: lng,
    city,
    address,
    source: 'manual',
  };
};

export const isGoogleMapsReady = (): boolean =>
  typeof window !== 'undefined' && typeof window.google?.maps?.Map === 'function';

export const isGooglePlacesReady = (): boolean =>
  isGoogleMapsReady() &&
  typeof window.google?.maps?.places?.AutocompleteService === 'function' &&
  typeof window.google?.maps?.places?.PlacesService === 'function';

export const geocodeManualLocation = async (query: string): Promise<ResolvedLocation | null> => {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return null;
  }

  if (isGoogleMapsReady()) {
    try {
      const geocoder = new google.maps.Geocoder();
      const response = await geocoder.geocode({ address: trimmedQuery });
      const jsResult = normalizeGeocodeResult(response.results?.[0], trimmedQuery);
      if (jsResult) {
        return jsResult;
      }
    } catch (error) {
      console.warn('Google Maps geocoder lookup failed, trying REST fallback.', error);
    }
  }

  if (!GOOGLE_MAPS_API_KEY) {
    return null;
  }

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(trimmedQuery)}&key=${GOOGLE_MAPS_API_KEY}`
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as RestGeocodeResponse;
    const restResult = data.results?.[0];

    if (!restResult?.geometry?.location) {
      return null;
    }

    return {
      latitude: restResult.geometry.location.lat ?? 0,
      longitude: restResult.geometry.location.lng ?? 0,
      city: buildLocationLabel(restResult.address_components, restResult.formatted_address, trimmedQuery),
      address: restResult.formatted_address || trimmedQuery,
      source: 'manual',
    };
  } catch (error) {
    console.warn('REST geocoding lookup failed.', error);
    return null;
  }
};

export const toManualLocationData = (resolvedLocation: ResolvedLocation): Partial<LocationData> => ({
  latitude: resolvedLocation.latitude,
  longitude: resolvedLocation.longitude,
  city: resolvedLocation.city,
  address: resolvedLocation.address,
  source: resolvedLocation.source,
  accuracy: null,
  userConfirmed: true,
  error: null,
});
