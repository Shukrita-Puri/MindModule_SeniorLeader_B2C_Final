/**
 * Centralized Auth Token Service (v2 — hardened)
 * 
 * Single source of truth for Auth0 access token retrieval.
 * - Deduplicates concurrent requests (one in-flight promise)
 * - Expiry-aware: returns cached token if still valid
 * - DEV_MODE safe (returns anon key fallback)
 * - Structured logging (source path: cache / refresh / fallback)
 * - Used by all hooks/utils that need to call edge functions
 */

import { DEV_MODE } from '@/config/devMode';

// ─── Token cache with expiry ────────────────────────────────────────
let cachedToken: string | null = null;
let cachedTokenExpiresAt = 0; // Unix timestamp in seconds
const TOKEN_EXPIRY_BUFFER_S = 60; // Refresh 60s before actual expiry

// In-flight token promise for deduplication
let inflightTokenPromise: Promise<string | null> | null = null;

/**
 * Decode JWT payload to extract expiry (exp claim).
 * Returns null if token is not a valid JWT.
 */
function getJwtExpiry(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/**
 * Get Auth0 access token with request deduplication and expiry-aware caching.
 * Concurrent calls reuse a single in-flight promise.
 * Returns null in DEV_MODE or when Auth0 is unavailable.
 */
export async function getAuthToken(): Promise<string | null> {
  if (DEV_MODE) {
    return import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || null;
  }

  // Fast path: return cached token if still valid
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedTokenExpiresAt > now + TOKEN_EXPIRY_BUFFER_S) {
    return cachedToken;
  }

  // Deduplicate: if a request is already in flight, reuse it
  if (inflightTokenPromise) {
    return inflightTokenPromise;
  }

  inflightTokenPromise = (async () => {
    try {
      const auth0Client = (window as any).__auth0Client;
      if (!auth0Client) {
        console.warn('[authTokenService] Auth0 client not available');
        return null;
      }

      // Request fresh token (SDK handles cache/refresh internally)
      const token = await auth0Client.getAccessTokenSilently();

      if (token) {
        // Cache with expiry
        const exp = getJwtExpiry(token);
        if (exp) {
          cachedToken = token;
          cachedTokenExpiresAt = exp;
          const ttl = exp - now;
          console.log(`[authTokenService] ✅ Token acquired (TTL: ${ttl}s, path: refresh)`);
        } else {
          // Opaque token — cache for 5 min
          cachedToken = token;
          cachedTokenExpiresAt = now + 300;
          console.log('[authTokenService] ✅ Token acquired (opaque, cached 5min)');
        }
      }

      return token;
    } catch (err: any) {
      // If refresh token is missing, try iframe-based silent auth as fallback
      if (err?.error === 'missing_refresh_token' || err?.error === 'invalid_grant') {
        try {
          const auth0Client = (window as any).__auth0Client;
          if (auth0Client) {
            console.log('[authTokenService] Attempting iframe fallback (cacheMode: off)');
            const token = await auth0Client.getAccessTokenSilently({ cacheMode: 'off' });
            if (token) {
              const exp = getJwtExpiry(token);
              cachedToken = token;
              cachedTokenExpiresAt = exp || now + 300;
              console.log('[authTokenService] ✅ Token acquired (path: iframe-fallback)');
            }
            return token;
          }
        } catch (fallbackErr) {
          console.error('[authTokenService] Iframe fallback also failed:', fallbackErr);
        }
      }
      console.error('[authTokenService] Token retrieval failed:', err?.error || err?.message || err);
      // Clear stale cache on error
      cachedToken = null;
      cachedTokenExpiresAt = 0;
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

/**
 * Clear the token cache. Useful after logout.
 */
export function clearTokenCache(): void {
  cachedToken = null;
  cachedTokenExpiresAt = 0;
  inflightTokenPromise = null;
  console.log('[authTokenService] Cache cleared');
}
