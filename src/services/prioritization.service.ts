import { DiningPreferences, DEFAULT_CATEGORY_WEIGHTS, IMPORTANCE_MULTIPLIERS, DEFAULT_DINING_PREFERENCES } from '../types/preferences';
import { BusinessAttributes, RelevanceScore } from '../types/businessAttributes';

/**
 * Calculate cuisine match score (0-100)
 * 100: Perfect match with preferred cuisines
 * 75-99: Strong match (multiple matches)
 * 50-74: Partial match (some overlap)
 * 25-49: Weak match (related cuisines)
 * 0: No match or in disliked list
 */
export function calculateCuisineScore(
  businessCuisines: string[],
  preferences: DiningPreferences['cuisines'] | undefined
): number {
  const preferred = preferences?.preferred || [];
  const disliked = preferences?.disliked || [];

  // If business is in disliked list, score is 0
  const hasDisliked = businessCuisines.some(cuisine =>
    disliked.some(d =>
      cuisine.toLowerCase().includes(d.toLowerCase()) ||
      d.toLowerCase().includes(cuisine.toLowerCase())
    )
  );

  if (hasDisliked) {
    return 0;
  }

  // If no preferences set, return neutral score
  if (preferred.length === 0) {
    return 75; // Higher neutral score to not penalize when no preference
  }

  // If business has no cuisine data, return lower neutral
  if (businessCuisines.length === 0) {
    return 50;
  }

  // Calculate exact matches
  const exactMatches = businessCuisines.filter(cuisine =>
    preferred.some(p =>
      cuisine.toLowerCase().includes(p.toLowerCase()) ||
      p.toLowerCase().includes(cuisine.toLowerCase())
    )
  ).length;

  if (exactMatches > 0) {
    // Has exact matches: scale from 75-100 based on match count
    const matchRatio = Math.min(exactMatches / preferred.length, 1);
    return 75 + (matchRatio * 25);
  }

  // No exact matches - check for related cuisines (e.g., "asian" matches "japanese", "chinese")
  const relatedCuisineGroups: Record<string, string[]> = {
    'asian': ['japanese', 'chinese', 'thai', 'vietnamese', 'korean', 'indian'],
    'european': ['italian', 'french', 'spanish', 'greek', 'german'],
    'latin': ['mexican', 'spanish', 'cuban', 'brazilian', 'peruvian'],
    'mediterranean': ['greek', 'turkish', 'lebanese', 'moroccan', 'italian'],
  };

  let hasRelatedMatch = false;
  for (const [group, cuisines] of Object.entries(relatedCuisineGroups)) {
    const preferredInGroup = preferred.some(p =>
      cuisines.some(c => p.toLowerCase().includes(c) || c.includes(p.toLowerCase()))
    );
    const businessInGroup = businessCuisines.some(b =>
      cuisines.some(c => b.toLowerCase().includes(c) || c.includes(b.toLowerCase()))
    );

    if (preferredInGroup && businessInGroup) {
      hasRelatedMatch = true;
      break;
    }
  }

  if (hasRelatedMatch) {
    return 50; // Related cuisine match
  }

  // No match at all
  return 25; // Low score but not zero (might still be good based on other factors)
}

/**
 * Calculate price range match score (0-100)
 * 100: Within preferred range
 * 50: One level outside range
 * 0: More than one level outside range
 */
export function calculatePriceScore(
  businessPriceLevel: number | null,
  preferences: DiningPreferences['priceRange'] | undefined
): number {
  // If no price data available, return neutral score
  if (businessPriceLevel === null || !preferences) {
    return 50;
  }

  const min = preferences.min ?? 1;
  const max = preferences.max ?? 4;

  // Within range: 100
  if (businessPriceLevel >= min && businessPriceLevel <= max) {
    return 100;
  }

  // One level below min
  if (businessPriceLevel === min - 1) {
    return 50;
  }

  // One level above max
  if (businessPriceLevel === max + 1) {
    return 50;
  }

  // More than one level outside range
  return 0;
}

/**
 * Calculate dietary restrictions match score (0-100)
 * 100: All dietary restrictions met
 * Proportional: Percentage of restrictions met
 * 0: No dietary options available
 */
export function calculateDietaryScore(
  businessDietaryOptions: string[],
  preferences: DiningPreferences['dietary'] | undefined
): number {
  const restrictions = preferences?.restrictions || [];

  // If no dietary restrictions specified, return perfect score
  if (restrictions.length === 0) {
    return 100;
  }

  // If no dietary options data available, return neutral score
  if (businessDietaryOptions.length === 0) {
    return 50;
  }

  // Calculate how many restrictions are met
  const metRestrictions = restrictions.filter(restriction =>
    businessDietaryOptions.some(option =>
      option.toLowerCase().includes(restriction.toLowerCase()) ||
      restriction.toLowerCase().includes(option.toLowerCase())
    )
  ).length;

  // Return proportional score
  return (metRestrictions / restrictions.length) * 100;
}

/**
 * Calculate ambiance match score (0-100)
 * 100: Matches preferred ambiance
 * 50: Neutral (no ambiance data)
 * 0: No match
 */
export function calculateAmbianceScore(
  businessAmbianceTags: string[],
  preferences: DiningPreferences['ambiance'] | undefined
): number {
  const preferred = preferences?.preferred || [];

  // If no ambiance preferences set, return perfect score
  if (preferred.length === 0) {
    return 100;
  }

  // If no ambiance data available, return neutral score
  if (businessAmbianceTags.length === 0) {
    return 50;
  }

  // Check for matches
  const hasMatch = businessAmbianceTags.some(tag =>
    preferred.some(p =>
      tag.toLowerCase().includes(p.toLowerCase()) ||
      p.toLowerCase().includes(tag.toLowerCase())
    )
  );

  return hasMatch ? 100 : 0;
}

/**
 * Calculate distance score (0-100)
 * 100: Within 0.5 miles
 * 75: Within 1 mile
 * 50: Within 2 miles
 * 25: Within max distance
 * 0: Beyond max distance
 */
export function calculateDistanceScore(
  distanceInMiles: number | undefined,
  preferences: DiningPreferences['distance'] | undefined
): number {
  // If no distance data available, return neutral score
  if (distanceInMiles === undefined || !preferences) {
    return 50;
  }

  const maxDistance = preferences.maxDistance ?? 10;

  // Beyond max distance
  if (distanceInMiles > maxDistance) {
    return 0;
  }

  // Within 0.5 miles
  if (distanceInMiles <= 0.5) {
    return 100;
  }

  // Within 1 mile
  if (distanceInMiles <= 1) {
    return 75;
  }

  // Within 2 miles
  if (distanceInMiles <= 2) {
    return 50;
  }

  // Within max distance
  return 25;
}

/**
 * Calculate blended rating score (0-100)
 * Blends Google rating (0-5) and Winks score (0-100) into a unified quality score
 * Prioritizes community score, then Google rating
 */
export function calculateRatingScore(
  googleRating: number | undefined,
  winksScore: number | undefined,
  preferences: DiningPreferences | undefined
): number {
  const minRating = preferences?.rating?.minRating ?? 0;
  const politicalView = preferences?.politicalView ?? 'none';

  let effectiveMinWinksScore = preferences?.rating?.minWinksScore ?? null;
  if (politicalView === 'conservative') {
    effectiveMinWinksScore = 30; // Prioritize mid to lower WW ratings
  } else if (politicalView === 'liberal') {
    effectiveMinWinksScore = 70; // Prioritize mid to higher WW ratings
  }

  // Convert Google rating (0-5) to 0-100 scale
  const googleScore = googleRating !== undefined ? (googleRating / 5) * 100 : null;

  // Normalize Winks score (already 0-100)
  const winksNormalized = winksScore !== undefined ? winksScore : null;

  // Blend the scores - prioritize community score (70%), then Google (30%)
  let blendedScore: number;

  if (winksNormalized !== null && googleScore !== null) {
    // Both available: weighted average (community 70%, Google 30%)
    blendedScore = (winksNormalized * 0.7) + (googleScore * 0.3);
  } else if (winksNormalized !== null) {
    // Only community score available
    blendedScore = winksNormalized;
  } else if (googleScore !== null) {
    // Only Google rating available
    blendedScore = googleScore;
  } else {
    // No ratings available - return neutral score
    return 50;
  }

  // Check if meets minimum thresholds
  const meetsGoogleThreshold = googleRating === undefined || googleRating >= minRating;
  const meetsWinksThreshold = effectiveMinWinksScore === null || winksScore === undefined || winksScore >= effectiveMinWinksScore;

  // If below thresholds, penalize the score
  if (!meetsGoogleThreshold || !meetsWinksThreshold) {
    blendedScore *= 0.5; // 50% penalty for not meeting thresholds
  }

  return Math.min(100, Math.max(0, blendedScore));
}

/**
 * Calculate features match score (0-100)
 * 100: All preferred features available
 * Proportional: Percentage of features available
 * 0: No preferred features
 */
export function calculateFeaturesScore(
  businessFeatures: string[],
  preferences: DiningPreferences['features'] | undefined
): number {
  const preferred = preferences?.preferred || [];

  // If no feature preferences set, return perfect score
  if (preferred.length === 0) {
    return 100;
  }

  // If no features data available, return neutral score
  if (businessFeatures.length === 0) {
    return 50;
  }

  // Calculate how many preferred features are available
  const availableFeatures = preferred.filter(feature =>
    businessFeatures.some(businessFeature =>
      businessFeature.toLowerCase().includes(feature.toLowerCase()) ||
      feature.toLowerCase().includes(businessFeature.toLowerCase())
    )
  ).length;

  // Return proportional score
  return (availableFeatures / preferred.length) * 100;
}

export const CHAIN_NAMES = [
  'dunkin', 'starbucks', 'mcdonald', 'subway', 'burger king', 'wendy',
  'taco bell', 'kfc', 'pizza hut', 'domino', 'papa john', 'chick-fil-a',
  'chipotle', 'panera', 'panda express', 'sonic', 'dairy queen'
];

/**
 * Calculate time relevance score (0-100)
 * Prioritizes businesses based on current time of day
 */
export function calculateTimeScore(types: string[]): number {
  const hour = new Date().getHours();
  const lowerTypes = types.map(t => t.toLowerCase());

  // Morning (5AM - 11AM)
  if (hour >= 5 && hour < 11) {
    if (lowerTypes.some(t => ['bakery', 'cafe', 'coffee_shop', 'breakfast_restaurant'].includes(t))) return 100;
    if (lowerTypes.some(t => ['bar', 'night_club', 'pub'].includes(t))) return 0;
    return 60; // Neutral for others
  }

  // Lunch (11AM - 4PM)
  if (hour >= 11 && hour < 16) {
    if (lowerTypes.some(t => ['sandwich_shop', 'meal_takeaway', 'restaurant'].includes(t))) return 100;
    if (lowerTypes.some(t => ['bar', 'night_club'].includes(t))) return 20;
    return 80;
  }

  // Dinner (4PM - 10PM)
  if (hour >= 16 && hour < 22) {
    if (lowerTypes.some(t => ['restaurant', 'fine_dining_restaurant', 'steak_house', 'bar'].includes(t))) return 100;
    if (lowerTypes.some(t => ['cafe', 'bakery'].includes(t))) return 40;
    return 80;
  }

  // Late Night (10PM - 5AM)
  if (hour >= 22 || hour < 5) {
    if (lowerTypes.some(t => ['bar', 'night_club', 'casino', 'meal_delivery'].includes(t))) return 100;
    if (lowerTypes.some(t => ['bakery', 'cafe', 'coffee_shop'].includes(t))) return 10; // Closed mostly
    return 50;
  }

  return 70; // Default fallback
}

/**
 * Calculate Niche/Local score (0-100)
 * Penalizes big chains and mass-market places. Boosts local gems.
 */
export function calculateNicheScore(
  ratingCount: number | undefined,
  types: string[],
  name: string
): number {
  const lowerName = name.toLowerCase();

  // 1. Heavy penalty for known chains
  if (CHAIN_NAMES.some(chain => lowerName.includes(chain))) {
    return 10;
  }

  // 2. Penalty for generic fast food with high ratings count (likely a chain)
  if (ratingCount && ratingCount > 1000 && types.includes('fast_food_restaurant')) {
    return 30;
  }

  // 3. Boost for "Hidden Gems" (high quality, moderate ratings count implies local)
  // Note: High quality is handled by RatingScore, this just handles "Niche-ness"
  if (ratingCount && ratingCount < 500 && ratingCount > 10) {
    return 100; // Likely local
  }

  if (ratingCount && ratingCount > 2000) {
    return 50; // Very established, maybe touristy or big chain
  }

  return 80; // Default good score for others
}

/**
 * Get importance multiplier for a preference category
 * must-have returns 0 (handled separately via filtering)
 */
function getImportanceMultiplier(importance: string): number {
  return IMPORTANCE_MULTIPLIERS[importance as keyof typeof IMPORTANCE_MULTIPLIERS] || 1.0;
}

/**
 * Calculate overall relevance score for a business
 * NEW APPROACH: Preference matching is primary, ratings are a quality multiplier
 */
export function calculateRelevanceScore(
  businessAttributes: BusinessAttributes,
  googleRating: number | undefined,
  winksScore: number | undefined,
  preferences: DiningPreferences,
  categoryWeights = DEFAULT_CATEGORY_WEIGHTS,
  businessName: string = ''
): RelevanceScore {
  // Calculate individual category scores
  const cuisineScore = calculateCuisineScore(
    businessAttributes.cuisineTypes,
    preferences.cuisines
  );

  const priceScore = calculatePriceScore(
    businessAttributes.priceLevel,
    preferences.priceRange
  );

  const dietaryScore = calculateDietaryScore(
    businessAttributes.dietaryOptions,
    preferences.dietary
  );

  const ambianceScore = calculateAmbianceScore(
    businessAttributes.ambianceTags,
    preferences.ambiance
  );

  const distanceScore = calculateDistanceScore(
    businessAttributes.distanceFromUser,
    preferences.distance
  );

  const ratingScore = calculateRatingScore(
    googleRating,
    winksScore,
    preferences
  );

  const featuresScore = calculateFeaturesScore(
    businessAttributes.features,
    preferences.features
  );

  // New Scores
  const timeScore = calculateTimeScore(businessAttributes.rawTypes || businessAttributes.cuisineTypes);
  const nicheScore = calculateNicheScore(businessAttributes.ratingCount, businessAttributes.rawTypes || businessAttributes.cuisineTypes, businessName);

  // Apply importance multipliers and category weights
  const weightedCuisineScore =
    (cuisineScore * categoryWeights.cuisine * getImportanceMultiplier(preferences.cuisines?.importance || 'medium')) / 100;

  const weightedPriceScore =
    (priceScore * categoryWeights.price * getImportanceMultiplier(preferences.priceRange?.importance || 'medium')) / 100;

  const weightedDietaryScore =
    (dietaryScore * categoryWeights.dietary * getImportanceMultiplier(preferences.dietary?.importance || 'medium')) / 100;

  const weightedAmbianceScore =
    (ambianceScore * categoryWeights.ambiance * getImportanceMultiplier(preferences.ambiance?.importance || 'medium')) / 100;

  const weightedDistanceScore =
    (distanceScore * categoryWeights.distance * getImportanceMultiplier(preferences.distance?.importance || 'medium')) / 100;

  const weightedFeaturesScore =
    (featuresScore * categoryWeights.features * getImportanceMultiplier(preferences.features?.importance || 'medium')) / 100;

  // Calculate preference match score (without ratings)
  const preferenceMatchScore =
    weightedCuisineScore +
    weightedPriceScore +
    weightedDietaryScore +
    weightedAmbianceScore +
    weightedDistanceScore +
    weightedFeaturesScore;

  // Use rating as a quality multiplier (0.7 to 1.3 range)
  const ratingMultiplier = 0.7 + (ratingScore / 100) * 0.6;

  // Time Multiplier (0.2 to 1.0) - Strong filter
  const timeMultiplier = 0.2 + (timeScore / 100) * 0.8;

  // Niche Multiplier (0.5 to 1.0) - Preference for local
  // If nicheScore is low (chain), multiplier is 0.5. If high (local), 1.0.
  const nicheMultiplier = 0.5 + (nicheScore / 100) * 0.5;

  // Final score: preference match boosted by rating quality, time, and niche-ness
  const totalScore = preferenceMatchScore * ratingMultiplier * timeMultiplier * nicheMultiplier;

  // Determine matched and unmatched preferences
  const matchedPreferences: string[] = [];
  const unmatchedPreferences: string[] = [];

  // Check each category (threshold of 60 for "matched")
  if (cuisineScore >= 60) matchedPreferences.push('cuisine');
  else if ((preferences.cuisines?.preferred || []).length > 0) unmatchedPreferences.push('cuisine');

  if (priceScore >= 60) matchedPreferences.push('price');
  else if ((preferences.priceRange?.min ?? 1) > 1 || (preferences.priceRange?.max ?? 4) < 4) unmatchedPreferences.push('price');

  if (dietaryScore >= 60) matchedPreferences.push('dietary');
  else if ((preferences.dietary?.restrictions || []).length > 0) unmatchedPreferences.push('dietary');

  if (ambianceScore >= 60) matchedPreferences.push('ambiance');
  else if ((preferences.ambiance?.preferred || []).length > 0) unmatchedPreferences.push('ambiance');

  if (distanceScore >= 60) matchedPreferences.push('distance');
  else if ((preferences.distance?.maxDistance ?? 10) < 10) unmatchedPreferences.push('distance');

  if (ratingScore >= 60) matchedPreferences.push('rating');
  else if ((preferences.rating?.minRating ?? 0) > 0 || preferences.rating?.minWinksScore !== null) unmatchedPreferences.push('rating');

  if (featuresScore >= 60) matchedPreferences.push('features');
  else if ((preferences.features?.preferred || []).length > 0) unmatchedPreferences.push('features');

  return {
    businessId: '', // Will be set by caller
    totalScore: Math.min(100, Math.max(0, totalScore)), // Clamp between 0-100
    breakdown: {
      cuisineScore,
      priceScore,
      dietaryScore,
      ambianceScore,
      distanceScore,
      ratingScore,
      featuresScore,
      timeScore,
      nicheScore
    },
    matchedPreferences,
    unmatchedPreferences,
  };
}

/**
 * Interface for business with attributes and scores
 */
export interface BusinessWithScore {
  business: google.maps.places.PlaceResult;
  attributes: BusinessAttributes;
  score: RelevanceScore;
  googleRating?: number;
  winksScore?: number;
}

/**
 * Check if a business meets must-have cuisine preferences
 */
function meetsCuisineMustHaves(
  businessCuisines: string[],
  preferences: DiningPreferences['cuisines'] | undefined
): boolean {
  if (preferences?.importance !== 'must-have') {
    return true;
  }

  const disliked = preferences.disliked || [];
  const preferred = preferences.preferred || [];

  // Must not be in disliked list
  const hasDisliked = businessCuisines.some(cuisine =>
    disliked.some(d =>
      cuisine.toLowerCase().includes(d.toLowerCase()) ||
      d.toLowerCase().includes(cuisine.toLowerCase())
    )
  );

  if (hasDisliked) {
    return false;
  }

  // Must have at least one preferred cuisine
  if (preferred.length === 0) {
    return true;
  }

  return businessCuisines.some(cuisine =>
    preferred.some(p =>
      cuisine.toLowerCase().includes(p.toLowerCase()) ||
      p.toLowerCase().includes(cuisine.toLowerCase())
    )
  );
}

/**
 * Check if a business meets must-have price range preferences
 */
function meetsPriceMustHaves(
  businessPriceLevel: number | null,
  preferences: DiningPreferences['priceRange'] | undefined
): boolean {
  if (preferences?.importance !== 'must-have') {
    return true;
  }

  // If no price data, allow it through
  if (businessPriceLevel === null) {
    return true;
  }

  const min = preferences.min ?? 1;
  const max = preferences.max ?? 4;

  return businessPriceLevel >= min && businessPriceLevel <= max;
}

/**
 * Check if a business meets must-have dietary preferences
 */
function meetsDietaryMustHaves(
  businessDietaryOptions: string[],
  preferences: DiningPreferences['dietary'] | undefined
): boolean {
  if (preferences?.importance !== 'must-have') {
    return true;
  }

  const restrictions = preferences.restrictions || [];

  // If no restrictions specified, pass
  if (restrictions.length === 0) {
    return true;
  }

  // If no dietary data available, allow it through (benefit of doubt)
  if (businessDietaryOptions.length === 0) {
    return true;
  }

  // All restrictions must be met
  return restrictions.every(restriction =>
    businessDietaryOptions.some(option =>
      option.toLowerCase().includes(restriction.toLowerCase()) ||
      restriction.toLowerCase().includes(option.toLowerCase())
    )
  );
}

/**
 * Filter businesses by must-have preferences
 * Returns businesses that meet all must-have criteria
 */
export function filterByMustHaves(
  businesses: BusinessWithScore[],
  preferences: DiningPreferences
): BusinessWithScore[] {
  return businesses.filter(({ attributes }) => {
    // Check cuisine must-haves
    if (!meetsCuisineMustHaves(attributes.cuisineTypes, preferences.cuisines)) {
      return false;
    }

    // Check price must-haves
    if (!meetsPriceMustHaves(attributes.priceLevel, preferences.priceRange)) {
      return false;
    }

    // Check dietary must-haves
    if (!meetsDietaryMustHaves(attributes.dietaryOptions, preferences.dietary)) {
      return false;
    }

    return true;
  });
}

/**
 * Sort businesses by relevance score (descending)
 */
export function sortByRelevance(businesses: BusinessWithScore[]): BusinessWithScore[] {
  return [...businesses].sort((a, b) => b.score.totalScore - a.score.totalScore);
}

/**
 * Check if user has any preferences set
 */
export function hasPreferencesSet(preferences: DiningPreferences): boolean {
  return (
    (preferences.cuisines?.preferred || []).length > 0 ||
    (preferences.cuisines?.disliked || []).length > 0 ||
    (preferences.priceRange?.min ?? 1) > 1 ||
    (preferences.priceRange?.max ?? 4) < 4 ||
    (preferences.dietary?.restrictions || []).length > 0 ||
    (preferences.ambiance?.preferred || []).length > 0 ||
    (preferences.distance?.maxDistance ?? 10) < 10 ||
    (preferences.rating?.minRating ?? 0) > 0 ||
    (preferences.rating?.minWinksScore !== null && preferences.rating?.minWinksScore !== undefined) ||
    (preferences.features?.preferred || []).length > 0
  );
}

/**
 * Progressive relaxation of must-have constraints
 * Returns relaxed preferences with must-haves converted to high importance
 */
export function relaxMustHaves(preferences: DiningPreferences): DiningPreferences {
  return {
    ...preferences,
    cuisines: preferences.cuisines ? {
      ...preferences.cuisines,
      importance: preferences.cuisines.importance === 'must-have' ? 'high' : preferences.cuisines.importance,
    } : DEFAULT_DINING_PREFERENCES.cuisines,
    priceRange: preferences.priceRange ? {
      ...preferences.priceRange,
      importance: preferences.priceRange.importance === 'must-have' ? 'high' : preferences.priceRange.importance,
    } : DEFAULT_DINING_PREFERENCES.priceRange,
    dietary: preferences.dietary ? {
      ...preferences.dietary,
      importance: preferences.dietary.importance === 'must-have' ? 'high' : preferences.dietary.importance,
    } : DEFAULT_DINING_PREFERENCES.dietary,
  };
}

/**
 * Sort businesses with fallback logic
 * - If preferences are set and businesses match, sort by relevance
 * - If no matches with must-haves, progressively relax and retry
 * - If no preferences set, sort by default (rating then distance)
 */
export function sortBusinessesWithFallback(
  businesses: BusinessWithScore[],
  preferences: DiningPreferences
): { sorted: BusinessWithScore[]; relaxed: boolean } {
  // If no preferences set, use default sorting
  if (!hasPreferencesSet(preferences)) {
    const sorted = [...businesses].sort((a, b) => {
      // Sort by Google rating first
      const ratingA = a.googleRating || 0;
      const ratingB = b.googleRating || 0;

      if (ratingB !== ratingA) {
        return ratingB - ratingA;
      }

      // Then by distance
      const distanceA = a.attributes.distanceFromUser || Infinity;
      const distanceB = b.attributes.distanceFromUser || Infinity;

      return distanceA - distanceB;
    });

    return { sorted, relaxed: false };
  }

  // Try filtering by must-haves
  let filtered = filterByMustHaves(businesses, preferences);

  // If no matches, relax must-haves and try again
  let relaxed = false;
  if (filtered.length === 0 && businesses.length > 0) {
    const relaxedPreferences = relaxMustHaves(preferences);
    filtered = filterByMustHaves(businesses, relaxedPreferences);
    relaxed = true;
  }

  // Sort by relevance score
  const sorted = sortByRelevance(filtered.length > 0 ? filtered : businesses);

  return { sorted, relaxed };
}
