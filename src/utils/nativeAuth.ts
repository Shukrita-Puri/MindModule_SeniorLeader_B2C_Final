/**
 * Native (iOS Capacitor) authentication helpers.
 *
 * On iOS the Auth0 redirect flow bounces through Safari / SFSafariViewController.
 * The return deep-link uses the app's custom URL scheme so Capacitor can intercept
 * it via `App.addListener('appUrlOpen', …)` and route the WebView to /callback.
 */

import { Capacitor } from '@capacitor/core';

const APP_SCHEME = 'app.mindmodule.me';

// Module-level guards to prevent duplicate operations
let _nativeLoginInProgress = false;
let _listenerRegistered = false;

/** Key used in localStorage to signal that native auth just completed (survives reload) */
export const NATIVE_AUTH_COMPLETED_KEY = 'native_auth_completed';

/** Check if a native login flow is currently in progress */
export function isNativeLoginInProgress(): boolean {
  return _nativeLoginInProgress;
}

/** Check if native auth just completed (token exchange done, waiting for SDK pickup) */
export function isNativeAuthCompleted(): boolean {
  return localStorage.getItem(NATIVE_AUTH_COMPLETED_KEY) === 'true';
}

/** Clear the native auth completed flag (call after SDK confirms authenticated) */
export function clearNativeAuthCompleted(): void {
  localStorage.removeItem(NATIVE_AUTH_COMPLETED_KEY);
}

/** True when running inside Capacitor's native iOS shell */
export function isNativeiOS(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
}

/** True when running inside any Capacitor native shell */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Returns the correct Auth0 redirect_uri for the current platform.
 */
export function getRedirectUri(): string {
  if (isNativeiOS()) {
    return `${APP_SCHEME}://callback`;
  }
  return `${window.location.origin}/callback`;
}

/**
 * On iOS native, opens the Auth0 authorize URL in Capacitor's in-app browser
 * (SFSafariViewController) instead of doing a full-page redirect which would
 * leave the WebView and open Safari.
 *
 * Returns `true` if the native path was taken (caller should skip loginWithRedirect).
 * Returns `false` if on web (caller should proceed normally).
 */
export async function nativeLogin(options?: {
  returnTo?: string;
  screenHint?: 'signup' | 'login';
}): Promise<boolean> {
  if (!isNativeiOS()) return false;

  // Guard: don't open browser if login is already in progress or just completed
  if (_nativeLoginInProgress) {
    console.log('[NativeAuth] Login already in progress, skipping');
    return true; // return true so caller doesn't fall through to web flow
  }
  if (isNativeAuthCompleted()) {
    console.log('[NativeAuth] Auth recently completed (pending SDK pickup), skipping');
    return true;
  }

  const domain = import.meta.env.VITE_AUTH0_DOMAIN;
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
  const audience = import.meta.env.VITE_AUTH0_AUDIENCE || `https://${domain}/api/v2/`;

  if (!domain || !clientId) {
    console.error('[NativeAuth] Missing Auth0 env vars, falling back to web flow');
    return false;
  }

  // Store return path for post-auth redirect
  const returnTo = options?.returnTo || '/executive-home';
  sessionStorage.setItem('auth0_return_to', returnTo);

  // Generate PKCE code_verifier + code_challenge
  const codeVerifier = generateRandomString(64);
  const codeChallenge = await sha256Base64Url(codeVerifier);
  const state = generateRandomString(32);

  // Store PKCE verifier + state so Auth0 SDK can complete the exchange
  // Auth0 SPA SDK stores these, but since we're bypassing it we store manually
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

  if (options?.screenHint) {
    params.set('screen_hint', options.screenHint);
  }

  const authorizeUrl = `https://${domain}/authorize?${params.toString()}`;
  console.log('[NativeAuth] Opening in-app browser:', authorizeUrl);

  _nativeLoginInProgress = true;

  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url: authorizeUrl, presentationStyle: 'popover' });
    return true;
  } catch (e) {
    _nativeLoginInProgress = false;
    console.error('[NativeAuth] Failed to open in-app browser:', e);
    return false;
  }
}

/** Reset the in-progress flag (call after callback completes or fails) */
export function clearNativeLoginInProgress(): void {
  _nativeLoginInProgress = false;
}

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

/**
 * Initialise the Capacitor deep-link listener that captures the Auth0
 * callback on iOS and feeds it back into the WebView so the Auth0 SDK
 * can exchange the authorisation code.
 *
 * Call once at app startup (main.tsx).
 */
export async function initNativeAuthListener(): Promise<void> {
  if (!isNativeiOS()) return;

  // Guard: register only once
  if (_listenerRegistered) {
    console.log('[NativeAuth] Deep-link listener already registered, skipping');
    return;
  }
  _listenerRegistered = true;

  try {
    const { App } = await import('@capacitor/app');
    const { Browser } = await import('@capacitor/browser');

    App.addListener('appUrlOpen', async ({ url }) => {
      console.log('[NativeAuth] 📥 appUrlOpen fired. URL:', url);

      // Only handle our callback scheme
      if (!url.startsWith(`${APP_SCHEME}://callback`)) {
        console.log('[NativeAuth] Ignoring non-callback URL:', url);
        return;
      }

      console.log('[NativeAuth] ✅ Callback URL matched, processing...');

      try {
        await Browser.close();
        console.log('[NativeAuth] Browser closed successfully');
      } catch (e) {
        console.warn('[NativeAuth] Browser.close() failed (may already be closed):', e);
      }

      // Extract query and navigate WebView to /callback
      const callbackUrl = new URL(url);
      const webPath = `/callback${callbackUrl.search}`;
      console.log('[NativeAuth] Navigating WebView to:', webPath);

      // Use setTimeout to let Browser.close() settle before navigation
      setTimeout(() => {
        window.location.href = webPath;
      }, 100);
    });

    console.log('[NativeAuth] ✅ Deep-link listener registered');
  } catch (e) {
    console.error('[NativeAuth] Failed to register deep-link listener:', e);
  }
}
