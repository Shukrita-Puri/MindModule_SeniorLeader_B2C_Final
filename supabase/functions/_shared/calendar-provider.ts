// Platform-aware calendar primacy.
//
//   iOS native:  Apple > Google > Microsoft. The device-level Apple Calendar
//                already aggregates Google/MS subscriptions, so Apple is the
//                single source of truth and the others are mirror noise.
//   Web:         Google > Microsoft > Apple. There is no aggregator, so the
//                native cloud calendars win and the Apple-mirrored copy is
//                shown as connected but de-prioritised in selection.
//
// Cross-provider duplicates are still collapsed by title+startMs in
// dedupeCalendarEvents() — this primacy only controls which provider's row
// is retained when titles tie.

export type CalendarProvider = 'apple' | 'google' | 'microsoft';
export type ClientPlatform = 'ios' | 'web' | 'unknown';

const PRECEDENCE_BY_PLATFORM: Record<ClientPlatform, CalendarProvider[]> = {
  ios:     ['apple', 'google', 'microsoft'],
  web:     ['google', 'microsoft', 'apple'],
  unknown: ['apple', 'google', 'microsoft'],
};

/**
 * Detect client platform from the request. iOS Capacitor wrappers send
 * `x-client-platform: ios`; we also fall back to a User-Agent sniff for
 * Capacitor / CFNetwork / iOS so older builds still resolve correctly.
 * Anything else is treated as web.
 */
export function detectClientPlatform(req: Request | { headers: Headers } | null | undefined): ClientPlatform {
  if (!req) return 'unknown';
  const headers = (req as any).headers as Headers | undefined;
  if (!headers) return 'unknown';
  const explicit = (headers.get('x-client-platform') || headers.get('X-Client-Platform') || '').toLowerCase();
  if (explicit === 'ios') return 'ios';
  if (explicit === 'web') return 'web';
  const ua = (headers.get('user-agent') || headers.get('User-Agent') || '').toLowerCase();
  if (!ua) return 'unknown';
  if (ua.includes('capacitor') || ua.includes('cfnetwork')) return 'ios';
  if (/(iphone|ipad|ipod)/.test(ua) && !ua.includes('safari/')) return 'ios';
  return 'web';
}

/**
 * Returns the primary calendar provider for a user given the calling
 * client platform, or null if none active. Use this provider as a
 * `.eq('provider', primary)` filter on calendar_events.
 */
export async function getPrimaryCalendarProvider(
  db: any,
  userId: string,
  platform: ClientPlatform = 'unknown',
): Promise<CalendarProvider | null> {
  const { data, error } = await db
    .from('calendar_connections')
    .select('provider')
    .eq('user_id', userId)
    .eq('is_active', true);
  if (error || !data) return null;
  const active = new Set<string>(data.map((r: { provider: string }) => r.provider));
  const precedence = PRECEDENCE_BY_PLATFORM[platform] ?? PRECEDENCE_BY_PLATFORM.unknown;
  for (const p of precedence) {
    if (active.has(p)) return p;
  }
  return null;
}

/**
 * Returns the database view name that already enforces calendar primacy
 * for the calling client platform. Edge functions should swap their
 * `.from('primary_calendar_events')` call for `.from(primaryCalendarEventsView(platform))`.
 *
 *   ios / unknown → primary_calendar_events     (apple > google > microsoft)
 *   web           → web_primary_calendar_events (google > microsoft > apple)
 */
export function primaryCalendarEventsView(platform: ClientPlatform = 'unknown'): string {
  return platform === 'web' ? 'web_primary_calendar_events' : 'primary_calendar_events';
}