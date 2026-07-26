/**
 * Centralized Auth Token Service (v3 – hardened)
 * 
 * Single source of truth for Auth0 access token retrieval.
 * - Deduplicates concurrent requests (one in-flight promise)
 * - Expiry-aware: returns cached token if still valid
 * - DEV_MODE safe (returns anon key fallback)
 * - Retries silent refresh before giving up
 * - Used by all hooks/utils that need to call edge functions
 */

import { DEV_MODE } from '@/config/devMode';
import { getNativeTokens, isNativeApp, refreshNativeTokens } from '@/utils/nativeAuth';
import { updateNativeBackgroundAuthToken } from '@/utils/nativeBackgroundSync';

// ─── Token cache with expiry ────────────────────────────────────────
let cachedToken: string | null = null;
let cachedTokenExpiresAt = 0;
const TOKEN_EXPIRY_BUFFER_S = 60;

let inflightTokenPromise: Promise<string | null> | null = null;

interface Auth0LikeClient {
  getAccessTokenSilently(opts?: Record<string, unknown>): Promise<string>;
}

interface Auth0LikeError {
  error?: string;
  message?: string;
}

function getWindowAuth0Client(): Auth0LikeClient | null {
  const maybeWindow = window as typeof window & { __auth0Client?: Auth0LikeClient };
  return maybeWindow.__auth0Client ?? null;
}

async function getNativeAccessToken(now: number): Promise<string | null> {
  if (!isNativeApp()) return null;
  let tokens = getNativeTokens();
  if (tokens && tokens.expires_at > now + TOKEN_EXPIRY_BUFFER_S) {
    cachedToken = tokens.access_token;
    cachedTokenExpiresAt = tokens.expires_at;
    updateNativeBackgroundAuthToken(tokens.access_token, tokens.expires_at);
    console.log(`[authTokenService] ✅ Token acquired (TTL: ${tokens.expires_at - now}s, path: native-cache)`);
    return tokens.access_token;
  }

  if (tokens?.refresh_token) {
    const refreshed = await refreshNativeTokens();
    if (refreshed) {
      tokens = getNativeTokens();
      if (tokens?.access_token) {
        cachedToken = tokens.access_token;
        cachedTokenExpiresAt = tokens.expires_at || now + 300;
        updateNativeBackgroundAuthToken(tokens.access_token, cachedTokenExpiresAt);
        console.log('[authTokenService] ✅ Token acquired (path: native-refresh)');
        return tokens.access_token;
      }
    }
  }

  return null;
}

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
      const nativeToken = await getNativeAccessToken(now);
      if (nativeToken) return nativeToken;

      const auth0Client = getWindowAuth0Client();
      if (!auth0Client) {
        console.warn('[authTokenService] Auth0 client not available yet, waiting 1s...');
        // Brief wait – client may still be initializing
        await new Promise(r => setTimeout(r, 1000));
        const retryClient = getWindowAuth0Client();
        if (!retryClient) {
          console.warn('[authTokenService] Auth0 client still not available after wait');
          return null;
        }
        const token = await retryClient.getAccessTokenSilently();
        if (token) {
          const exp = getJwtExpiry(token);
          cachedToken = token;
          cachedTokenExpiresAt = exp || now + 300;
          updateNativeBackgroundAuthToken(token, cachedTokenExpiresAt);
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
          updateNativeBackgroundAuthToken(token, cachedTokenExpiresAt);
          const ttl = exp - now;
          console.log(`[authTokenService] ✅ Token acquired (TTL: ${ttl}s, path: refresh)`);
        } else {
          cachedToken = token;
          cachedTokenExpiresAt = now + 300;
          updateNativeBackgroundAuthToken(token, cachedTokenExpiresAt);
          console.log('[authTokenService] ✅ Token acquired (opaque, cached 5min)');
        }
      }

      return token;
    } catch (err: unknown) {
      const authError = err as Auth0LikeError;
      // If refresh token is missing, try iframe-based silent auth as fallback
      if (authError?.error === 'missing_refresh_token' || authError?.error === 'invalid_grant') {
        try {
          const nativeToken = await getNativeAccessToken(now);
          if (nativeToken) return nativeToken;

          const auth0Client = getWindowAuth0Client();
          if (auth0Client) {
            console.log('[authTokenService] Attempting iframe fallback (cacheMode: off)');
            const token = await auth0Client.getAccessTokenSilently({ cacheMode: 'off' });
            if (token) {
              const exp = getJwtExpiry(token);
              cachedToken = token;
              cachedTokenExpiresAt = exp || now + 300;
              updateNativeBackgroundAuthToken(token, cachedTokenExpiresAt);
              console.log('[authTokenService] ✅ Token acquired (path: iframe-fallback)');
            }
            return token;
          }
        } catch (fallbackErr) {
          console.error('[authTokenService] Iframe fallback also failed:', fallbackErr);
        }
      }

      // Don't log "login_required" as an error – it's expected when session is truly gone
      if (authError?.error === 'login_required') {
        console.log('[authTokenService] Session expired (login_required) – user will need to re-authenticate');
      } else {
        console.error('[authTokenService] Token retrieval failed:', authError?.error || authError?.message || err);
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
  const headers: Record<string, string> = { ...clientPlatformHeader() };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

/**
 * Declares the runtime shell to every edge function.
 *
 * App Store Review Guideline 3.1.1: the server must be able to refuse to open
 * an external Stripe purchase flow for a caller running inside the native
 * iOS/iPadOS shell. The client already hides those CTAs; this header lets the
 * server enforce the same rule independently, so a stale build or a deep link
 * cannot reach checkout. It is a defence-in-depth signal, not an auth claim —
 * omitting or forging it can only ever *deny* a purchase, never grant one.
 */
function clientPlatformHeader(): Record<string, string> {
  try {
    // Lazily read Capacitor so this module stays importable in Node tests.
    const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
    if (cap?.isNativePlatform?.() && cap.getPlatform) {
      return { 'x-mm-client-platform': `native-${cap.getPlatform()}` };
    }
  } catch {
    /* fall through to web */
  }
  return { 'x-mm-client-platform': 'web' };
}

function _unusedLegacyGetAuthHeaders(): Promise<Record<string, string>> {
  return Promise.resolve({});
}

async function _legacy() {
  const token = await getAuthToken();
  return token;
}

/**
 * Returns auth headers including the dev bypass header in DEV_MODE.
 * Use this for raw fetch() calls to edge functions (supabase.functions.invoke
 * is already patched by devInterceptor).
 */
export async function getEdgeFunctionHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...clientPlatformHeader(),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (DEV_MODE) {
    const { DEV_USER } = await import('@/config/devMode');
    headers['x-dev-user-id'] = DEV_USER.id;
  }
  return headers;
}

export function clearTokenCache(): void {
  cachedToken = null;
  cachedTokenExpiresAt = 0;
  inflightTokenPromise = null;
  console.log('[authTokenService] Cache cleared');
}

function emitTokenRefreshed() {
  try {
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mm:auth-token-refreshed'));
    }
  } catch { /* */ }
}

// Detect successful token acquisitions by polling the cache expiry — when
// it advances, a fresh token has just landed in the cache. Fires a window
// event the sync orchestrator subscribes to. Cheap and side-effect free.
if (typeof window !== 'undefined') {
  let lastSeenExpiry = 0;
  setInterval(() => {
    if (cachedTokenExpiresAt > lastSeenExpiry) {
      lastSeenExpiry = cachedTokenExpiresAt;
      emitTokenRefreshed();
    }
  }, 10_000);
}
