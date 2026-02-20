import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { DiningPreferences, DEFAULT_DINING_PREFERENCES } from '../types/preferences';

// Collection and document paths
const USERS_COLLECTION = 'userProfiles';

// Error types
export class PreferencesPersistenceError extends Error {
  constructor(message: string, public code: string, public originalError?: unknown) {
    super(message);
    this.name = 'PreferencesPersistenceError';
  }
}

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const RETRY_BACKOFF_MULTIPLIER = 2;

/**
 * Helper function to implement exponential backoff retry logic
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  retries: number = MAX_RETRIES,
  delay: number = RETRY_DELAY_MS
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }

    console.warn(`Operation failed, retrying in ${delay}ms... (${retries} retries left)`);

    await new Promise(resolve => setTimeout(resolve, delay));

    return retryWithBackoff(operation, retries - 1, delay * RETRY_BACKOFF_MULTIPLIER);
  }
}

function serializeDiningPreferences(preferences: DiningPreferences): any {
  return {
    ...preferences,
    learningData: {
      ...(preferences.learningData || {}),
      ratedBusinesses: (preferences.learningData?.ratedBusinesses || []).map(item => ({
        ...item,
        timestamp: item.timestamp instanceof Date ? item.timestamp.toISOString() : item.timestamp,
      })),
    },
  };
}

function deserializeDiningPreferences(data: any): DiningPreferences {
  if (!data) {
    return DEFAULT_DINING_PREFERENCES;
  }

  return {
    ...DEFAULT_DINING_PREFERENCES,
    ...data,
    learningData: {
      ...DEFAULT_DINING_PREFERENCES.learningData,
      ...(data.learningData || {}),
      ratedBusinesses: (data.learningData?.ratedBusinesses || []).map((item: any) => ({
        ...item,
        timestamp: typeof item.timestamp === 'string' ? new Date(item.timestamp) : (item.timestamp || new Date()),
      })),
    },
  };
}

/**
 * Save dining preferences to Firebase
 * @param userId - The user's Firebase Auth UID
 * @param preferences - The dining preferences to save
 * @throws PreferencesPersistenceError if save fails after retries
 */
export async function saveDiningPreferences(
  userId: string,
  preferences: DiningPreferences
): Promise<void> {
  if (!userId) {
    throw new PreferencesPersistenceError(
      'User ID is required to save preferences',
      'INVALID_USER_ID'
    );
  }

  try {
    await retryWithBackoff(async () => {
      const userDocRef = doc(db, USERS_COLLECTION, userId);

      // Check if document exists
      const userDoc = await getDoc(userDocRef);

      const serializedPreferences = serializeDiningPreferences(preferences);

      if (userDoc.exists()) {
        // Update existing document
        await updateDoc(userDocRef, {
          diningPreferences: serializedPreferences,
          lastUpdated: serverTimestamp(),
        });
      } else {
        // Create new document
        await setDoc(userDocRef, {
          diningPreferences: serializedPreferences,
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp(),
        });
      }
    });

    console.log('Successfully saved dining preferences to Firebase');
  } catch (error) {
    console.error('Failed to save dining preferences:', error);
    throw new PreferencesPersistenceError(
      'Failed to save dining preferences to Firebase',
      'SAVE_FAILED',
      error
    );
  }
}

/**
 * Load dining preferences from Firebase
 * @param userId - The user's Firebase Auth UID
 * @returns The user's dining preferences, or default preferences if none exist
 * @throws PreferencesPersistenceError if load fails after retries
 */
export async function loadDiningPreferences(userId: string): Promise<DiningPreferences> {
  if (!userId) {
    throw new PreferencesPersistenceError(
      'User ID is required to load preferences',
      'INVALID_USER_ID'
    );
  }

  try {
    const preferences = await retryWithBackoff(async () => {
      const userDocRef = doc(db, USERS_COLLECTION, userId);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        console.log('No preferences found in Firebase, returning defaults');
        return DEFAULT_DINING_PREFERENCES;
      }

      const data = userDoc.data();

      if (!data.diningPreferences) {
        console.log('No dining preferences in user document, returning defaults');
        return DEFAULT_DINING_PREFERENCES;
      }

      return deserializeDiningPreferences(data.diningPreferences);
    });

    console.log('Successfully loaded dining preferences from Firebase');
    return preferences;
  } catch (error) {
    console.error('Failed to load dining preferences:', error);
    throw new PreferencesPersistenceError(
      'Failed to load dining preferences from Firebase',
      'LOAD_FAILED',
      error
    );
  }
}

/**
 * Check if user has dining preferences saved in Firebase
 * @param userId - The user's Firebase Auth UID
 * @returns true if preferences exist, false otherwise
 */
export async function hasDiningPreferences(userId: string): Promise<boolean> {
  if (!userId) {
    return false;
  }

  try {
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const userDoc = await getDoc(userDocRef);

    return userDoc.exists() && !!userDoc.data()?.diningPreferences;
  } catch (error) {
    console.error('Failed to check for dining preferences:', error);
    return false;
  }
}
