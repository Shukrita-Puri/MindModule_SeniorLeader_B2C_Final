/**
 * Centralized Auth Token Service (v3 — hardened)
 * 
 * Single source of truth for Auth0 access token retrieval.
 * - Deduplicates concurrent requests (one in-flight promise)
 * - Expiry-aware: returns cached token if still valid
 * - DEV_MODE safe (returns anon key fallback)
 * - Retries silent refresh before giving up
 * - Used by all hooks/utils that need to call edge functions
 */

import { DEV_MODE } from '@/config/devMode';

// ─── Token cache with expiry ────────────────────────────────────────
let cachedToken: string | null = null;
let cachedTokenExpiresAt = 0;
const TOKEN_EXPIRY_BUFFER_S = 60;

let inflightTokenPromise: Promise<string | null> | null = null;

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

export async function getAuthToken(): Promise<string | null> {
  if (DEV_MODE) {
    return import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedTokenExpiresAt > now + TOKEN_EXPIRY_BUFFER_S) {
    return cachedToken;
  }

  if (inflightTokenPromise) {
    return inflightTokenPromise;
  }

  inflightTokenPromise = (async () => {
    try {
      const auth0Client = (window as any).__auth0Client;
      if (!auth0Client) {
        console.warn('[authTokenService] Auth0 client not available yet, waiting 1s...');
        // Brief wait — client may still be initializing
        await new Promise(r => setTimeout(r, 1000));
        const retryClient = (window as any).__auth0Client;
        if (!retryClient) {
          console.warn('[authTokenService] Auth0 client still not available after wait');
          return null;
        }
        const token = await retryClient.getAccessTokenSilently();
        if (token) {
          const exp = getJwtExpiry(token);
          cachedToken = token;
          cachedTokenExpiresAt = exp || now + 300;
          const ttl = (exp || now + 300) - now;
          console.log(`[authTokenService] ✅ Token acquired (TTL: ${ttl}s, path: delayed-refresh)`);
        }
        return token;
      }

      const token = await auth0Client.getAccessTokenSilently();

      if (token) {
        const exp = getJwtExpiry(token);
        if (exp) {
          cachedToken = token;
          cachedTokenExpiresAt = exp;
          const ttl = exp - now;
          console.log(`[authTokenService] ✅ Token acquired (TTL: ${ttl}s, path: refresh)`);
        } else {
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

      // Don't log "login_required" as an error — it's expected when session is truly gone
      if (err?.error === 'login_required') {
        console.log('[authTokenService] Session expired (login_required) — user will need to re-authenticate');
      } else {
        console.error('[authTokenService] Token retrieval failed:', err?.error || err?.message || err);
      }

      cachedToken = null;
      cachedTokenExpiresAt = 0;
      return null;
    } finally {
      inflightTokenPromise = null;
    }
  })();

  return inflightTokenPromise;
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export function clearTokenCache(): void {
  cachedToken = null;
  cachedTokenExpiresAt = 0;
  inflightTokenPromise = null;
  console.log('[authTokenService] Cache cleared');
}
