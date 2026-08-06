import { isNativeApp } from '@/utils/healthKitCapacitor';

/**
 * OAuth-completion URL patterns. When ANY of these appear in a URL loaded
 * inside the Capacitor In-App Browser (or received via `appUrlOpen` on
 * iOS), we close the browser and dispatch `mm:connections-changed` so the
 * provider-picker cards refresh.
 */
const OAUTH_DONE_PATTERNS = [
  'calendar_connected=',
  'oura_connected=',
  'connected=',
  'oauth-done',
  'oauth-complete',
  'onboarding/permissions',
  'connected-data',
  'reason=',
] as const;

function isOAuthDoneUrl(url: string): boolean {
  if (!url) return false;
  return OAUTH_DONE_PATTERNS.some((p) => url.includes(p));
}

export async function openUrl(url: string): Promise<void> {
  if (isNativeApp()) {
    const { Browser } = await import('@capacitor/browser');

    let pageListener: { remove: () => Promise<void> } | null = null;
    let finishedListener: { remove: () => Promise<void> } | null = null;
    let appUrlListener: { remove: () => Promise<void> } | null = null;
    let closed = false;

    const closeBrowserAndNotify = async () => {
      if (closed) return;
      closed = true;
      await cleanup();
      try { await Browser.close(); } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent('mm:connections-changed'));
    };

    const cleanup = async () => {
      try { if (pageListener) await pageListener.remove(); } catch {}
      try { if (finishedListener) await finishedListener.remove(); } catch {}
      try { if (appUrlListener) await appUrlListener.remove(); } catch {}
      pageListener = null;
      finishedListener = null;
      appUrlListener = null;
    };

    try {
      // ── Listener 1: browserPageLoaded (Android / web fallback) ──
      // On Android, SFSafariViewController is not used and the event
      // DOES expose the loaded URL. On iOS this event fires but url
      // is always empty/undefined — handled by Listener 3 instead.
      pageListener = await Browser.addListener('browserPageLoaded', (async (event: any) => {
        const loadedUrl = (event?.url as string) || '';
        if (isOAuthDoneUrl(loadedUrl)) {
          console.log('[openUrl] OAuth redirect detected via browserPageLoaded, closing:', loadedUrl);
          await closeBrowserAndNotify();
        }
      }) as unknown as () => void);

      // ── Listener 2: browserFinished (user tapped Done / X) ──
      finishedListener = await Browser.addListener('browserFinished', async () => {
        if (closed) return;
        closed = true;
        await cleanup();
        window.dispatchEvent(new CustomEvent('mm:connections-changed'));
      });

      // ── Listener 3: appUrlOpen (iOS Universal Link intercept) ──
      // On iOS, SFSafariViewController is sandboxed and does NOT expose
      // the loaded URL via browserPageLoaded. Instead, when the OAuth
      // callback redirects to a Universal Link (e.g. app.mindmodule.me),
      // iOS intercepts the navigation and fires appUrlOpen. We listen
      // for it here and close the browser + dispatch the refresh event.
      try {
        const { App } = await import('@capacitor/app');
        appUrlListener = await App.addListener('appUrlOpen', async ({ url: openedUrl }) => {
          console.log('[openUrl] appUrlOpen fired:', openedUrl);
          if (isOAuthDoneUrl(openedUrl)) {
            console.log('[openUrl] OAuth redirect detected via appUrlOpen, closing browser:', openedUrl);
            await closeBrowserAndNotify();
          }
        });
      } catch (e) {
        console.warn('[openUrl] appUrlOpen listener warning (non-fatal):', e);
      }
    } catch (e) {
      console.warn('[openUrl] Browser listeners warning:', e);
    }

    await Browser.open({ url, presentationStyle: 'popover' });
  } else {
    window.location.href = url;
  }
}
