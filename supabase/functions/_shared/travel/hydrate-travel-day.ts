/**
 * hydrate-travel-day.ts — one implementation of "is today a travel day?"
 * for every server surface (Brief, Mastery Plan, Smart Nudges).
 *
 * Reads the persisted `travel_state` row, applies the shared staleness
 * guard (`freshness.ts`), and hands the result to the SSOT predicate in
 * `travel-day.ts`. Distance from the home anchor (>50 km) is primary
 * evidence; a timezone change is sufficient on its own; a stale location
 * fix defers to the state machine.
 *
 * Three launch guarantees:
 *
 * 1. EVIDENCE LADDER — `evidence` names the rung that produced the verdict:
 *      "timezone" | "distance" | "state" | "none"
 *    Fixed priority: timezone change → fresh distance > threshold →
 *    persisted state machine → false.
 *
 * 2. DETERMINISTIC FALLBACK — inputs are sanitised before the decision:
 *    a non-finite / negative distance is read as *missing*, never as 0 km
 *    ("at home"), and a malformed timezone can never assert a change.
 *    Any error path (`no_row`, `hydration_failed`) fails open to
 *    `travelDay: false`, `evidence: "none"` so a DB hiccup can never
 *    invent travel — and never removes calendar-derived travel evidence
 *    downstream.
 *
 * 3. PROVENANCE — exactly one structured `[travel-state][consumer]` line
 *    per surface per run, carrying both inputs and verdict. Distance only;
 *    coordinates are never logged, and the user id is redacted.
 */

import { redactUserId } from "../identity/redact-user-id.ts";
import {
  decideTravelFreshness,
  LOCATION_FRESH_HOURS,
  STATE_CHANGE_FRESH_DAYS,
} from "./freshness.ts";
import {
  isTravelDayFromDistance,
  TRAVEL_DAY_THRESHOLD_KM,
  type TravelDayInput,
  travelDayReason,
} from "./travel-day.ts";

export type TravelDayEvidence = "trip" | "timezone" | "distance" | "state" | "none";

/** A persisted trip window from `travel_state.meta.trips`. */
interface PersistedTripWindow {
  start: string;
  end: string;
  source?: string;
  confidence?: string;
}

/** Read the persisted per-day trip windows. Junk meta yields []. */
function persistedTrips(meta: unknown): PersistedTripWindow[] {
  const raw = (meta as Record<string, unknown> | null)?.trips;
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is PersistedTripWindow => {
    const w = t as PersistedTripWindow;
    return !!w && typeof w.start === "string" && typeof w.end === "string";
  });
}

export function tripWindowCovering(
  meta: unknown,
  now: Date,
): PersistedTripWindow | null {
  const today = now.toISOString().slice(0, 10);
  for (const w of persistedTrips(meta)) {
    if (today >= w.start && today <= w.end) return w;
  }
  return null;
}


export interface TravelDayHydration {
  travelDay: boolean;
  reason: string;
  distanceKm: number | null;
  state: string | null;
  freshness: string;
  /** True when the persisted row was fresh enough to trust. */
  used: boolean;
  /** Which rung of the ladder produced the verdict. Additive. */
  evidence: TravelDayEvidence;
  /** Shape consumed by `SignalCoverageInput.travelState`. */
  travelState: { state: string | null; distanceFromHomeKm: number | null } | null;
  /** Persisted trip window covering today, when one exists (SSOT v2). */
  tripWindow?: PersistedTripWindow | null;
}

/** Inputs actually used by the decision, surfaced for provenance logging. */
export interface TravelDayInputsSnapshot {
  distanceKm: number | null;
  state: string | null;
  homeTz: string | null;
  currentTz: string | null;
  timezoneChanged: boolean;
  lastLocationAt: string | null;
  lastStateChangeAt: string | null;
  locationAgeHours: number | null;
  stateAgeHours: number | null;
}

export function emptyTravelDayHydration(
  reason = "no_row",
): TravelDayHydration {
  return {
    travelDay: false,
    reason,
    distanceKm: null,
    state: null,
    freshness: "missing",
    used: false,
    evidence: "none",
    travelState: null,
  };
}

// ── Sanitisers ───────────────────────────────────────────────────────────

/** A distance is only usable when it is a finite, non-negative number.
 *  Anything else (null, NaN, Infinity, "12", -3) is *missing*, not 0 km. */
export function sanitiseDistanceKm(value: unknown): number | null {
  const n = typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** A timezone is only usable when Intl accepts it. */
export function isSafeTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function ageHours(iso: unknown, now: Date): number | null {
  if (typeof iso !== "string" || iso.length === 0) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.round(((now.getTime() - t) / 3_600_000) * 10) / 10;
}

function asIso(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

// ── Pure decision ────────────────────────────────────────────────────────

/** Pure decision step — exported for tests and for callers that already
 *  hold the row (e.g. Smart Nudges fetches it in its parallel batch). */
export function deriveTravelDay(
  row: Record<string, unknown> | null | undefined,
  opts: { now: Date; currentTimezone?: string | null },
): TravelDayHydration {
  if (!row) return emptyTravelDayHydration("no_row");

  const state = typeof row.state === "string" ? row.state : null;
  const lastLocationAt = asIso(row.last_location_at);
  const lastStateChangeAt = asIso(row.last_state_change_at);

  const freshness = decideTravelFreshness({
    state,
    lastStateChangeAt,
    lastLocationAt,
    now: opts.now,
  });

  const distanceKm = sanitiseDistanceKm(row.distance_from_home_km);

  const homeTz = isSafeTimezone(row.last_known_timezone)
    ? row.last_known_timezone as string
    : null;
  const currentTz = isSafeTimezone(opts.currentTimezone)
    ? opts.currentTimezone as string
    : null;
  const timezoneChanged = homeTz !== null && currentTz !== null &&
    homeTz !== currentTz;

  const locationStale = !freshness.used;
  const input: TravelDayInput = {
    distanceKm,
    state,
    timezoneChanged,
    locationStale,
  };
  const distanceTravelDay = isTravelDayFromDistance(input);

  // Rung 0 — a persisted trip window covering today. Calendar evidence is
  // durable and outlives any single location fix, so it decides first. It
  // can only ever ADD travel; it never clears a positive verdict below.
  const tripWindow = tripWindowCovering(row.meta, opts.now);
  const travelDay = distanceTravelDay || tripWindow !== null;

  // Which rung decided it — mirrors the priority inside
  // `isTravelDayFromDistance` so the two can never disagree.
  let evidence: TravelDayEvidence = "none";
  if (travelDay) {
    if (tripWindow) evidence = "trip";
    else if (timezoneChanged) evidence = "timezone";
    else if (!locationStale && distanceKm !== null) evidence = "distance";
    else evidence = "state";
  }

  return {
    travelDay,
    reason: distanceTravelDay
      ? travelDayReason(input)
      : tripWindow
      ? `trip_window:${tripWindow.start}..${tripWindow.end}`
      : "none",
    distanceKm,
    state,
    freshness: freshness.reason,
    used: freshness.used,
    evidence,
    travelState: freshness.used
      ? { state, distanceFromHomeKm: distanceKm }
      : null,
    tripWindow,
  };
}


/** Rebuild the exact inputs the decision saw, for the provenance line. */
export function travelDayInputsSnapshot(
  row: Record<string, unknown> | null | undefined,
  opts: { now: Date; currentTimezone?: string | null },
): TravelDayInputsSnapshot {
  const homeTz = isSafeTimezone(row?.last_known_timezone)
    ? row!.last_known_timezone as string
    : null;
  const currentTz = isSafeTimezone(opts.currentTimezone)
    ? opts.currentTimezone as string
    : null;
  const lastLocationAt = asIso(row?.last_location_at);
  const lastStateChangeAt = asIso(row?.last_state_change_at);
  return {
    distanceKm: sanitiseDistanceKm(row?.distance_from_home_km),
    state: typeof row?.state === "string" ? row.state as string : null,
    homeTz,
    currentTz,
    timezoneChanged: homeTz !== null && currentTz !== null &&
      homeTz !== currentTz,
    lastLocationAt,
    lastStateChangeAt,
    locationAgeHours: ageHours(lastLocationAt, opts.now),
    stateAgeHours: ageHours(lastStateChangeAt, opts.now),
  };
}

// ── Provenance ───────────────────────────────────────────────────────────

/**
 * Emit the single structured provenance line. Shared by every surface so
 * one grep of `[travel-state][consumer]` reconciles Brief, Plan and Nudges
 * for the same user and day. No coordinates — distance only.
 */
export function logTravelDayProvenance(
  result: TravelDayHydration,
  inputs: TravelDayInputsSnapshot,
  opts: { fn: string; userId?: string | null },
): void {
  console.log(
    "[travel-state][consumer] " + JSON.stringify({
      fn: opts.fn,
      userIdHash: redactUserId(opts.userId ?? null),
      thresholds: {
        travelKm: TRAVEL_DAY_THRESHOLD_KM,
        locationFreshHours: LOCATION_FRESH_HOURS,
        stateChangeFreshDays: STATE_CHANGE_FRESH_DAYS,
      },
      inputs,
      verdict: {
        travelDay: result.travelDay,
        reason: result.reason,
        evidence: result.evidence,
        freshness: result.freshness,
        used: result.used,
      },
    }),
  );
}

/**
 * Fetch + derive. `db` is any Supabase client. Never throws.
 * Logs exactly one structured provenance line.
 */
export async function hydrateTravelDay(
  // deno-lint-ignore no-explicit-any
  db: any,
  userId: string,
  opts: { now: Date; currentTimezone?: string | null; fn: string },
): Promise<TravelDayHydration> {
  let row: Record<string, unknown> | null = null;
  let result: TravelDayHydration;
  try {
    const { data } = await db
      .from("travel_state")
      .select(
        "state, distance_from_home_km, last_state_change_at, last_location_at, last_known_timezone, meta",
      )
      .eq("user_id", userId)
      .maybeSingle();
    row = (data ?? null) as Record<string, unknown> | null;
    result = deriveTravelDay(row, {
      now: opts.now,
      currentTimezone: opts.currentTimezone ?? null,
    });
  } catch (err) {
    console.warn(
      `[${opts.fn}] travel_state hydration skipped:`,
      err instanceof Error ? err.message : err,
    );
    row = null;
    result = emptyTravelDayHydration("hydration_failed");
  }

  logTravelDayProvenance(
    result,
    travelDayInputsSnapshot(row, {
      now: opts.now,
      currentTimezone: opts.currentTimezone ?? null,
    }),
    { fn: opts.fn, userId },
  );
  return result;
}
