import { doc, updateDoc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { authService } from './auth.service';
import { ipAddressService } from './ipAddress.service';
import { createFirestoreError } from '../utils/firestore';

/**
 * Activity Tracking Service
 * Handles user activity tracking and cookie account expiration
 */
export class ActivityTrackingService {
  private static instance: ActivityTrackingService;
  private static readonly ACTIVITY_DEBOUNCE_MS = 60000; // 1 minute
  private static readonly EXPIRY_DAYS = 45;

  private lastActivityTime: number = 0;
  private activityTimer: NodeJS.Timeout | null = null;

  public static getInstance(): ActivityTrackingService {
    if (!ActivityTrackingService.instance) {
      ActivityTrackingService.instance = new ActivityTrackingService();
    }
    return ActivityTrackingService.instance;
  }

  /**
   * Track user activity and update expiration
   */
  async trackActivity(userId: string, activityType: string = 'page_visit'): Promise<void> {
    try {
      const now = Date.now();

      // Debounce activity tracking to avoid excessive writes
      if (now - this.lastActivityTime < ActivityTrackingService.ACTIVITY_DEBOUNCE_MS) {
        return;
      }

      this.lastActivityTime = now;

      // Clear existing timer
      if (this.activityTimer) {
        clearTimeout(this.activityTimer);
      }

      // Set new timer to batch activity updates
      this.activityTimer = setTimeout(async () => {
        try {
          await this.updateUserActivity(userId, activityType);
        } catch (err) {
          // TASKS-SAFE: Activity tracking is non-critical. Do not crash the app.
          console.warn('Background activity tracking failed (non-fatal):', err);
        }
      }, 1000); // 1 second delay to batch rapid activities

    } catch (error) {
      console.warn('Failed to track activity:', error);
    }
  }

  /**
   * Update user activity in database
   */
  private async updateUserActivity(userId: string, activityType: string): Promise<void> {
    try {
      // Check if this is a cookie account
      const cookieAccount = await authService.getCookieAccount(userId);

      if (cookieAccount) {
        await this.updateCookieActivity(userId, activityType);
      } else {
        await this.updateFullAccountActivity(userId, activityType);
      }
    } catch (error) {
      throw createFirestoreError('updateUserActivity', error, { userId, activityType });
    }
  }

  /**
   * Update cookie account activity
   */
  private async updateCookieActivity(cookieId: string, activityType: string): Promise<void> {
    try {
      const now = new Date();
      const newExpiresAt = new Date(now.getTime() + (ActivityTrackingService.EXPIRY_DAYS * 24 * 60 * 60 * 1000));
      const currentIP = await ipAddressService.getCurrentIPAddress();

      // Update cookie account - use setDoc to be safe
      const cookieRef = doc(db, 'cookieAccounts', cookieId);
      await setDoc(cookieRef, {
        lastActiveAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(newExpiresAt)
      }, { merge: true });

      // Track IP address activity
      await this.trackIPActivity(cookieId, currentIP, activityType);

    } catch (error) {
      throw createFirestoreError('updateCookieActivity', error, { cookieId, activityType });
    }
  }

  /**
   * Update full account activity
   */
  private async updateFullAccountActivity(userId: string, activityType: string): Promise<void> {
    try {
      const currentIP = await ipAddressService.getCurrentIPAddress();

      // Update user record - use setDoc with merge to ensure doc exists
      const userRef = doc(db, 'users', userId);
      await setDoc(userRef, {
        lastLoginAt: serverTimestamp(),
        ipAddress: currentIP
      }, { merge: true });

      // Track IP address activity
      await this.trackIPActivity(userId, currentIP, activityType);

    } catch (error) {
      throw createFirestoreError('updateFullAccountActivity', error, { userId, activityType });
    }
  }

  /**
   * Track IP address activity in user profile
   */
  private async trackIPActivity(userId: string, ipAddress: string, activityType: string): Promise<void> {
    try {
      const profileRef = doc(db, 'userProfiles', userId);
      const ipGeolocation = await ipAddressService.getIPGeolocation(ipAddress);

      // Get current profile to update IP history
      const profile = await authService.getUserProfile(userId);

      if (profile) {
        const ipHistory = profile.ipAddressHistory || [];

        // Check if we need to add a new IP entry
        const lastEntry = ipHistory[0];
        const shouldAddEntry = !lastEntry ||
          lastEntry.ipAddress !== ipAddress ||
          (Date.now() - lastEntry.timestamp.getTime()) > (24 * 60 * 60 * 1000); // 24 hours

        if (shouldAddEntry) {
          const newEntry = {
            ipAddress,
            timestamp: new Date(),
            action: activityType,
            geolocation: ipGeolocation
          };

          // Keep only last 10 IP entries
          const updatedHistory = [newEntry, ...ipHistory].slice(0, 10);

          await updateDoc(profileRef, {
            ipAddressHistory: updatedHistory,
            updatedAt: serverTimestamp()
          });
        }
      }
    } catch (error) {
      console.warn('Failed to track IP activity:', error);
    }
  }

  /**
   * Check for expired cookie accounts
   */
  async checkExpiredAccounts(): Promise<string[]> {
    try {
      // This would typically be implemented as a Firebase Cloud Function
      // For now, return empty array as this requires admin privileges
      console.warn('checkExpiredAccounts should be implemented as a server-side function');
      return [];
    } catch (error) {
      throw createFirestoreError('checkExpiredAccounts', error);
    }
  }

  /**
   * Clean up expired cookie accounts
   */
  async cleanupExpiredAccounts(): Promise<number> {
    try {
      // This would be implemented as a Firebase Cloud Function
      console.warn('cleanupExpiredAccounts should be implemented as a server-side function');
      return 0;
    } catch (error) {
      throw createFirestoreError('cleanupExpiredAccounts', error);
    }
  }

  /**
   * Get account expiration info
   */
  async getAccountExpirationInfo(userId: string): Promise<{
    expiresAt: Date | null;
    daysUntilExpiry: number | null;
    isExpired: boolean;
    accountType: 'full' | 'cookie' | null;
  }> {
    try {
      // Check if it's a cookie account
      const cookieAccount = await authService.getCookieAccount(userId);

      if (cookieAccount) {
        const now = new Date();
        const expiresAt = cookieAccount.expiresAt;
        const daysUntilExpiry = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        return {
          expiresAt,
          daysUntilExpiry: Math.max(0, daysUntilExpiry),
          isExpired: cookieAccount.isExpired || expiresAt < now,
          accountType: 'cookie'
        };
      }

      // Check if it's a full account
      const userProfile = await authService.getUserProfile(userId);

      if (userProfile && userProfile.accountType === 'full') {
        return {
          expiresAt: null, // Full accounts don't expire
          daysUntilExpiry: null,
          isExpired: false,
          accountType: 'full'
        };
      }

      return {
        expiresAt: null,
        daysUntilExpiry: null,
        isExpired: false,
        accountType: null
      };
    } catch (error) {
      throw createFirestoreError('getAccountExpirationInfo', error, { userId });
    }
  }

  /**
   * Extend cookie account expiration manually
   */
  async extendCookieExpiration(cookieId: string, additionalDays: number = ActivityTrackingService.EXPIRY_DAYS): Promise<void> {
    try {
      const cookieAccount = await authService.getCookieAccount(cookieId);

      if (!cookieAccount) {
        throw new Error('Cookie account not found or expired');
      }

      const now = new Date();
      const newExpiresAt = new Date(now.getTime() + (additionalDays * 24 * 60 * 60 * 1000));

      const cookieRef = doc(db, 'cookieAccounts', cookieId);
      await updateDoc(cookieRef, {
        lastActiveAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(newExpiresAt),
        isExpired: false
      });

      // Track the extension activity
      await this.trackActivity(cookieId, 'expiration_extended');

    } catch (error) {
      throw createFirestoreError('extendCookieExpiration', error, { cookieId, additionalDays });
    }
  }

  /**
   * Get activity statistics for an account
   */
  async getActivityStats(userId: string): Promise<{
    totalActivities: number;
    lastActivity: Date | null;
    activityFrequency: 'high' | 'medium' | 'low';
    ipAddressCount: number;
  }> {
    try {
      const profile = await authService.getUserProfile(userId);

      if (!profile || !profile.ipAddressHistory) {
        return {
          totalActivities: 0,
          lastActivity: null,
          activityFrequency: 'low',
          ipAddressCount: 0
        };
      }

      const ipHistory = profile.ipAddressHistory;
      const totalActivities = ipHistory.length;
      const lastActivity = ipHistory[0]?.timestamp || null;
      const uniqueIPs = new Set(ipHistory.map(entry => entry.ipAddress)).size;

      // Calculate activity frequency based on recent activities
      const recentActivities = ipHistory.filter(entry => {
        const daysSince = (Date.now() - entry.timestamp.getTime()) / (1000 * 60 * 60 * 24);
        return daysSince <= 7; // Last 7 days
      });

      let activityFrequency: 'high' | 'medium' | 'low' = 'low';
      if (recentActivities.length >= 5) {
        activityFrequency = 'high';
      } else if (recentActivities.length >= 2) {
        activityFrequency = 'medium';
      }

      return {
        totalActivities,
        lastActivity,
        activityFrequency,
        ipAddressCount: uniqueIPs
      };
    } catch (error) {
      throw createFirestoreError('getActivityStats', error, { userId });
    }
  }

  /**
   * Initialize activity tracking for the current session
   */
  initializeActivityTracking(userId: string): void {
    try {
      // Track initial page load
      this.trackActivity(userId, 'session_start');

      // Set up periodic activity tracking
      const activityInterval = setInterval(() => {
        this.trackActivity(userId, 'session_active');
      }, 5 * 60 * 1000); // Every 5 minutes

      // Clean up on page unload
      const cleanup = () => {
        clearInterval(activityInterval);
        this.trackActivity(userId, 'session_end');
      };

      window.addEventListener('beforeunload', cleanup);
      window.addEventListener('pagehide', cleanup);

      // Track user interactions
      const trackInteraction = () => {
        this.trackActivity(userId, 'user_interaction');
      };

      document.addEventListener('click', trackInteraction, { passive: true });
      document.addEventListener('keydown', trackInteraction, { passive: true });
      document.addEventListener('scroll', trackInteraction, { passive: true });

    } catch (error) {
      console.warn('Failed to initialize activity tracking:', error);
    }
  }

  /**
   * Handle expired account detection
   */
  async handleExpiredAccount(userId: string): Promise<void> {
    try {
      const cookieAccount = await authService.getCookieAccount(userId);

      if (cookieAccount && (cookieAccount.isExpired || cookieAccount.expiresAt < new Date())) {
        // Expire the account and anonymize data
        await authService.expireCookieAccount(userId);

        // Clear local storage
        localStorage.removeItem('welcomeWinks_cookieId');

        // Redirect to new user flow
        window.location.reload();
      }
    } catch (error) {
      console.warn('Failed to handle expired account:', error);
    }
  }

  /**
   * Check if account needs renewal warning
   */
  async shouldShowRenewalWarning(userId: string): Promise<boolean> {
    try {
      const expirationInfo = await this.getAccountExpirationInfo(userId);

      if (expirationInfo.accountType === 'cookie' &&
        expirationInfo.daysUntilExpiry !== null &&
        expirationInfo.daysUntilExpiry <= 7) {
        return true;
      }

      return false;
    } catch (error) {
      console.warn('Failed to check renewal warning:', error);
      return false;
    }
  }
}

// Export singleton instance
export const activityTrackingService = ActivityTrackingService.getInstance();