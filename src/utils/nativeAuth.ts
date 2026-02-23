/**
 * Native (iOS Capacitor) authentication helpers — Singleton manager.
 *
 * Prevents duplicate Browser.open calls, duplicate listeners, and
 * login loops during callback handling.
 */

import { Capacitor } from '@capacitor/core';

const APP_SCHEME = 'app.mindmodule.me';

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
  if (isNativeiOS()) return `${APP_SCHEME}://callback`;
  return `${window.location.origin}/callback`;
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

  const domain = import.meta.env.VITE_AUTH0_DOMAIN;
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
  const audience = import.meta.env.VITE_AUTH0_AUDIENCE || `https://${domain}/api/v2/`;

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

  const redirectUri = getRedirectUri();
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

  try {
    const { App } = await import('@capacitor/app');
    const { Browser } = await import('@capacitor/browser');

    App.addListener('appUrlOpen', async ({ url }) => {
      console.log('[NativeAuth] 📥 appUrlOpen:', url);

      if (!url.startsWith(`${APP_SCHEME}://callback`)) {
        console.log('[NativeAuth] Ignoring non-callback URL');
        return;
      }

      // Mark callback in progress immediately — prevents ProtectedRoute from triggering login
      _callbackInProgress = true;
      console.log('[NativeAuth] ✅ Callback URL matched, callbackInProgress=true');

      try {
        await Browser.close();
        _safariPresented = false;
        console.log('[NativeAuth] Browser closed, safariPresented=false');
      } catch (e) {
        _safariPresented = false;
        console.warn('[NativeAuth] Browser.close() failed (may already be closed):', e);
      }

      const callbackUrl = new URL(url);
      const webPath = `/callback${callbackUrl.search}`;
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
