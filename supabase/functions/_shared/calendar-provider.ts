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
 * ONE calendar feed for the whole app, on every platform.
 *
 * Google / Microsoft / Apple all exist on iOS as well as on web, so there is
 * no "primary" and "secondary" calendar: every connected calendar contributes
 * events. The ONLY collapse rule is duplicate-invite collapse — when the same
 * slot (same title, same start, same duration → same `identity_key`) appears
 * under more than one provider, keep a single copy, preferring
 * apple > google > microsoft.
 *
 * `primary_calendar_events` implements exactly that
 * (DISTINCT ON (user_id, identity_key) ORDER BY apple > google > microsoft).
 * The old `web_primary_calendar_events` view kept a SINGLE provider and threw
 * every other calendar away — that model is retired; the view stays in the DB
 * (unused) for one release as a rollback and is dropped in a follow-up.
 */
export function primaryCalendarEventsView(_platform: ClientPlatform = 'unknown'): string {
  return 'primary_calendar_events';
}

/**
 * Retained for call-site compatibility: every platform now reads the same
 * unified view, so this is a passthrough.
 */
export function wrapDbWithCalendarPrimacy<T extends { from: (table: string) => any }>(
  db: T,
  _platform: ClientPlatform,
): T {
  return db;
}