/**
 * Centralized Auth Token Service
 * 
 * Single source of truth for Auth0 access token retrieval.
 * - Deduplicates concurrent requests (one in-flight promise)
 * - DEV_MODE safe (returns anon key fallback)
 * - Used by all hooks/utils that need to call edge functions
 */

import { DEV_MODE } from '@/config/devMode';

// In-flight token promise for deduplication
let inflightTokenPromise: Promise<string | null> | null = null;

/**
 * Get Auth0 access token with request deduplication.
 * Concurrent calls reuse a single in-flight promise.
 * Returns null in DEV_MODE or when Auth0 is unavailable.
 */
export async function getAuthToken(): Promise<string | null> {
  if (DEV_MODE) {
    return import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || null;
  }

  // Deduplicate: if a request is already in flight, reuse it
  if (inflightTokenPromise) {
    return inflightTokenPromise;
  }

  inflightTokenPromise = (async () => {
    try {
      const auth0Client = (window as any).__auth0Client;
      if (auth0Client) {
        return await auth0Client.getAccessTokenSilently();
      }
      console.warn('[authTokenService] Auth0 client not available');
      return null;
    } catch (err: any) {
      // If refresh token is missing, try iframe-based silent auth as fallback
      if (err?.error === 'missing_refresh_token') {
        try {
          const auth0Client = (window as any).__auth0Client;
          if (auth0Client) {
            return await auth0Client.getAccessTokenSilently({ cacheMode: 'off' });
          }
        } catch (fallbackErr) {
          console.error('[authTokenService] Fallback token retrieval also failed:', fallbackErr);
        }
      }
      console.error('[authTokenService] Token retrieval failed:', err);
      return null;
    } finally {
      inflightTokenPromise = null;
    }
  })();

  return inflightTokenPromise;
}

/**
 * Get authorization headers for edge function calls.
 * Returns headers object with Bearer token.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
