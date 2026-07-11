import { decideTravelFreshness } from "./travel/freshness.ts";

interface TravelTimezoneRow {
  state?: string | null;
  last_known_timezone?: string | null;
  meta?: Record<string, unknown> | null;
  updated_at?: string | null;
  last_state_change_at?: string | null;
  last_location_at?: string | null;
}

interface ProfileTimezoneRow {
  current_timezone?: string | null;
  home_timezone?: string | null;
}

interface TimezoneDb {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{ data: TravelTimezoneRow | null }>;
      };
    };
  };
}

export interface EffectiveTimezoneResult {
  effectiveTimezone: string;
  circadianTimezone: string;
  homeTimezone: string | null;
  isAway: boolean;
  travel: TravelTimezoneRow | null;
}

function isIanaTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch (_) {
    return false;
  }
}

export function localParts(timeZone: string, at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    localDate: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour === "24" ? "0" : p.hour),
    minute: Number(p.minute ?? "0"),
  };
}

/**
 * Batch B follow-up — fractional local hour of an event in an IANA
 * timezone. Replaces every notification-path use of
 * `new Date(event.start_time).getHours()`, which returns the server's
 * local hour (UTC on Supabase Edge Functions) — a real defect that
 * misclassifies events into morning/afternoon/evening for any user
 * whose effective timezone isn't UTC.
 */
export function eventHourInTimezone(
  eventStart: string | Date,
  timeZone: string,
): number {
  const at = typeof eventStart === "string" ? new Date(eventStart) : eventStart;
  const parts = localParts(timeZone, at);
  return parts.hour + parts.minute / 60;
}

/**
 * Batch B follow-up — convert a user-local YYYY-MM-DD day into the
 * UTC ISO half-open interval `[startUtc, endUtc)` that a calendar
 * query must use to fetch that day's events. Replaces unsafe
 * timezone-less boundary strings like `${localDate}T00:00:00`.
 */
export function localDayBoundsUtc(localDate: string, timeZone: string): {
  startUtc: string;
  endUtc: string;
} {
  // 12:00 local anchors are DST-safe for identifying "this local day".
  const noonUtcGuess = new Date(`${localDate}T12:00:00Z`);
  const offsetMin = timezoneOffsetMinutes(timeZone, noonUtcGuess);
  // local midnight (00:00) = UTC midnight - offset
  const startUtcMs = Date.UTC(
    Number(localDate.slice(0, 4)),
    Number(localDate.slice(5, 7)) - 1,
    Number(localDate.slice(8, 10)),
    0, 0, 0, 0,
  ) - offsetMin * 60_000;
  const endUtcMs = startUtcMs + 24 * 60 * 60_000;
  return {
    startUtc: new Date(startUtcMs).toISOString(),
    endUtc: new Date(endUtcMs).toISOString(),
  };
}

/**
 * Batch B follow-up — is the given local hour inside a DND window
 * that may cross midnight? Mirrors smart-nudges' inline helper so
 * every DND decision uses the same logic AND is unit-testable in
 * isolation.
 */
export function isHourInDndWindow(
  hour: number,
  dndStart: number | null | undefined,
  dndEnd: number | null | undefined,
): boolean {
  if (dndStart == null || dndEnd == null) return false;
  if (dndStart === dndEnd) return false;
  if (dndStart < dndEnd) return hour >= dndStart && hour < dndEnd;
  // crosses midnight (e.g. 21:30 -> 08:00)
  return hour >= dndStart || hour < dndEnd;
}

export function timezoneOffsetMinutes(timeZone: string, at = new Date()): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(dtf.formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((at.getTime() - asUtc) / 60000);
}

export async function resolveEffectiveTimezone(
  db: TimezoneDb,
  userId: string,
  profile: ProfileTimezoneRow | null | undefined,
  at = new Date(),
  options?: { respectTravelTimezone?: boolean },
): Promise<EffectiveTimezoneResult> {
  const { data: travel } = await db
    .from("travel_state")
    .select("state,last_known_timezone,meta,updated_at,last_state_change_at,last_location_at")
    .eq("user_id", userId)
    .maybeSingle();

  const profileCurrent = isIanaTimezone(profile?.current_timezone) ? profile.current_timezone : null;
  const profileHome = isIanaTimezone(profile?.home_timezone) ? profile.home_timezone : null;
  const travelTimezone = isIanaTimezone(travel?.last_known_timezone) ? travel.last_known_timezone : null;
  // Sprint 11 hardening: `updated_at` is bumped on skip-sync bookkeeping
  // and cannot be trusted as freshness. Gate BOTH the `isAway`
  // classification and the long-haul circadian override on the shared
  // travel-freshness helper, which reads only `last_state_change_at` /
  // `last_location_at`. Sprint 14: previously only the circadian override
  // used this guard; effective-timezone still trusted stale
  // `travel.state !== 'not_travelling'` rows, which could keep an old
  // "away" timezone active weeks after the last real signal.
  const freshness = decideTravelFreshness(
    travel
      ? {
          state: travel.state ?? null,
          lastStateChangeAt: travel.last_state_change_at ?? null,
          lastLocationAt: travel.last_location_at ?? null,
          now: at,
        }
      : null,
  );
  const travelStateAway = Boolean(travel?.state && travel.state !== "not_travelling");
  const isAway = travelStateAway && freshness.used;
  const respectTravelTimezone = options?.respectTravelTimezone !== false;
  const effectiveTimezone =
    (respectTravelTimezone && isAway && (travelTimezone || profileCurrent))
    || profileCurrent
    || profileHome
    || "UTC";

  let circadianTimezone = effectiveTimezone;
  const longHaul =
    typeof travel?.meta?.long_haul === "boolean"
      ? travel.meta.long_haul
      : typeof travel?.meta?.longHaul === "boolean"
        ? travel.meta.longHaul
        : false;

  if (isAway && longHaul && profileHome && freshness.used) {
    circadianTimezone = profileHome;
  }

  return {
    effectiveTimezone,
    circadianTimezone,
    homeTimezone: profileHome,
    isAway,
    travel: travel ?? null,
  };
}
