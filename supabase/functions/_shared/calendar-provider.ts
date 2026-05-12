// Cross-platform calendar primacy.
// Apple > Google > Microsoft. If a user has an active Apple connection
// (synced from their iOS device), Apple is the single source of truth for
// brief/nudges/readiness — Google and Microsoft are ignored even if active,
// to avoid double-counting (Apple Calendar typically already aggregates them).

export type CalendarProvider = 'apple' | 'google' | 'microsoft';

const PRECEDENCE: CalendarProvider[] = ['apple', 'google', 'microsoft'];

/**
 * Returns the primary calendar provider for a user, or null if none active.
 * Use this provider as a `.eq('provider', primary)` filter on calendar_events.
 */
export async function getPrimaryCalendarProvider(
  db: any,
  userId: string,
): Promise<CalendarProvider | null> {
  const { data, error } = await db
    .from('calendar_connections')
    .select('provider')
    .eq('user_id', userId)
    .eq('is_active', true);
  if (error || !data) return null;
  const active = new Set<string>(data.map((r: { provider: string }) => r.provider));
  for (const p of PRECEDENCE) {
    if (active.has(p)) return p;
  }
  return null;
}