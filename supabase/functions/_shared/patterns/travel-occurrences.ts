/**
 * travel-occurrences.ts — how a past day becomes a *confirmed* travel day.
 *
 * Pure module. No IO, and no changes to the travel modules or the live location
 * check; this only decides, after the fact, which days count as travel
 * occurrences for the 365-day pattern pass.
 *
 * The ladder (user-specified):
 *   1. Any single reading more than 50 km from home confirms travel on its own.
 *   2. Readings that stay within 50 km only overrule the calendar when they
 *      COVER THE WHOLE DAY — spread across it, including the afternoon and the
 *      evening. Sparse readings that stop partway through the day can never
 *      veto a flight, hotel or transit entry.
 *   3. Otherwise calendar evidence may stand alone: a flight, hotel or transit
 *      entry, or an invite with real coordinates more than 50 km from home.
 *      A conference / off-site / summit title is never travel on its own.
 *   4. Every day between an outbound and a return that belong together is a
 *      travel day too, because being away costs something on each of them. The
 *      trip stays ONE trip, filled days are marked as filled, and a covered
 *      at-home day inside the window splits the trip in two.
 *
 * Upcoming days are never occurrences; callers pass past days only.
 */

import { TRAVEL_DAY_THRESHOLD_KM } from "../travel/travel-day.ts";

/** Separate confirmed days further apart than this are separate trips. */
export const TRIP_GAP_DAYS = 7;

/**
 * Longest window an outbound and a return may bridge. Three weeks covers even a
 * long overseas stretch while never joining unrelated travel weeks apart.
 */
export const MAX_TRIP_DAYS = 21;

/** Earliest local hour a day's last reading may have and still count as covering the evening. */
export const FULL_DAY_LAST_READING_HOUR = 18;

/** A covered day needs more than one reading, including that evening one. */
export const FULL_DAY_MIN_READINGS = 2;

export type TravelEvidenceKind =
  /** flight / hotel / transit calendar entry */
  | "flight"
  | "stay"
  | "transit"
  /** invite coordinates more than 50 km from home */
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

/** Kinds that can open or close a trip, i.e. an outbound or a return leg. */
const LEG_KINDS: TravelEvidenceKind[] = ["flight", "transit", "trip_window"];

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
  /** Local hour (0-23) of the last reading that day, when known. */
  lastReadingHour?: number | null;
  /** How many readings there were that day. */
  readingCount?: number;
}

export type TravelDaySource =
  | "location_detected"
  | "location_confirmed"
  | "calendar_only"
  | "between_outbound_and_return";

export interface TravelDayVerdict {
  date: string;
  travel: boolean;
  source: TravelDaySource | null;
  reason: string;
  titles: string[];
  /** Evidence kinds seen that day (empty for a filled day). */
  kinds?: TravelEvidenceKind[];
  /** True when the day had no evidence of its own and sits inside a trip. */
  filled?: boolean;
}

export interface TripOccurrence {
  start: string;
  end: string;
  days: number;
  titles: string[];
  sources: TravelDaySource[];
  /** Days with their own evidence. */
  evidenceDays: string[];
  /** Days filled in between the outbound and the return. */
  filledDays: string[];
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

function dateFromNumber(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

/** True when the day's readings run across the day, including the evening. */
export function locationCoversWholeDay(
  location: LocationDay | null | undefined,
): boolean {
  if (!location) return false;
  const hour = location.lastReadingHour;
  const count = location.readingCount ?? 0;
  return typeof hour === "number" && hour >= FULL_DAY_LAST_READING_HOUR &&
    count >= FULL_DAY_MIN_READINGS;
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
  const kinds = evidence.map((e) => e.kind);

  // 1. A single away reading settles it.
  const away = !!location &&
    (location.timezoneChanged === true ||
      (typeof location.maxDistanceKm === "number" &&
        location.maxDistanceKm > TRAVEL_DAY_THRESHOLD_KM));
  if (away) {
    return {
      date,
      travel: true,
      source: titles.length > 0 ? "location_confirmed" : "location_detected",
      reason: location!.timezoneChanged === true
        ? "location-timezone-change"
        : `location-distance>${TRAVEL_DAY_THRESHOLD_KM}km`,
      titles,
      kinds,
    };
  }

  // 2. Readings within home radius only overrule the calendar when they cover
  //    the whole day, evening included.
  if (locationCoversWholeDay(location)) {
    return {
      date,
      travel: false,
      source: null,
      reason: "location-full-day-within-home-radius",
      titles,
      kinds,
    };
  }

  // 3. Calendar evidence stands on its own — never a conference title.
  const standalone = evidence.filter((e) => STANDALONE_KINDS.includes(e.kind));
  if (standalone.length > 0) {
    return {
      date,
      travel: true,
      source: "calendar_only",
      reason: `calendar-${standalone[0].kind}`,
      titles,
      kinds,
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
    kinds,
  };
}

function hasKind(v: TravelDayVerdict, kinds: TravelEvidenceKind[]): boolean {
  return (v.kinds ?? []).some((k) => kinds.includes(k));
}

/**
 * Group confirmed travel days into trips, filling the days between an outbound
 * and a return that belong together.
 *
 * A gap is bridged only when: the day that closes it is a return leg (flight /
 * transit / trip window) or the day that opens it has a hotel stay covering the
 * window, the whole trip stays within MAX_TRIP_DAYS, and no day inside the gap
 * has full-day readings placing the leader at home. A covered at-home day
 * inside the window splits the trip instead.
 */
export function groupTrips(
  days: TravelDayVerdict[],
  atHomeCoveredDates?: Set<string>,
): { trips: TripOccurrence[]; filled: TravelDayVerdict[] } {
  const atHome = atHomeCoveredDates ?? new Set<string>();
  const sorted = days
    .filter((d) => d.travel)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  const trips: TripOccurrence[] = [];
  const filled: TravelDayVerdict[] = [];

  const open = (d: TravelDayVerdict) => {
    trips.push({
      start: d.date,
      end: d.date,
      days: 1,
      titles: [...d.titles],
      sources: d.source ? [d.source] : [],
      evidenceDays: d.filled ? [] : [d.date],
      filledDays: d.filled ? [d.date] : [],
    });
  };

  for (const d of sorted) {
    const last = trips[trips.length - 1];
    if (!last) {
      open(d);
      continue;
    }
    const gap = dayNumber(d.date) - dayNumber(last.end);
    if (gap <= 0) continue;

    const gapDates: string[] = [];
    for (let n = dayNumber(last.end) + 1; n < dayNumber(d.date); n++) {
      gapDates.push(dateFromNumber(n));
    }
    const gapHasHomeDay = gapDates.some((x) => atHome.has(x));
    const tripLength = dayNumber(d.date) - dayNumber(last.start) + 1;
    const belongsTogether = hasKind(d, LEG_KINDS) ||
      sorted.some((x) =>
        x.date === last.start && hasKind(x, ["stay", "trip_window"])
      );

    const bridge = gap > 1 && !gapHasHomeDay && tripLength <= MAX_TRIP_DAYS &&
      belongsTogether;
    const continues = gap === 1 ||
      (bridge) ||
      (gap <= TRIP_GAP_DAYS && !gapHasHomeDay && tripLength <= MAX_TRIP_DAYS);

    if (!continues) {
      open(d);
      continue;
    }

    if (gap > 1 && bridge) {
      for (const gd of gapDates) {
        const v: TravelDayVerdict = {
          date: gd,
          travel: true,
          source: "between_outbound_and_return",
          reason: "between-outbound-and-return",
          titles: [],
          kinds: [],
          filled: true,
        };
        filled.push(v);
        last.filledDays.push(gd);
        last.days += 1;
      }
    }

    last.end = d.date;
    last.days += 1;
    if (d.filled) last.filledDays.push(d.date);
    else last.evidenceDays.push(d.date);
    for (const t of d.titles) if (!last.titles.includes(t)) last.titles.push(t);
    if (d.source && !last.sources.includes(d.source)) last.sources.push(d.source);
  }

  return { trips, filled };
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
    const maxKm = Math.max(l.maxDistanceKm ?? -1, prev?.maxDistanceKm ?? -1);
    locByDate.set(l.date, {
      date: l.date,
      maxDistanceKm: maxKm < 0 ? null : maxKm,
      timezoneChanged: l.timezoneChanged === true || prev?.timezoneChanged === true,
      lastReadingHour: Math.max(
        l.lastReadingHour ?? -1,
        prev?.lastReadingHour ?? -1,
      ) < 0
        ? null
        : Math.max(l.lastReadingHour ?? -1, prev?.lastReadingHour ?? -1),
      readingCount: (l.readingCount ?? 0) + (prev?.readingCount ?? 0),
    });
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

  // Days whose readings cover the whole day and place the leader at home: these
  // can split a trip, so a bridge may never run through them.
  const atHomeCovered = new Set<string>();
  for (const [date, loc] of locByDate) {
    const v = verdicts.get(date);
    if (v && !v.travel && locationCoversWholeDay(loc)) atHomeCovered.add(date);
  }

  const { trips, filled } = groupTrips([...verdicts.values()], atHomeCovered);
  for (const f of filled) if (!verdicts.has(f.date)) verdicts.set(f.date, f);

  const days = [...verdicts.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { days, trips };
}
