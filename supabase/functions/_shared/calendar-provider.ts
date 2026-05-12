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
  // Prefer explicit headers — `x-client-platform` is our app-set hint, while
  // `x-supabase-client-platform` is auto-set by @supabase/supabase-js. The iOS
  // Capacitor wrapper overrides the latter via fetch headers in nativeAuth.
  const hints = [
    headers.get('x-client-platform'),
    headers.get('X-Client-Platform'),
    headers.get('x-supabase-client-platform'),
    headers.get('X-Supabase-Client-Platform'),
  ].filter(Boolean).map((v) => String(v).toLowerCase());
  for (const h of hints) {
    if (h === 'ios' || h === 'capacitor-ios' || h === 'native-ios') return 'ios';
    if (h === 'web' || h === 'browser') return 'web';
  }
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

/**
 * Wrap a Supabase client so that any `.from('primary_calendar_events')`
 * call is transparently rewritten to the platform-correct view. Lets edge
 * functions thread platform once at the serve() entry without touching
 * every helper that already references the iOS-default view name.
 */
export function wrapDbWithCalendarPrimacy<T extends { from: (table: string) => any }>(
  db: T,
  platform: ClientPlatform,
): T {
  if (platform !== 'web') return db; // iOS / unknown keep the default view
  const targetView = primaryCalendarEventsView(platform);
  const handler: ProxyHandler<any> = {
    get(target, prop, receiver) {
      if (prop === 'from') {
        return (table: string) =>
          table === 'primary_calendar_events'
            ? target.from(targetView)
            : target.from(table);
      }
      return Reflect.get(target, prop, receiver);
    },
  };
  return new Proxy(db, handler) as T;
}