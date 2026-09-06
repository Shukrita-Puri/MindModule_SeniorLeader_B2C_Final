// Sprint 9 / Phase 9B — pure travel-state-sync classifier.
//
// Fail-open contract:
//   • Never overwrite a prior "away" state (arrived / en_route / returning)
//     with "not_travelling" based on weak signals — only distance below the
//     RETURNING_BUFFER_KM threshold may do so, and only when we actually
//     have a fresh location fix.
//   • Missing signals → SKIP, do not write a confident false row.
//   • Timezone diff and calendar travel titles are advisory: they may
//     promote from `not_travelling` → `travel_planned` / `arrived`, they
//     may NOT clear an existing away state.
//
// Reuses the same distance thresholds as `persist-travel-location` so the
// scheduled producer and the client producer stay in agreement.

export const AWAY_THRESHOLD_KM = 50;
export const RETURNING_BUFFER_KM = 25;
export const LOCATION_STALE_MINUTES = 24 * 60; // 24h — beyond this, distance signal is ignored

export type TravelState =
  | "not_travelling"
  | "travel_planned"
  | "en_route"
  | "arrived"
  | "returning"
  | "location_unknown";

const AWAY_STATES: ReadonlySet<TravelState> = new Set(["travel_planned", "en_route", "arrived", "returning"]);

export interface SyncInput {
  prev: TravelState | null;
  prevDistanceKm: number | null;
  prevLastLocationAt: string | null; // ISO
  homeTimezone: string | null;
  currentTimezone: string | null;
  lastKnownLat: number | null;
  lastKnownLng: number | null;
  homeLat: number | null;
  homeLng: number | null;
  hasTravelCalendarEventToday: boolean;
  /**
   * True when the matched travel calendar entry is ONGOING (it started in
   * the past and has not ended yet). An ongoing trip means the person is
   * already away, so the advisory promotion target is `arrived` rather
   * than `travel_planned`. Still advisory: it may promote, never clear.
   */
  travelCalendarEventOngoing?: boolean;
  now: Date;

}

export type SyncSource =
  | "distance"
  | "timezone"
  | "calendar"
  | "none";

export type SyncDecision =
  | {
      write: true;
      nextState: TravelState;
      distanceKm: number | null;
      source: SyncSource;
      reason: string;
    }
  | {
      write: false;
      source: SyncSource;
      reason:
        | "no_signal"
        | "no_prev_no_signal"
        | "location_stale"
        | "state_unchanged"
        | "would_overwrite_away";
    };

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function minutesSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (now.getTime() - t) / 60000;
}

export function decideTravelSync(inp: SyncInput): SyncDecision {
  const prev: TravelState = inp.prev ?? "not_travelling";
  const prevIsAway = AWAY_STATES.has(prev);

  // ----- distance signal -----
  const hasCoords =
    inp.lastKnownLat != null && inp.lastKnownLng != null &&
    inp.homeLat != null && inp.homeLng != null;
  const locAgeMin = minutesSince(inp.prevLastLocationAt, inp.now);
  const locationFresh = hasCoords && (locAgeMin == null || locAgeMin <= LOCATION_STALE_MINUTES);
  const distanceKm = locationFresh
    ? haversineKm(
        { lat: inp.lastKnownLat!, lng: inp.lastKnownLng! },
        { lat: inp.homeLat!, lng: inp.homeLng! },
      )
    : null;

  // ----- timezone signal -----
  const tzChanged = !!(
    inp.homeTimezone && inp.currentTimezone && inp.homeTimezone !== inp.currentTimezone
  );

  // ----- calendar signal -----
  const calendarTravel = inp.hasTravelCalendarEventToday === true;

  // Distance path — authoritative when we have fresh coords.
  if (distanceKm !== null) {
    let next: TravelState;
    if (distanceKm > AWAY_THRESHOLD_KM) {
      next = prev === "not_travelling" || prev === "travel_planned"
        ? (tzChanged ? "arrived" : "en_route")
        : "arrived";
    } else if (distanceKm < RETURNING_BUFFER_KM) {
      next = prevIsAway ? "not_travelling" : "not_travelling";
    } else {
      // Mid-zone: keep prev unless prev is not_travelling
      next = prevIsAway ? prev : "not_travelling";
    }
    if (next === prev) {
      return { write: false, source: "distance", reason: "state_unchanged" };
    }
    return { write: true, nextState: next, distanceKm, source: "distance", reason: `distance_${Math.round(distanceKm)}km` };
  }

  // No fresh coords. Advisory signals may promote from not_travelling only.
  if (!prevIsAway) {
    if (tzChanged) {
      return {
        write: true,
        nextState: "arrived",
        distanceKm: null,
        source: "timezone",
        reason: `tz_${inp.homeTimezone}_to_${inp.currentTimezone}`,
      };
    }
    if (calendarTravel) {
      const ongoing = inp.travelCalendarEventOngoing === true;
      return {
        write: true,
        nextState: ongoing ? "arrived" : "travel_planned",
        distanceKm: null,
        source: "calendar",
        reason: ongoing ? "calendar_travel_ongoing" : "calendar_travel_title",
      };
    }

    return { write: false, source: "none", reason: inp.prev == null ? "no_prev_no_signal" : "no_signal" };
  }

  // Promotion only: a planned trip that is now ongoing becomes `arrived`.
  // This never clears an away state — it deepens it.
  if (prev === "travel_planned" && calendarTravel && inp.travelCalendarEventOngoing === true) {
    return {
      write: true,
      nextState: "arrived",
      distanceKm: null,
      source: "calendar",
      reason: "calendar_travel_ongoing",
    };
  }

  // prev is already away and we have no fresh coords → fail open: leave it.

  if (hasCoords && !locationFresh) {
    return { write: false, source: "distance", reason: "location_stale" };
  }
  return { write: false, source: "none", reason: "would_overwrite_away" };
}