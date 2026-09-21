/**
 * Anonymous, device-local install identifier.
 *
 * Not an identity: a random opaque string used only to count app opens and
 * screen time before sign-in. Never sent anywhere except the usage-tracking
 * endpoint. Fails soft — if storage is unavailable the caller simply gets a
 * per-session id and nothing breaks.
 */

const STORAGE_KEY = 'mm_install_id';
const FIRST_SEEN_KEY = 'mm_install_first_seen';

let memoryId: string | null = null;

function randomId(): string {
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

export function getInstallId(): string {
  if (memoryId) return memoryId;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && /^[A-Za-z0-9_-]{8,64}$/.test(stored)) {
      memoryId = stored;
      return stored;
    }
    const fresh = randomId();
    window.localStorage.setItem(STORAGE_KEY, fresh);
    window.localStorage.setItem(FIRST_SEEN_KEY, new Date().toISOString());
    memoryId = fresh;
    return fresh;
  } catch {
    memoryId = memoryId ?? randomId();
    return memoryId;
  }
}

export function isFirstEverLaunch(): boolean {
  try {
    return !window.localStorage.getItem(FIRST_SEEN_KEY);
  } catch {
    return false;
  }
}

export function getDeviceLocaleContext(): { timezone: string | null; locale: string | null; country: string | null } {
  let timezone: string | null = null;
  let locale: string | null = null;
  let country: string | null = null;
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions();
    timezone = resolved.timeZone ?? null;
    locale = resolved.locale ?? null;
    const parts = String(resolved.locale ?? '').split('-');
    const maybeRegion = parts.find((p) => /^[A-Z]{2}$/.test(p));
    country = maybeRegion ?? null;
  } catch {
    /* ignore */
  }
  return { timezone, locale, country };
}
