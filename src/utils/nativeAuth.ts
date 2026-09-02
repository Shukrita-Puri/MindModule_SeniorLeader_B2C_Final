/**
 * Native (iOS Capacitor) authentication helpers – Singleton manager.
 *
 * Prevents duplicate Browser.open calls, duplicate listeners, and
 * login loops during callback handling.
 */

import { Capacitor } from '@capacitor/core';
import { clearNativeBackgroundAuthToken, updateNativeBackgroundAuthToken } from '@/utils/nativeBackgroundSync';

// ─── Constants ──────────────────────────────────────────────────────

const APP_SCHEME = 'app.mindmodule.me';

/** Centralised redirect URI – used in authorize URL AND token exchange */
export const AUTH0_NATIVE_REDIRECT_URI = `${APP_SCHEME}://callback`;
export const NATIVE_AUTH_CANCELLED_EVENT = 'native-auth-cancelled';

// ─── Environment helpers ────────────────────────────────────────────

export function getSanitisedAuth0Domain(): string {
  let raw = import.meta.env.VITE_AUTH0_DOMAIN || '';
  raw = raw.trim();
  raw = raw.replace(/^https?:\/\//i, '');
  raw = raw.replace(/\/+$/, '');
  return raw;
}

export function getSanitisedAuth0Audience(): string {
  let raw = import.meta.env.VITE_AUTH0_AUDIENCE || '';
  raw = raw.trim();
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }
  return raw;
}

let _domainLogged = false;
export function logAuth0Domain(): void {
  if (_domainLogged) return;
  _domainLogged = true;
  const domain = getSanitisedAuth0Domain();
  console.log(`[NativeAuth] Auth0 domain resolved to: "${domain}"`);
  if (!domain) console.error('[NativeAuth] ⚠️ VITE_AUTH0_DOMAIN is empty!');
}

// ─── Singleton flags ────────────────────────────────────────────────
let _loginInProgress = false;
let _safariPresented = false;
let _callbackInProgress = false;
let _listenerRegistered = false;
let _loginStartedAt: number | null = null;
let _browserListenerRegistered = false;

/** Outcome returned from nativeLogin so callers can react appropriately. */
export type NativeLoginStatus =
  | 'opened'
  | 'already_busy'
  | 'completed_pending_hydration'
  | 'recoverable_session'
  | 'not_native'
  | 'failed'
  | 'cancelled';

export interface NativeLoginResult {
  status: NativeLoginStatus;
  error?: string;
}

/**
 * Returns true when a NativeLoginResult should stop the caller from falling
 * through to the web `loginWithRedirect` flow (i.e. native handled it or is
 * in a state where web fallback would be wrong). Returns false on
 * `not_native` and `failed` so the caller can decide what to do next.
 */
export function nativeLoginHandled(result: NativeLoginResult): boolean {
  return result.status !== 'not_native' && result.status !== 'failed';
}

/** Key used in localStorage to signal that native auth just completed (survives reload) */
export const NATIVE_AUTH_COMPLETED_KEY = 'native_auth_completed';
const NATIVE_TOKENS_KEY = 'native_auth_tokens';

// ─── Flag accessors ─────────────────────────────────────────────────

export function isLoginInProgress(): boolean { return _loginInProgress; }
export function isSafariPresented(): boolean { return _safariPresented; }
export function isCallbackInProgress(): boolean { return _callbackInProgress; }

export function setCallbackInProgress(v: boolean): void {
  _callbackInProgress = v;
  console.log('[NativeAuth] callbackInProgress =', v);
}

export function clearNativeLoginInProgress(): void {
  _loginInProgress = false;
  _safariPresented = false;
  _loginStartedAt = null;
  console.log('[NativeAuth] loginInProgress + safariPresented cleared');
}

/** True if ANY native auth operation is active (login, safari, or callback) */
export function isNativeAuthBusy(): boolean {
  return _loginInProgress || _safariPresented || _callbackInProgress;
}

/**
 * Returns true if native login flags have been busy for longer than the given
 * threshold (ms) without a callback in progress. Used by Stage8/Signup to
 * detect stale flags and offer a retry.
 */
export function isNativeAuthStale(thresholdMs: number = 15000): boolean {
  if (_callbackInProgress) return false;
  if (!_loginInProgress && !_safariPresented) return false;
  if (_loginStartedAt == null) return true;
  return Date.now() - _loginStartedAt > thresholdMs;
}

/**
 * Force-clear stale native auth state for retry. Will NOT clear if a
 * callback is actively in progress (to avoid interrupting a real exchange).
 * Returns true if state was cleared.
 */
export function resetStaleNativeAuth(): boolean {
  if (_callbackInProgress) {
    console.log('[NativeAuth] resetStaleNativeAuth skipped – callback in progress');
    return false;
  }
  _loginInProgress = false;
  _safariPresented = false;
  _loginStartedAt = null;
  // Also clear the completed flag if no tokens actually landed
  try {
    const hasTokens = !!localStorage.getItem(NATIVE_TOKENS_KEY);
    if (!hasTokens) {
      localStorage.removeItem(NATIVE_AUTH_COMPLETED_KEY);
    }
  } catch { /* ignore */ }
  console.log('[NativeAuth] Stale native auth state reset');
  return true;
}

// ─── Native auth completed flag (localStorage, survives reload) ─────

export function isNativeAuthCompleted(): boolean {
  return localStorage.getItem(NATIVE_AUTH_COMPLETED_KEY) === 'true';
}

export function clearNativeAuthCompleted(): void {
  localStorage.removeItem(NATIVE_AUTH_COMPLETED_KEY);
}

// ─── Token store ────────────────────────────────────────────────────

export function storeNativeTokens(tokens: {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_in: number;
}): void {
  const entry = {
    access_token: tokens.access_token,
    id_token: tokens.id_token,
    refresh_token: tokens.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
  };
  localStorage.setItem(NATIVE_TOKENS_KEY, JSON.stringify(entry));
  const domain = import.meta.env.VITE_AUTH0_DOMAIN || '';
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID || '';
  updateNativeBackgroundAuthToken(entry.access_token, entry.expires_at, entry.refresh_token, domain, clientId);
  console.log('[NativeAuth] Tokens stored, expires_at:', entry.expires_at);
}

/**
 * Get native tokens. IMPORTANT: Does NOT clear expired tokens if a
 * refresh_token is present – the caller (useAuth) should attempt refresh.
 * Only clears if there is no way to recover (no refresh_token + expired).
 */
export function getNativeTokens(): {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_at: number;
} | null {
  const raw = localStorage.getItem(NATIVE_TOKENS_KEY);
  if (!raw) return null;
  try {
    const tokens = JSON.parse(raw);
    const now = Math.floor(Date.now() / 1000);
    if (tokens.expires_at < now) {
      // Expired – but if refresh_token exists, KEEP them for refresh attempt
      if (tokens.refresh_token) {
        console.log('[NativeAuth] Access token expired but refresh_token available – keeping for refresh');
        return tokens;
      }
      console.log('[NativeAuth] Stored tokens expired (no refresh_token), clearing');
      localStorage.removeItem(NATIVE_TOKENS_KEY);
      return null;
    }
    return tokens;
  } catch {
    localStorage.removeItem(NATIVE_TOKENS_KEY);
    return null;
  }
}

/**
 * Returns true if native tokens exist in localStorage (even expired),
 * as long as there's a refresh_token that could recover the session.
 * Used by ProtectedRoute to avoid premature login redirect.
 */
export function hasRecoverableNativeSession(): boolean {
  const raw = localStorage.getItem(NATIVE_TOKENS_KEY);
  if (!raw) return false;
  try {
    const tokens = JSON.parse(raw);
    return !!(tokens.refresh_token || tokens.expires_at > Math.floor(Date.now() / 1000));
  } catch {
    return false;
  }
}

export function clearNativeTokens(): void {
  localStorage.removeItem(NATIVE_TOKENS_KEY);
  clearNativeBackgroundAuthToken();
}

// ─── JWT helpers ────────────────────────────────────────────────────

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

// ─── Platform checks ───────────────────────────────────────────────

export function isNativeiOS(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
}

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function getRedirectUri(): string {
  if (isNativeApp()) return AUTH0_NATIVE_REDIRECT_URI;
  return `${window.location.origin}/callback`;
}

// ─── Robust callback URL parser ─────────────────────────────────────

export function parseCallbackParams(url: string): {
  code: string | null;
  state: string | null;
  error: string | null;
  error_description: string | null;
} {
  const callbackIdx = url.indexOf('callback');
  const suffix = callbackIdx >= 0 ? url.slice(callbackIdx + 'callback'.length) : '';

  const tryParse = (raw: string): URLSearchParams => {
    const cleaned = raw.replace(/^[?#]/, '');
    return new URLSearchParams(cleaned);
  };

  let params: URLSearchParams;

  const hashIdx = suffix.indexOf('#');
  const queryIdx = suffix.indexOf('?');

  if (queryIdx >= 0) {
    const queryStr = hashIdx >= 0 && hashIdx > queryIdx
      ? suffix.slice(queryIdx, hashIdx)
      : suffix.slice(queryIdx);
    params = tryParse(queryStr);
    if (!params.get('code') && hashIdx >= 0) {
      const hashParams = tryParse(suffix.slice(hashIdx));
      if (hashParams.get('code')) params = hashParams;
    }
  } else if (hashIdx >= 0) {
    params = tryParse(suffix.slice(hashIdx));
  } else {
    params = new URLSearchParams();
  }

  return {
    code: params.get('code'),
    state: params.get('state'),
    error: params.get('error'),
    error_description: params.get('error_description'),
  };
}

// ─── Native token refresh helper ────────────────────────────────────

let _refreshInProgress: Promise<boolean> | null = null;

/**
 * Attempt to refresh expired native tokens using the stored refresh_token.
 * Returns true if refresh succeeded and tokens were updated.
 * Deduplicates concurrent calls.
 */
export async function refreshNativeTokens(): Promise<boolean> {
  if (_refreshInProgress) return _refreshInProgress;

  _refreshInProgress = (async () => {
    const raw = localStorage.getItem(NATIVE_TOKENS_KEY);
    if (!raw) return false;
    try {
      const stored = JSON.parse(raw);
      if (!stored.refresh_token) return false;

      console.log('[NativeAuth] 🔄 Attempting native token refresh...');
      const domain = getSanitisedAuth0Domain();
      const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;

      const resp = await fetch(`https://${domain}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          client_id: clientId,
          refresh_token: stored.refresh_token,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const entry = {
          access_token: data.access_token,
          id_token: data.id_token || stored.id_token,
          refresh_token: data.refresh_token || stored.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 86400),
        };
        localStorage.setItem(NATIVE_TOKENS_KEY, JSON.stringify(entry));
        const domain = import.meta.env.VITE_AUTH0_DOMAIN || '';
        const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID || '';
        updateNativeBackgroundAuthToken(entry.access_token, entry.expires_at, entry.refresh_token, domain, clientId);
        console.log('[NativeAuth] ✅ Native tokens refreshed successfully');
        return true;
      } else {
        const errText = await resp.text();
        console.warn('[NativeAuth] ❌ Native token refresh failed:', resp.status, errText);
        // If refresh token is revoked/invalid, clear everything
        if (resp.status === 403 || resp.status === 401) {
          console.log('[NativeAuth] Refresh token invalid, clearing native auth state');
          localStorage.removeItem(NATIVE_TOKENS_KEY);
          localStorage.removeItem(NATIVE_AUTH_COMPLETED_KEY);
        }
        return false;
      }
    } catch (e) {
      console.warn('[NativeAuth] Native token refresh error:', e);
      return false;
    } finally {
      _refreshInProgress = null;
    }
  })();

  return _refreshInProgress;
}

// ─── Login (Browser.open) ───────────────────────────────────────────

export async function nativeLogin(options?: {
  returnTo?: string;
  screenHint?: 'signup' | 'login';
  connection?: string;
}): Promise<NativeLoginResult> {
  if (!isNativeApp()) return { status: 'not_native' };

  if (_loginInProgress || _safariPresented || _callbackInProgress) {
    console.log('[NativeAuth] Login blocked – loginInProgress:', _loginInProgress,
      'safariPresented:', _safariPresented, 'callbackInProgress:', _callbackInProgress);
    return { status: 'already_busy' };
  }

  if (isNativeAuthCompleted()) {
    if (hasRecoverableNativeSession()) {
      console.log('[NativeAuth] Auth already completed (pending hydration), skipping login');
      return { status: 'completed_pending_hydration' };
    }

    console.warn('[NativeAuth] Stale completed flag without recoverable tokens – clearing before login');
    clearNativeAuthCompleted();
  }

  // Check if we have recoverable tokens before opening login
  if (hasRecoverableNativeSession()) {
    console.log('[NativeAuth] Recoverable native session exists, skipping login – will attempt refresh');
    return { status: 'recoverable_session' };
  }

  const domain = getSanitisedAuth0Domain();
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
  const audience = getSanitisedAuth0Audience();

  if (!domain || !clientId) {
    console.error('[NativeAuth] Missing Auth0 env vars');
    return { status: 'failed', error: 'missing_env' };
  }

  const returnTo = options?.returnTo || '/executive-home';
  sessionStorage.setItem('auth0_return_to', returnTo);

  // PKCE
  const codeVerifier = generateRandomString(64);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const state = generateRandomString(32);
  sessionStorage.setItem('native_auth_code_verifier', codeVerifier);
  sessionStorage.setItem('native_auth_state', state);

  const redirectUri = AUTH0_NATIVE_REDIRECT_URI;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'openid profile email offline_access',
    audience,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  if (options?.screenHint) params.set('screen_hint', options.screenHint);
  if (options?.connection) params.set('connection', options.connection);

  const authorizeUrl = `https://${domain}/authorize?${params.toString()}`;

  _loginInProgress = true;
  _safariPresented = true;
  _loginStartedAt = Date.now();
  console.log('[NativeAuth] 🔐 Opening Safari for login...');

  try {
    const { Browser } = await import('@capacitor/browser');
    await registerBrowserCancelListener();
    await Browser.open({ url: authorizeUrl, presentationStyle: 'fullscreen' });
    console.log('[NativeAuth] ✅ Browser.open succeeded');
    return { status: 'opened' };
  } catch (e) {
    _loginInProgress = false;
    _safariPresented = false;
    _loginStartedAt = null;
    console.error('[NativeAuth] ❌ Browser.open failed:', e);
    return { status: 'failed', error: String(e) };
  }
}

/**
 * Register a one-time listener for Capacitor Browser close/finished events.
 * When the user dismisses the Auth0 in-app browser without completing signup,
 * this clears _loginInProgress / _safariPresented so retry is possible.
 * _callbackInProgress is left untouched so an active token exchange isn't
 * interrupted.
 */
async function registerBrowserCancelListener(): Promise<void> {
  if (_browserListenerRegistered) return;
  _browserListenerRegistered = true;
  try {
    const { Browser } = await import('@capacitor/browser');
    Browser.addListener('browserFinished', () => {
      console.log('[NativeAuth] browserFinished – clearing login flags (callback untouched)');
      const wasCallbackActive = _callbackInProgress;
      _loginInProgress = false;
      _safariPresented = false;
      _loginStartedAt = null;
      if (!wasCallbackActive) {
        window.dispatchEvent(new CustomEvent(NATIVE_AUTH_CANCELLED_EVENT));
      }
    });
  } catch (e) {
    console.warn('[NativeAuth] Could not register browser cancel listener:', e);
  }
}

// ─── Deep-link listener (register once) ─────────────────────────────

export async function initNativeAuthListener(): Promise<void> {
  if (!isNativeApp()) return;
  if (_listenerRegistered) {
    console.log('[NativeAuth] Listener already registered, skipping');
    return;
  }
  _listenerRegistered = true;

  logAuth0Domain();

  try {
    const { App } = await import('@capacitor/app');
    const { Browser } = await import('@capacitor/browser');

    App.addListener('appUrlOpen', async ({ url }) => {
      console.log('[NativeAuth] 📥 appUrlOpen FULL URL:', url);

      if (!url.includes(`${APP_SCHEME}://callback`)) {
        console.log('[NativeAuth] Ignoring non-callback URL');
        return;
      }

      const parsed = parseCallbackParams(url);
      console.log('[NativeAuth] Parsed callback params:', JSON.stringify(parsed));

      if (parsed.error) {
        console.error('[NativeAuth] Auth0 returned error:', parsed.error, parsed.error_description);
        _callbackInProgress = false;
        clearNativeLoginInProgress();
        try { await Browser.close(); } catch { /* ignore */ }
        _safariPresented = false;
        window.location.href = `/callback?error=${encodeURIComponent(parsed.error)}&error_description=${encodeURIComponent(parsed.error_description || '')}`;
        return;
      }

      if (!parsed.code || !parsed.state) {
        console.error('[NativeAuth] ❌ Callback URL missing code/state!');
        clearNativeLoginInProgress();
        try { await Browser.close(); } catch { /* ignore */ }
        _safariPresented = false;
        window.location.href = '/callback?error=missing_params&error_description=Callback+URL+did+not+contain+code+or+state';
        return;
      }

      _callbackInProgress = true;
      console.log('[NativeAuth] ✅ Callback URL matched with code+state, callbackInProgress=true');

      try {
        await Browser.close();
        _safariPresented = false;
      } catch (e) {
        _safariPresented = false;
        console.warn('[NativeAuth] Browser.close() failed:', e);
      }

      const webPath = `/callback?code=${encodeURIComponent(parsed.code)}&state=${encodeURIComponent(parsed.state)}`;
      setTimeout(() => {
        window.location.href = webPath;
      }, 150);
    });

    console.log('[NativeAuth] ✅ Deep-link listener registered (once)');
  } catch (e) {
    console.error('[NativeAuth] Failed to register listener:', e);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, length);
}

async function sha256Base64Url(plain: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
