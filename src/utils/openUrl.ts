/**
 * Opens a URL using Capacitor's in-app browser on native platforms,
 * or via window.location.href on web.
 */
import { isNativeApp } from '@/utils/healthKitCapacitor';

export async function openUrl(url: string): Promise<void> {
  if (isNativeApp()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url, presentationStyle: 'popover' });
  } else {
    window.location.href = url;
  }
}
