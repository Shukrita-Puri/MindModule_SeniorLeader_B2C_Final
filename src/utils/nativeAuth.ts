/**
 * Native (iOS Capacitor) authentication helpers — Singleton manager.
 *
 * Prevents duplicate Browser.open calls, duplicate listeners, and
 * login loops during callback handling.
 *
 * ── Callback Health Check Test Plan ─────────────────────────────────
 * 1. Fresh install on iOS simulator + device:
 *    - Login → confirm callback URL captured with code/state in logs
 *    - Verify token exchange succeeds and user lands on /executive-home
 * 2. Wrong domain scenario:
 *    - Set VITE_AUTH0_DOMAIN to invalid value → clear error logged + toast
 * 3. User cancels (closes Safari without completing):
 *    - Verify no stuck flags; user can retry login
 * 4. Repeated login attempts:
 *    - Tap login multiple times quickly → only ONE Browser.open fires
 *    - No duplicate deep-link listeners registered
 * 5. Fragment vs query callback:
 *    - If Auth0 returns #code=...&state=..., verify parsing works
 * ────────────────────────────────────────────────────────────────────
 */

import { Capacitor } from '@capacitor/core';

// ─── Constants ──────────────────────────────────────────────────────

const APP_SCHEME = 'app.mindmodule.me';

/** Centralised redirect URI — used in authorize URL AND token exchange */
export const AUTH0_NATIVE_REDIRECT_URI = `${APP_SCHEME}://callback`;

// ─── Environment helpers ────────────────────────────────────────────

/**
 * Returns a sanitised Auth0 domain (hostname only).
 * Strips protocol, trailing slashes, and whitespace from VITE_AUTH0_DOMAIN.
 */
export function getSanitisedAuth0Domain(): string {
  let raw = import.meta.env.VITE_AUTH0_DOMAIN || '';
  raw = raw.trim();
  // Strip protocol if someone pasted a full URL
  raw = raw.replace(/^https?:\/\//i, '');
  // Strip trailing slashes
  raw = raw.replace(/\/+$/, '');
  return raw;
}

/**
 * Returns the Auth0 audience with https:// prefix guaranteed.
 * Handles env values that may or may not include the protocol.
 */
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
/** Log domain once at startup (no secrets) */
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
  console.log('[NativeAuth] loginInProgress + safariPresented cleared');
}

/** True if ANY native auth operation is active (login, safari, or callback) */
export function isNativeAuthBusy(): boolean {
  return _loginInProgress || _safariPresented || _callbackInProgress;
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
  console.log('[NativeAuth] Tokens stored');
}

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
    if (tokens.expires_at < Math.floor(Date.now() / 1000)) {
      console.log('[NativeAuth] Stored tokens expired, clearing');
      localStorage.removeItem(NATIVE_TOKENS_KEY);
      return null;
    }
    return tokens;
  } catch {
    localStorage.removeItem(NATIVE_TOKENS_KEY);
    return null;
  }
}

export function clearNativeTokens(): void {
  localStorage.removeItem(NATIVE_TOKENS_KEY);
}

// ─── JWT helpers ────────────────────────────────────────────────────

export function decodeJwtPayload(token: string): Record<string, any> | null {
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
  if (isNativeiOS()) return AUTH0_NATIVE_REDIRECT_URI;
  return `${window.location.origin}/callback`;
}

// ─── Robust callback URL parser ─────────────────────────────────────

/**
 * Extracts code, state, error, and error_description from a callback URL.
 * Handles both query-string (?...) and hash-fragment (#...) formats,
 * as well as custom-scheme URLs that may confuse the URL constructor.
 */
export function parseCallbackParams(url: string): {
  code: string | null;
  state: string | null;
  error: string | null;
  error_description: string | null;
} {
  // Try to extract the part after "callback" regardless of scheme
  const callbackIdx = url.indexOf('callback');
  const suffix = callbackIdx >= 0 ? url.slice(callbackIdx + 'callback'.length) : '';

  const tryParse = (raw: string): URLSearchParams => {
    // Strip leading ? or #
    const cleaned = raw.replace(/^[?#]/, '');
    return new URLSearchParams(cleaned);
  };

  // Check query string first, then hash fragment
  let params: URLSearchParams;

  const hashIdx = suffix.indexOf('#');
  const queryIdx = suffix.indexOf('?');

  if (queryIdx >= 0) {
    const queryStr = hashIdx >= 0 && hashIdx > queryIdx
      ? suffix.slice(queryIdx, hashIdx)
      : suffix.slice(queryIdx);
    params = tryParse(queryStr);
    // If code not in query, check hash
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

// ─── Login (Browser.open) ───────────────────────────────────────────

export async function nativeLogin(options?: {
  returnTo?: string;
  screenHint?: 'signup' | 'login';
}): Promise<boolean> {
  if (!isNativeiOS()) return false;

  // Guard: only one login attempt at a time
  if (_loginInProgress || _safariPresented || _callbackInProgress) {
    console.log('[NativeAuth] Login blocked — loginInProgress:', _loginInProgress,
      'safariPresented:', _safariPresented, 'callbackInProgress:', _callbackInProgress);
    return true; // tell caller not to fall through to web flow
  }

  if (isNativeAuthCompleted()) {
    console.log('[NativeAuth] Auth already completed (pending hydration), skipping login');
    return true;
  }

  const domain = getSanitisedAuth0Domain();
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
  const audience = getSanitisedAuth0Audience();

  if (!domain || !clientId) {
    console.error('[NativeAuth] Missing Auth0 env vars');
    return false;
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

  const authorizeUrl = `https://${domain}/authorize?${params.toString()}`;

  // Set BOTH flags before opening
  _loginInProgress = true;
  _safariPresented = true;
  console.log('[NativeAuth] 🔐 Opening Safari for login...');
  console.log('[NativeAuth] redirect_uri:', redirectUri);

  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url: authorizeUrl, presentationStyle: 'popover' });
    console.log('[NativeAuth] ✅ Browser.open succeeded');
    return true;
  } catch (e) {
    _loginInProgress = false;
    _safariPresented = false;
    console.error('[NativeAuth] ❌ Browser.open failed:', e);
    return false;
  }
}

// ─── Deep-link listener (register once) ─────────────────────────────

export async function initNativeAuthListener(): Promise<void> {
  if (!isNativeiOS()) return;
  if (_listenerRegistered) {
    console.log('[NativeAuth] Listener already registered, skipping');
    return;
  }
  _listenerRegistered = true;

  // Log domain once at startup
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

      // Parse params robustly BEFORE doing anything else
      const parsed = parseCallbackParams(url);
      console.log('[NativeAuth] Parsed callback params:', JSON.stringify(parsed));

      // Handle Auth0 errors
      if (parsed.error) {
        console.error('[NativeAuth] Auth0 returned error:', parsed.error, parsed.error_description);
        _callbackInProgress = false;
        clearNativeLoginInProgress();
        // Close browser
        try { await Browser.close(); } catch { /* ignore */ }
        _safariPresented = false;
        // Navigate to show error
        window.location.href = `/callback?error=${encodeURIComponent(parsed.error)}&error_description=${encodeURIComponent(parsed.error_description || '')}`;
        return;
      }

      if (!parsed.code || !parsed.state) {
        console.error('[NativeAuth] ❌ Callback URL missing code/state!');
        console.error('[NativeAuth] Diagnostic:', {
          receivedUrl: url,
          parsedCode: parsed.code,
          parsedState: parsed.state,
          expectedRedirectUri: AUTH0_NATIVE_REDIRECT_URI,
        });
        // Don't set callbackInProgress — let user retry
        clearNativeLoginInProgress();
        try { await Browser.close(); } catch { /* ignore */ }
        _safariPresented = false;
        window.location.href = '/callback?error=missing_params&error_description=Callback+URL+did+not+contain+code+or+state';
        return;
      }

      // Mark callback in progress — prevents ProtectedRoute from triggering login
      _callbackInProgress = true;
      console.log('[NativeAuth] ✅ Callback URL matched with code+state, callbackInProgress=true');

      // Close browser first
      try {
        await Browser.close();
        _safariPresented = false;
        console.log('[NativeAuth] Browser closed, safariPresented=false');
      } catch (e) {
        _safariPresented = false;
        console.warn('[NativeAuth] Browser.close() failed (may already be closed):', e);
      }

      // Build the internal navigation path with parsed params
      const webPath = `/callback?code=${encodeURIComponent(parsed.code)}&state=${encodeURIComponent(parsed.state)}`;
      console.log('[NativeAuth] Navigating WebView to:', webPath);

      // Short delay to let Safari dismiss before navigation
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
