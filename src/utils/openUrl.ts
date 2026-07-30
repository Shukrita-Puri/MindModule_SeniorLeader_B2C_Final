import { isNativeApp } from '@/utils/healthKitCapacitor';

export async function openUrl(url: string): Promise<void> {
  if (isNativeApp()) {
    const { Browser } = await import('@capacitor/browser');

    let pageListener: { remove: () => Promise<void> } | null = null;
    let finishedListener: { remove: () => Promise<void> } | null = null;

    const cleanup = async () => {
      try { if (pageListener) await pageListener.remove(); } catch {}
      try { if (finishedListener) await finishedListener.remove(); } catch {}
    };

    try {
      pageListener = await Browser.addListener('browserPageLoaded', (async (event: any) => {
        const loadedUrl = (event?.url as string) || '';
        if (
          loadedUrl.includes('calendar_connected=') ||
          loadedUrl.includes('oura_connected=') ||
          loadedUrl.includes('connected=') ||
          loadedUrl.includes('onboarding/permissions') ||
          loadedUrl.includes('connected-data') ||
          loadedUrl.includes('reason=')
        ) {
          console.log('[openUrl] OAuth redirect detected in In-App Browser, closing browser:', loadedUrl);
          await cleanup();
          try {
            await Browser.close();
          } catch {}
          window.dispatchEvent(new CustomEvent('mm:connections-changed'));
        }
      }) as unknown as () => void);

      finishedListener = await Browser.addListener('browserFinished', async () => {
        await cleanup();
        window.dispatchEvent(new CustomEvent('mm:connections-changed'));
      });
    } catch (e) {
      console.warn('[openUrl] Browser listeners warning:', e);
    }

    await Browser.open({ url, presentationStyle: 'popover' });
  } else {
    window.location.href = url;
  }
}
