/**
 * trip-windows.ts — the ONE place that turns calendar evidence into
 * persisted trip windows (`travel_state.meta.trips`).
 *
 * Why this exists: `travel_state` is a point-in-time row. It answers
 * "is this person away right now?" and nothing else, so a finished trip
 * leaves no trace. Trip windows give every surface a per-DAY answer
 * ("was 12 August a travel day?") without adding a new table — they live
 * inside the already-wired `meta` JSON column on `travel_state`.
 *
 * CONTRACT
 *  • Pure functions. No IO, no taxonomy fork — flight / route detection
 *    delegates to `_shared/events/travel-patterns.ts`.
 *  • Calendar evidence is advisory-but-durable: a rebuild replaces the
 *    calendar-derived windows for the scanned range and preserves every
 *    window from another source (location, manual) untouched.
 *  • Location evidence may CONFIRM or EXTEND a window, never delete one
 *    (same fail-open contract as derive.ts).
 */

import { detectTravelFromTitle } from "../_shared/events/travel-patterns.ts";

export type TripEvidenceKind = "flight" | "stay" | "offsite" | "trip";
export type TripSource = "calendar" | "location" | "manual";

export interface TripEvidenceEvent {
  title: string | null;
  start_time: string | null;
  end_time: string | null;
  is_all_day?: boolean | null;
}

export interface TripWindow {
  /** Inclusive local-ish ISO date, YYYY-MM-DD. */
  start: string;
  /** Inclusive ISO date. */
  end: string;
  source: TripSource;
  evidence: TripEvidenceKind[];
  confidence: "high" | "medium";
  /** True once a fresh away-from-home fix landed inside the window. */
  location_confirmed?: boolean;
  updated_at: string;
}

// ── Evidence detection ───────────────────────────────────────────────────

const STAY_PATTERN =
  /\b(stay at|staying at|hotel|motel|hostel|airbnb|accommodation|check[-\s]?in at|marriott|hilton|hyatt|doubletree|sheraton|radisson|holiday inn|four seasons|ritz|novotel|ibis)\b/i;

const OFFSITE_PATTERN =
  /\b(off[-\s]?site|onsite visit|conference|summit|retreat|expo|convention|roadshow)\b/i;

/** Which kind of trip evidence a title carries, if any. */
export function classifyTripEvidence(
  title: string | null | undefined,
): TripEvidenceKind | null {
  if (!title) return null;
  const t = title.trim();
  if (!t) return null;

  const travel = detectTravelFromTitle(t);
  if (travel.matched) {
    if (travel.reason === "flight_number" || travel.reason === "route_code") {
      return "flight";
    }
    if (travel.reason === "travel_verb") return "trip";
  }
  if (/\bflight\b/i.test(t)) return "flight";
  if (STAY_PATTERN.test(t)) return "stay";
  if (OFFSITE_PATTERN.test(t)) return "offsite";
  return null;
}

// ── Date helpers ─────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

export function toIsoDate(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  return toIsoDate(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS);
}

function dayDiff(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS,
  );
}

/** Inclusive day span an event occupies. Returns null when unusable. */
export function eventDaySpan(
  ev: TripEvidenceEvent,
): { start: string; end: string } | null {
  const startMs = ev.start_time ? Date.parse(ev.start_time) : NaN;
  if (!Number.isFinite(startMs)) return null;
  const start = toIsoDate(startMs);

  const endMs = ev.end_time ? Date.parse(ev.end_time) : NaN;
  if (!Number.isFinite(endMs) || endMs <= startMs) return { start, end: start };

  // An all-day entry ending at midnight covers up to the previous day
  // (Google's exclusive end). A timed red-eye landing at 02:25 still
  // belongs to both calendar days, so only trim exact midnights.
  let end = toIsoDate(endMs);
  const endsAtMidnight = endMs % DAY_MS === 0;
  if (endsAtMidnight && dayDiff(start, end) > 0) end = addDays(end, -1);
  return { start, end: end < start ? start : end };
}

// ── Window building ──────────────────────────────────────────────────────

/** Windows within this many days of each other merge into one trip. */
const MERGE_GAP_DAYS = 1;

/**
 * Turn raw calendar rows into merged trip windows.
 * Deduplicates identical entries coming from multiple providers.
 */
export function buildTripWindows(
  events: TripEvidenceEvent[],
  opts: { now: Date },
): TripWindow[] {
  const updatedAt = opts.now.toISOString();
  const seen = new Set<string>();

  const spans: Array<{ start: string; end: string; kind: TripEvidenceKind }> = [];
  for (const ev of events ?? []) {
    const kind = classifyTripEvidence(ev.title);
    if (!kind) continue;
    const span = eventDaySpan(ev);
    if (!span) continue;
    const dedupeKey = `${(ev.title ?? "").trim().toLowerCase()}|${span.start}|${span.end}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    spans.push({ ...span, kind });
  }

  if (spans.length === 0) return [];
  spans.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  const windows: TripWindow[] = [];
  for (const span of spans) {
    const last = windows[windows.length - 1];
    if (last && dayDiff(last.end, span.start) <= MERGE_GAP_DAYS) {
      if (span.end > last.end) last.end = span.end;
      if (!last.evidence.includes(span.kind)) last.evidence.push(span.kind);
      continue;
    }
    windows.push({
      start: span.start,
      end: span.end,
      source: "calendar",
      evidence: [span.kind],
      confidence: "medium",
      updated_at: updatedAt,
    });
  }

  for (const w of windows) {
    // A flight or a booked stay is hard evidence. A lone "conference"
    // or "trip to X" stays medium until location corroborates it.
    w.confidence = w.evidence.some((e) => e === "flight" || e === "stay")
      ? "high"
      : "medium";
  }
  return windows;
}

// ── Merge into persisted meta ────────────────────────────────────────────

export function parseTrips(meta: unknown): TripWindow[] {
  const raw = (meta as Record<string, unknown> | null)?.trips;
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is TripWindow => {
    const w = t as TripWindow;
    return !!w && typeof w.start === "string" && typeof w.end === "string";
  });
}

/**
 * Replace calendar-derived windows that fall inside the rescanned range,
 * keep everything else. Never removes non-calendar windows.
 */
export function mergeTripWindows(
  existing: TripWindow[],
  rebuilt: TripWindow[],
  range: { from: string; to: string },
): TripWindow[] {
  const kept = existing.filter((w) => {
    if (w.source !== "calendar") return true;
    // Outside the rescanned range → the rebuild says nothing about it.
    return w.end < range.from || w.start > range.to;
  });

  const merged = [...kept];
  for (const w of rebuilt) {
    const prior = existing.find(
      (e) => e.start === w.start && e.end === w.end,
    );
    merged.push(
      prior?.location_confirmed ? { ...w, location_confirmed: true } : w,
    );
  }
  merged.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return merged;
}

/** Mark the window containing a confirmed away-from-home fix. */
export function confirmWindowByLocation(
  trips: TripWindow[],
  atIsoDate: string,
): TripWindow[] {
  return trips.map((w) =>
    atIsoDate >= w.start && atIsoDate <= w.end
      ? { ...w, location_confirmed: true, confidence: "high" as const }
      : w
  );
}

/** Is the given ISO date inside any persisted trip window? */
export function tripWindowForDate(
  trips: TripWindow[],
  isoDate: string,
): TripWindow | null {
  for (const w of trips) {
    if (isoDate >= w.start && isoDate <= w.end) return w;
  }
  return null;
}
