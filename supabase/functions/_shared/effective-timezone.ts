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
  const isAway = Boolean(travel?.state && travel.state !== "not_travelling");
  const respectTravelTimezone = options?.respectTravelTimezone !== false;
  const effectiveTimezone =
    (respectTravelTimezone && isAway && (travelTimezone || profileCurrent))
    || profileCurrent
    || profileHome
    || "UTC";

  let circadianTimezone = effectiveTimezone;
  // Sprint 11 hardening: `updated_at` is bumped on skip-sync bookkeeping
  // and cannot be trusted as freshness. Gate long-haul circadian override
  // on the shared travel-freshness helper, which reads only
  // `last_state_change_at` / `last_location_at`.
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
