/**
 * Native (iOS Capacitor) authentication helpers.
 *
 * On iOS the Auth0 redirect flow bounces through Safari / SFSafariViewController.
 * The return deep-link uses the app's custom URL scheme so Capacitor can intercept
 * it via `App.addListener('appUrlOpen', …)` and route the WebView to /callback.
 */

const APP_SCHEME = 'app.mindmodule.me';

/** True when running inside Capacitor's native iOS shell */
export function isNativeiOS(): boolean {
  const cap = (window as any).Capacitor;
  return !!cap?.isNativePlatform && cap.getPlatform?.() === 'ios';
}

/** True when running inside any Capacitor native shell */
export function isNativeApp(): boolean {
  return !!(window as any).Capacitor?.isNativePlatform;
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

  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url: authorizeUrl, presentationStyle: 'popover' });
    return true;
  } catch (e) {
    console.error('[NativeAuth] Failed to open in-app browser:', e);
    return false;
  }
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

  try {
    const { App } = await import('@capacitor/app');
    const { Browser } = await import('@capacitor/browser');

    App.addListener('appUrlOpen', async ({ url }) => {
      console.log('[NativeAuth] appUrlOpen received:', url);

      // Only handle our callback scheme
      if (!url.startsWith(`${APP_SCHEME}://callback`)) {
        console.log('[NativeAuth] Ignoring non-callback URL');
        return;
      }

      try {
        // Close the in-app browser that was showing the Auth0 login
        await Browser.close();
        console.log('[NativeAuth] Browser closed');
      } catch (e) {
        console.warn('[NativeAuth] Browser.close() failed (may already be closed):', e);
      }

      // Extract the path + query from the deep-link and navigate the WebView
      // e.g.  app.lovable…://callback?code=XYZ&state=ABC  →  /callback?code=XYZ&state=ABC
      const callbackUrl = new URL(url);
      const webPath = `/callback${callbackUrl.search}`;
      console.log('[NativeAuth] Navigating WebView to:', webPath);
      window.location.href = webPath;
    });

    console.log('[NativeAuth] ✅ Deep-link listener registered');
  } catch (e) {
    console.error('[NativeAuth] Failed to register deep-link listener:', e);
  }
}
