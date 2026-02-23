/**
 * Native (iOS Capacitor) authentication helpers.
 *
 * On iOS the Auth0 redirect flow bounces through Safari / SFSafariViewController.
 * The return deep-link uses the app's custom URL scheme so Capacitor can intercept
 * it via `App.addListener('appUrlOpen', …)` and route the WebView to /callback.
 */

const APP_SCHEME = 'app.lovable.eb63fb97dcc84fc58148517646438c6d';

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
 * - iOS native → custom-scheme callback
 * - Everything else → web origin callback
 */
export function getRedirectUri(): string {
  if (isNativeiOS()) {
    return `${APP_SCHEME}://callback`;
  }
  return `${window.location.origin}/callback`;
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
