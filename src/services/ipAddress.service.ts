import { createFirestoreError } from '../utils/firestore';

/**
 * IP Address Service
 * Handles IP address detection, validation, and anonymization
 */
export class IPAddressService {
  private static instance: IPAddressService;
  private static readonly IP_CACHE_KEY = 'welcomeWinks_userIP';
  private static readonly IP_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  public static getInstance(): IPAddressService {
    if (!IPAddressService.instance) {
      IPAddressService.instance = new IPAddressService();
    }
    return IPAddressService.instance;
  }

  /**
   * Get current user's IP address with caching
   */
  async getCurrentIPAddress(): Promise<string> {
    try {
      // Check cache first
      const cachedIP = this.getCachedIP();
      if (cachedIP) {
        return cachedIP;
      }

      // Fetch from external service
      const ip = await this.fetchIPFromService();

      // Cache the result
      this.cacheIP(ip);

      return ip;
    } catch (error) {
      console.warn('Failed to get IP address:', error);
      return '0.0.0.0'; // Fallback IP
    }
  }

  /**
   * Fetch IP address from external service
   */
  private async fetchIPFromService(): Promise<string> {
    const services = [
      'https://api.ipify.org?format=json',
      // 'https://ipapi.co/json/', // Often blocks CORS or has strict rate limits
      'https://httpbin.org/ip'
    ];

    for (const service of services) {
      try {
        const response = await fetch(service, {
          timeout: 5000,
          headers: {
            'Accept': 'application/json'
          }
        } as RequestInit);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        // Different services return IP in different formats
        const ip = data.ip || data.query || data.origin?.split(' ')[0];

        if (ip && this.isValidIPAddress(ip)) {
          return ip;
        }
      } catch (error) {
        console.warn(`Failed to get IP from ${service}:`, error);
        continue;
      }
    }

    throw new Error('All IP services failed');
  }

  /**
   * Cache IP address locally
   */
  private cacheIP(ip: string): void {
    try {
      const cacheData = {
        ip,
        timestamp: Date.now()
      };
      localStorage.setItem(IPAddressService.IP_CACHE_KEY, JSON.stringify(cacheData));
    } catch (error) {
      console.warn('Failed to cache IP address:', error);
    }
  }

  /**
   * Get cached IP address if still valid
   */
  private getCachedIP(): string | null {
    try {
      const cached = localStorage.getItem(IPAddressService.IP_CACHE_KEY);
      if (!cached) {
        return null;
      }

      const cacheData = JSON.parse(cached);
      const age = Date.now() - cacheData.timestamp;

      if (age > IPAddressService.IP_CACHE_DURATION) {
        localStorage.removeItem(IPAddressService.IP_CACHE_KEY);
        return null;
      }

      return cacheData.ip;
    } catch (error) {
      console.warn('Failed to get cached IP:', error);
      localStorage.removeItem(IPAddressService.IP_CACHE_KEY);
      return null;
    }
  }

  /**
   * Validate IP address format
   */
  isValidIPAddress(ip: string): boolean {
    if (!ip || typeof ip !== 'string') {
      return false;
    }

    // IPv4 validation
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

    // IPv6 validation (basic)
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

    // IPv6 compressed format
    const ipv6CompressedRegex = /^(([0-9a-fA-F]{1,4}:)*)?::([0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}$/;

    return ipv4Regex.test(ip) || ipv6Regex.test(ip) || ipv6CompressedRegex.test(ip);
  }

  /**
   * Anonymize IP address for privacy
   */
  anonymizeIPAddress(ip: string): string {
    if (!this.isValidIPAddress(ip)) {
      return '0.0.0.0';
    }

    // For IPv4, zero out the last octet
    if (ip.includes('.')) {
      const parts = ip.split('.');
      if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
      }
    }

    // For IPv6, zero out the last 64 bits
    if (ip.includes(':')) {
      const parts = ip.split(':');
      if (parts.length >= 4) {
        return `${parts.slice(0, 4).join(':')}::`;
      }
    }

    return '0.0.0.0';
  }

  /**
   * Check if two IP addresses are from the same subnet
   */
  isSameSubnet(ip1: string, ip2: string): boolean {
    if (!this.isValidIPAddress(ip1) || !this.isValidIPAddress(ip2)) {
      return false;
    }

    // For IPv4, compare first 3 octets
    if (ip1.includes('.') && ip2.includes('.')) {
      const parts1 = ip1.split('.');
      const parts2 = ip2.split('.');

      if (parts1.length === 4 && parts2.length === 4) {
        return parts1.slice(0, 3).join('.') === parts2.slice(0, 3).join('.');
      }
    }

    // For IPv6, compare first 64 bits (simplified)
    if (ip1.includes(':') && ip2.includes(':')) {
      const parts1 = ip1.split(':');
      const parts2 = ip2.split(':');

      if (parts1.length >= 4 && parts2.length >= 4) {
        return parts1.slice(0, 4).join(':') === parts2.slice(0, 4).join(':');
      }
    }

    return false;
  }

  /**
   * Get IP geolocation information (basic)
   */
  async getIPGeolocation(ip?: string): Promise<{
    country?: string;
    region?: string;
    city?: string;
    timezone?: string;
  } | null> {
    try {
      const targetIP = ip || await this.getCurrentIPAddress();

      if (targetIP === '0.0.0.0') {
        return null;
      }

      const response = await fetch(`https://ipapi.co/${targetIP}/json/`, {
        timeout: 5000
      } as RequestInit);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      return {
        country: data.country_name,
        region: data.region,
        city: data.city,
        timezone: data.timezone
      };
    } catch (error) {
      console.warn('Failed to get IP geolocation:', error);
      return null;
    }
  }

  /**
   * Clear IP cache
   */
  clearIPCache(): void {
    try {
      localStorage.removeItem(IPAddressService.IP_CACHE_KEY);
    } catch (error) {
      console.warn('Failed to clear IP cache:', error);
    }
  }

  /**
   * Validate cookie account access by IP
   */
  validateCookieIPAccess(cookieIP: string, currentIP: string): boolean {
    // Allow access if IPs match exactly
    if (cookieIP === currentIP) {
      return true;
    }

    // Allow access if we can't determine current IP
    if (!currentIP || currentIP === '0.0.0.0') {
      return true;
    }

    // Allow access if cookie was created with fallback IP
    if (cookieIP === '0.0.0.0') {
      return true;
    }

    // Allow access if IPs are from the same subnet (for dynamic IPs)
    if (this.isSameSubnet(cookieIP, currentIP)) {
      return true;
    }

    return false;
  }

  /**
   * Generate IP-based hash for additional security
   */
  generateIPHash(ip: string, salt: string): string {
    try {
      // Simple hash function for IP + salt
      const combined = `${ip}:${salt}`;
      let hash = 0;

      for (let i = 0; i < combined.length; i++) {
        const char = combined.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }

      return Math.abs(hash).toString(36);
    } catch (error) {
      throw createFirestoreError('generateIPHash', error, { ip, salt });
    }
  }
}

// Export singleton instance
export const ipAddressService = IPAddressService.getInstance();