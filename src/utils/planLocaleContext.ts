/**
 * planLocaleContext — client-side locale context sent to
 * `generate-mastery-plan`.
 *
 * The orchestrator resolves the plan window (weekend days, planning day,
 * local date) via `resolveUserLocaleContext`, which reads
 * `currentTimezone` / `homeTimezone` / `userHomeCountry` /
 * `userCurrentCountry` / `travelState` from the request body. The edge
 * function does NOT read these off the profile, so when the client omits
 * them the backend silently degrades to `UTC` + a Sat/Sun weekend — wrong
 * for Middle-East users and for anyone travelling.
 *
 * Source order per field:
 *   1. `profiles` (home_timezone / current_timezone / country)
 *   2. `travel_state` (state, last known timezone)
 *   3. device (`Intl` timezone, `navigator.language` region)
 */

import { supabase } from '@/integrations/supabase/client';
import { getCachedTravelState } from '@/services/travelStateService';

export interface PlanLocaleContext {
  timezoneOffset: number;
  currentTimezone: string | null;
  homeTimezone: string | null;
  userHomeCountry: string | null;
  userCurrentCountry: string | null;
  travelState: string | null;
}

export function deviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/** Best-effort ISO-3166 region from the browser locale (e.g. en-AE -> AE). */
export function deviceRegion(): string | null {
  try {
    const tag = typeof navigator !== 'undefined' ? navigator.language : null;
    if (!tag) return null;
    const region = new Intl.Locale(tag).region;
    return region ? region.toUpperCase() : null;
  } catch {
    return null;
  }
}

/** Device-only context — always safe, never throws, no network. */
export function deviceLocaleContext(): PlanLocaleContext {
  const tz = deviceTimezone();
  const cached = getCachedTravelState();
  return {
    timezoneOffset: new Date().getTimezoneOffset(),
    currentTimezone: cached?.lastKnownTimezone ?? tz,
    homeTimezone: tz,
    userHomeCountry: deviceRegion(),
    userCurrentCountry: deviceRegion(),
    travelState: cached?.state ?? null,
  };
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { userId: string; at: number; value: PlanLocaleContext } | null = null;

/**
 * Resolves the full locale context for a user. Falls back to the device
 * context on any failure so plan generation is never blocked.
 */
export async function getPlanLocaleContext(
  userId?: string | null,
): Promise<PlanLocaleContext> {
  const base = deviceLocaleContext();
  if (!userId) return base;

  if (cache && cache.userId === userId && Date.now() - cache.at < CACHE_TTL_MS) {
    // Offset can change across a DST boundary within the TTL.
    return { ...cache.value, timezoneOffset: new Date().getTimezoneOffset() };
  }

  try {
    const [{ data: profile }, { data: travel }] = await Promise.all([
      supabase
        .from('profiles')
        .select('home_timezone, current_timezone, country')
        .eq('id', userId)
        .maybeSingle(),
      (supabase as any)
        .from('travel_state')
        .select('state, last_known_timezone')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    const p = (profile ?? {}) as Record<string, unknown>;
    const t = (travel ?? {}) as Record<string, unknown>;

    const value: PlanLocaleContext = {
      timezoneOffset: base.timezoneOffset,
      currentTimezone:
        (t.last_known_timezone as string | null) ??
        (p.current_timezone as string | null) ??
        base.currentTimezone,
      homeTimezone: (p.home_timezone as string | null) ?? base.homeTimezone,
      userHomeCountry: (p.country as string | null) ?? base.userHomeCountry,
      userCurrentCountry: base.userCurrentCountry,
      travelState: (t.state as string | null) ?? base.travelState,
    };

    cache = { userId, at: Date.now(), value };
    return value;
  } catch (err) {
    console.warn('[planLocaleContext] profile query failed, using device fallback', err);
    return base;
  }
}

/** Test/reset helper. */
export function __resetPlanLocaleCache() {
  cache = null;
}
