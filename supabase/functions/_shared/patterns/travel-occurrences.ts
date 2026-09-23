/**
 * travel-occurrences.ts — how a past day becomes a *confirmed* travel day.
 *
 * Pure module. No IO, no changes to the travel modules or the location check;
 * this only decides, after the fact, which days count as travel occurrences for
 * the 365-day pattern pass.
 *
 * The ladder (user-specified):
 *   1. If location data exists for that day, LOCATION DECIDES.
 *      Within 50 km of home all day = not travel, whatever the calendar, the
 *      invite address or a trip window says (e.g. an event in another city
 *      attended online). Beyond 50 km = travel day.
 *   2. Location-only travel counts: over 50 km with nothing in the calendar is
 *      still a travel day, recorded as `location_detected`.
 *   3. Only when there is NO location data for that day may calendar evidence
 *      count on its own — a flight, hotel or transit entry, an invite address
 *      over 50 km from home, or a trip window — and never a window or title
 *      whose only evidence is a conference / off-site / event name.
 *
 * Upcoming days are never occurrences; callers pass past days only.
 */

import { TRAVEL_DAY_THRESHOLD_KM } from "../travel/travel-day.ts";

/** Consecutive-ish travel days within this gap belong to the same trip. */
export const TRIP_GAP_DAYS = 7;

export type TravelEvidenceKind =
  /** flight / hotel / transit calendar entry */
  | "flight"
  | "stay"
  | "transit"
  /** invite location field more than 50 km from home */
  | "invite_address"
  /** a stored trip window whose own evidence is one of the above */
  | "trip_window"
  /** a conference / off-site / summit title — NEVER travel on its own */
  | "conference_title";

const STANDALONE_KINDS: TravelEvidenceKind[] = [
  "flight",
  "stay",
  "transit",
  "invite_address",
  "trip_window",
];

export interface CalendarTravelEvidence {
  /** Local ISO date (YYYY-MM-DD). */
  date: string;
  kind: TravelEvidenceKind;
  title?: string | null;
}

export interface LocationDay {
  /** Local ISO date (YYYY-MM-DD). */
  date: string;
  /** Greatest distance from the home anchor seen that day, km. */
  maxDistanceKm: number | null;
  /** True when the device timezone differed from home that day. */
  timezoneChanged?: boolean;
}

export type TravelDaySource =
  | "location_detected"
  | "location_confirmed"
  | "calendar_only";

export interface TravelDayVerdict {
  date: string;
  travel: boolean;
  source: TravelDaySource | null;
  reason: string;
  titles: string[];
}

export interface TripOccurrence {
  start: string;
  end: string;
  days: number;
  titles: string[];
  sources: TravelDaySource[];
}

export interface TravelOccurrenceInput {
  locationDays: LocationDay[];
  calendarEvidence: CalendarTravelEvidence[];
  /** Travel days already confirmed by an earlier run, so history is never lost. */
  carriedForwardDays?: TravelDayVerdict[];
}

export interface TravelOccurrences {
  days: TravelDayVerdict[];
  trips: TripOccurrence[];
}

function dayNumber(iso: string): number {
  return Math.floor(Date.parse(iso + "T00:00:00Z") / 86_400_000);
}

/** Decide a single past day. */
export function confirmTravelDay(
  date: string,
  location: LocationDay | null | undefined,
  evidence: CalendarTravelEvidence[],
): TravelDayVerdict {
  const titles = evidence
    .map((e) => (e.title ?? "").trim())
    .filter((t) => t.length > 0);

  const hasLocation = !!location &&
    ((typeof location.maxDistanceKm === "number" &&
      Number.isFinite(location.maxDistanceKm)) ||
      location.timezoneChanged === true);

  if (hasLocation) {
    const away = location!.timezoneChanged === true ||
      (typeof location!.maxDistanceKm === "number" &&
        location!.maxDistanceKm > TRAVEL_DAY_THRESHOLD_KM);
    if (!away) {
      // Location decides: at home all day is not travel, whatever the
      // calendar claimed.
      return {
        date,
        travel: false,
        source: null,
        reason: "location-within-home-radius",
        titles,
      };
    }
    return {
      date,
      travel: true,
      source: titles.length > 0 ? "location_confirmed" : "location_detected",
      reason: location!.timezoneChanged === true
        ? "location-timezone-change"
        : `location-distance>${TRAVEL_DAY_THRESHOLD_KM}km`,
      titles,
    };
  }

  // No location data — calendar evidence may stand alone, but never a
  // conference / off-site title.
  const standalone = evidence.filter((e) => STANDALONE_KINDS.includes(e.kind));
  if (standalone.length > 0) {
    return {
      date,
      travel: true,
      source: "calendar_only",
      reason: `calendar-${standalone[0].kind}-no-location`,
      titles,
    };
  }

  return {
    date,
    travel: false,
    source: null,
    reason: evidence.length > 0
      ? "conference-title-only-not-travel"
      : "no-evidence",
    titles,
  };
}

/** Group confirmed travel days into trips (a day trip is a one-day trip). */
export function groupTrips(days: TravelDayVerdict[]): TripOccurrence[] {
  const sorted = days
    .filter((d) => d.travel)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  const trips: TripOccurrence[] = [];
  for (const d of sorted) {
    const last = trips[trips.length - 1];
    if (last && dayNumber(d.date) - dayNumber(last.end) <= TRIP_GAP_DAYS) {
      last.end = d.date;
      last.days += 1;
      for (const t of d.titles) if (!last.titles.includes(t)) last.titles.push(t);
      if (d.source && !last.sources.includes(d.source)) last.sources.push(d.source);
    } else {
      trips.push({
        start: d.date,
        end: d.date,
        days: 1,
        titles: [...d.titles],
        sources: d.source ? [d.source] : [],
      });
    }
  }
  return trips;
}

/**
 * Build the confirmed travel days and trips, merging anything an earlier run
 * already confirmed (location readings could be pruned one day; a confirmed day
 * must never be lost).
 */
export function buildTravelOccurrences(
  input: TravelOccurrenceInput,
): TravelOccurrences {
  const locByDate = new Map<string, LocationDay>();
  for (const l of input.locationDays ?? []) {
    const prev = locByDate.get(l.date);
    if (
      !prev ||
      (l.maxDistanceKm ?? -1) > (prev.maxDistanceKm ?? -1) ||
      l.timezoneChanged === true
    ) {
      locByDate.set(l.date, {
        date: l.date,
        maxDistanceKm: Math.max(l.maxDistanceKm ?? -1, prev?.maxDistanceKm ?? -1) < 0
          ? null
          : Math.max(l.maxDistanceKm ?? -1, prev?.maxDistanceKm ?? -1),
        timezoneChanged: l.timezoneChanged === true || prev?.timezoneChanged === true,
      });
    }
  }

  const evByDate = new Map<string, CalendarTravelEvidence[]>();
  for (const e of input.calendarEvidence ?? []) {
    const list = evByDate.get(e.date) ?? [];
    list.push(e);
    evByDate.set(e.date, list);
  }

  const dates = new Set<string>([...locByDate.keys(), ...evByDate.keys()]);
  const verdicts = new Map<string, TravelDayVerdict>();
  for (const date of dates) {
    verdicts.set(
      date,
      confirmTravelDay(date, locByDate.get(date), evByDate.get(date) ?? []),
    );
  }

  // Carry forward previously confirmed days that this run can no longer see.
  for (const prev of input.carriedForwardDays ?? []) {
    if (!prev?.travel || !prev.date) continue;
    if (!verdicts.has(prev.date)) verdicts.set(prev.date, prev);
  }

  const days = [...verdicts.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { days, trips: groupTrips(days) };
}
