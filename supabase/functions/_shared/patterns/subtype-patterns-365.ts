/**
 * subtype-patterns-365.ts — the NEW 365-day pattern pass.
 *
 * Pure computation. Runs only after the engine's existing 60-day calculation
 * has been saved, writes only the additive `signal_summary.subtype_patterns_365`
 * key, and never touches an existing key, threshold or window. Insights reads
 * nothing from here in this run.
 *
 * Levels:
 *   A–E, H  → subtype level only (category + subtype)
 *   G, F    → BOTH: subtype entries (stored, never surfaced in this run) and a
 *             category entry, which is the only one nudges / Plan / Brief read.
 *
 * Travel (G) counts by TRIP, and stores both a per-travel-day and a per-trip
 * effect. Travel occurrences come from confirmTravelDay's ladder, so a
 * conference or off-site title alone can never create one.
 */

import { resolveEvent } from "../events/resolve-event-category.ts";
import type { TravelOccurrences } from "./travel-occurrences.ts";

export const WINDOW_DAYS_365 = 365;

/** The engine's own thresholds — reused, never redefined. */
export const MIN_OCCURRENCES = 3;
export const MIN_OCCURRENCES_STRONG = 5;
export const MIN_DELTA_PCT_EMERGING = 10;
export const MIN_DELTA_PCT_STRONG = 15;
/** Recovery is measured in days back to within 5% of baseline. */
export const RECOVERY_TOLERANCE_PCT = 5;
export const MIN_RECOVERY_DAYS_EMERGING = 2;
export const MIN_RECOVERY_DAYS_STRONG = 3;

/** Storage caps. `n` always reports the true total, never the capped list. */
export const MAX_OCCURRENCES_STORED = 20;
export const MAX_TITLE_CHARS = 80;
export const MAX_NON_QUALIFYING_PER_MEASURE = 12;

export type PatternMeasure = "rhr" | "hrv" | "sleep" | "recovery";
export type PatternDirection = "harm" | "recovery" | "neutral";
export type PatternConfidence = "strong" | "emerging";

export interface PatternOccurrence {
  date?: string;
  title?: string | null;
  /** Trip occurrences only. */
  start?: string;
  end?: string;
  days?: number;
  titles?: string[];
  source?: string | null;
}

export interface SubtypePattern365 {
  matchLevel: "subtype" | "category";
  categoryId: string;
  subtypeId: string | null;
  subcategory: string | null;
  label: string;
  measure: PatternMeasure;
  unit: "day" | "trip";
  n: number;
  deltaPct: number | null;
  recoveryDays: number | null;
  direction: PatternDirection;
  confidence: PatternConfidence | null;
  lastSeen: string | null;
  qualifies: boolean;
  surfaced: boolean;
  perDay?: { deltaPct: number | null; n: number } | null;
  perTrip?: { deltaPct: number | null; recoveryDays: number | null; n: number } | null;
  occurrences: PatternOccurrence[];
}

export interface SubtypePatterns365 {
  generatedAt: string;
  windowDays: number;
  items: SubtypePattern365[];
  /** Travel days confirmed this run — carried forward by the next run. */
  travelDays?: Array<{ date: string; travel: boolean; source: string | null; reason: string; titles: string[] }>;
}

export interface WearableDay {
  summary_date: string;
  hrv?: number | null;
  resting_heart_rate?: number | null;
  sleep_score?: number | null;
}

export interface PassEvent {
  title?: string | null;
  start_time?: string | null;
  [k: string]: unknown;
}

export interface ComputeInput {
  todayIsoDate: string;
  events: PassEvent[];
  wearable: WearableDay[];
  travel: TravelOccurrences;
}

/** Categories matched at category level for nudges / Plan / Brief. */
const CATEGORY_LEVEL: ReadonlySet<string> = new Set(["G", "F"]);

const MEASURE_FIELD: Record<"rhr" | "hrv" | "sleep", keyof WearableDay> = {
  rhr: "resting_heart_rate",
  hrv: "hrv",
  sleep: "sleep_score",
};

function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function pctDelta(observed: number, baseline: number): number | null {
  if (!Number.isFinite(baseline) || baseline === 0) return null;
  return ((observed - baseline) / Math.abs(baseline)) * 100;
}

function isoDateOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function truncateTitle(t: string | null | undefined): string | null {
  if (!t) return null;
  const s = t.trim();
  return s.length > MAX_TITLE_CHARS ? s.slice(0, MAX_TITLE_CHARS) : s;
}

/** Harm direction for each measure — higher RHR, lower HRV, worse sleep. */
export function directionFor(
  measure: PatternMeasure,
  deltaPct: number | null,
  recoveryDays: number | null,
): PatternDirection {
  if (measure === "recovery") {
    if (recoveryDays == null) return "neutral";
    if (recoveryDays >= MIN_RECOVERY_DAYS_EMERGING) return "harm";
    return "recovery";
  }
  if (deltaPct == null) return "neutral";
  if (measure === "rhr") return deltaPct > 0 ? "harm" : "recovery";
  return deltaPct < 0 ? "harm" : "recovery";
}

export function confidenceFor(
  measure: PatternMeasure,
  n: number,
  deltaPct: number | null,
  recoveryDays: number | null,
): PatternConfidence | null {
  if (n < MIN_OCCURRENCES) return null;
  if (measure === "recovery") {
    if (recoveryDays == null) return null;
    if (n >= MIN_OCCURRENCES_STRONG && recoveryDays >= MIN_RECOVERY_DAYS_STRONG) {
      return "strong";
    }
    if (recoveryDays >= MIN_RECOVERY_DAYS_EMERGING) return "emerging";
    return null;
  }
  const abs = Math.abs(deltaPct ?? 0);
  if (n >= MIN_OCCURRENCES_STRONG && abs >= MIN_DELTA_PCT_STRONG) return "strong";
  if (abs >= MIN_DELTA_PCT_EMERGING) return "emerging";
  return null;
}

interface Group {
  matchLevel: "subtype" | "category";
  categoryId: string;
  subtypeId: string | null;
  subcategory: string | null;
  label: string;
  days: Map<string, string | null>; // date → representative title
}

function keyOf(g: Pick<Group, "matchLevel" | "categoryId" | "subcategory">): string {
  return `${g.matchLevel}:${g.categoryId}:${g.subcategory ?? "-"}`;
}

/** Group past events into subtype (and, for G/F, category) day sets. */
export function groupEventDays(events: PassEvent[]): Map<string, Group> {
  const groups = new Map<string, Group>();
  for (const ev of events ?? []) {
    const date = isoDateOf(ev.start_time as string | null);
    if (!date) continue;
    let resolved;
    try {
      resolved = resolveEvent(ev as Record<string, unknown>);
    } catch {
      continue;
    }
    const categoryId = resolved.categoryId;
    if (!categoryId) continue;
    const title = truncateTitle(ev.title as string | null);

    const add = (g: Omit<Group, "days">) => {
      const k = keyOf(g);
      const existing = groups.get(k);
      if (existing) {
        if (!existing.days.has(date)) existing.days.set(date, title);
      } else {
        groups.set(k, { ...g, days: new Map([[date, title]]) });
      }
    };

    if (resolved.subcategory) {
      add({
        matchLevel: "subtype",
        categoryId,
        subtypeId: resolved.subtype?.id ?? null,
        subcategory: resolved.subcategory,
        label: resolved.label ?? resolved.subcategory,
      });
    }
    if (CATEGORY_LEVEL.has(categoryId)) {
      add({
        matchLevel: "category",
        categoryId,
        subtypeId: null,
        subcategory: null,
        label: resolved.category?.name ?? categoryId,
      });
    }
  }
  return groups;
}

interface Series {
  byDate: Map<string, number>;
  baseline: number | null;
}

function seriesFor(wearable: WearableDay[], measure: "rhr" | "hrv" | "sleep"): Series {
  const field = MEASURE_FIELD[measure];
  const byDate = new Map<string, number>();
  for (const row of wearable ?? []) {
    const v = row[field];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      byDate.set(row.summary_date, v);
    }
  }
  return { byDate, baseline: mean([...byDate.values()]) };
}

/** Days after `endDate` until the measure returns within tolerance of baseline. */
function recoveryDaysAfter(
  series: Series,
  endDate: string,
  lookaheadDays = 7,
): number | null {
  if (series.baseline == null) return null;
  const end = Date.parse(endDate + "T00:00:00Z");
  for (let i = 1; i <= lookaheadDays; i++) {
    const d = new Date(end + i * 86_400_000).toISOString().slice(0, 10);
    const v = series.byDate.get(d);
    if (v == null) continue;
    const off = Math.abs(((v - series.baseline) / series.baseline) * 100);
    if (off <= RECOVERY_TOLERANCE_PCT) return i;
  }
  return null;
}

function baselineExcluding(series: Series, exclude: Set<string>): number | null {
  const xs: number[] = [];
  for (const [d, v] of series.byDate) if (!exclude.has(d)) xs.push(v);
  return mean(xs);
}

function buildItem(
  g: Group,
  measure: PatternMeasure,
  series: Series,
  unit: "day" | "trip",
): SubtypePattern365 | null {
  const dates = [...g.days.keys()].sort();
  if (dates.length === 0) return null;
  const dateSet = new Set(dates);

  let deltaPct: number | null = null;
  let recoveryDays: number | null = null;

  if (measure === "recovery") {
    const vals: number[] = [];
    for (const d of dates) {
      const r = recoveryDaysAfter(series, d);
      if (r != null) vals.push(r);
    }
    const m = mean(vals);
    recoveryDays = m == null ? null : Math.round(m * 10) / 10;
  } else {
    const observed = mean(dates.map((d) => series.byDate.get(d)).filter(
      (v): v is number => typeof v === "number",
    ));
    const baseline = baselineExcluding(series, dateSet);
    if (observed == null || baseline == null) return null;
    const raw = pctDelta(observed, baseline);
    deltaPct = raw == null ? null : Math.round(raw * 10) / 10;
  }

  const n = dates.length;
  const direction = directionFor(measure, deltaPct, recoveryDays);
  const confidence = confidenceFor(measure, n, deltaPct, recoveryDays);
  const surfaced = !CATEGORY_LEVEL.has(g.categoryId) || g.matchLevel === "category";

  return {
    matchLevel: g.matchLevel,
    categoryId: g.categoryId,
    subtypeId: g.subtypeId,
    subcategory: g.subcategory,
    label: g.label,
    measure,
    unit,
    n,
    deltaPct,
    recoveryDays,
    direction,
    confidence,
    lastSeen: dates[dates.length - 1],
    qualifies: n >= MIN_OCCURRENCES && direction === "harm" && confidence != null,
    surfaced,
    occurrences: dates.slice(-MAX_OCCURRENCES_STORED).map((d) => ({
      date: d,
      title: g.days.get(d) ?? null,
    })),
  };
}

/** Travel (G) category entry — occurrences are trips, effect measured both ways. */
function buildTravelCategoryItems(
  travel: TravelOccurrences,
  seriesByMeasure: Record<"rhr" | "hrv" | "sleep", Series>,
): SubtypePattern365[] {
  const trips = travel.trips ?? [];
  if (trips.length === 0) return [];
  const travelDays = (travel.days ?? []).filter((d) => d.travel).map((d) => d.date);
  const travelDaySet = new Set(travelDays);
  const items: SubtypePattern365[] = [];

  for (const measure of ["rhr", "hrv", "sleep"] as const) {
    const series = seriesByMeasure[measure];
    const baseline = baselineExcluding(series, travelDaySet);
    if (baseline == null) continue;

    const perDayObserved = mean(
      travelDays.map((d) => series.byDate.get(d)).filter(
        (v): v is number => typeof v === "number",
      ),
    );
    const perDayDelta = perDayObserved == null
      ? null
      : Math.round((pctDelta(perDayObserved, baseline) ?? 0) * 10) / 10;

    const tripDeltas: number[] = [];
    const recoveries: number[] = [];
    for (const t of trips) {
      const vals: number[] = [];
      for (let ms = Date.parse(t.start + "T00:00:00Z");
        ms <= Date.parse(t.end + "T00:00:00Z");
        ms += 86_400_000
      ) {
        const v = series.byDate.get(new Date(ms).toISOString().slice(0, 10));
        if (typeof v === "number") vals.push(v);
      }
      const m = mean(vals);
      if (m != null) {
        const d = pctDelta(m, baseline);
        if (d != null) tripDeltas.push(d);
      }
      const r = recoveryDaysAfter(series, t.end);
      if (r != null) recoveries.push(r);
    }

    const tripDelta = mean(tripDeltas);
    const recoveryDays = mean(recoveries);
    const nTrips = trips.length;
    const deltaPct = tripDelta == null ? perDayDelta : Math.round(tripDelta * 10) / 10;
    const direction = directionFor(measure, deltaPct, null);
    const confidence = confidenceFor(measure, nTrips, deltaPct, null);

    items.push({
      matchLevel: "category",
      categoryId: "G",
      subtypeId: null,
      subcategory: null,
      label: "Travel",
      measure,
      unit: "trip",
      n: nTrips,
      deltaPct,
      recoveryDays: recoveryDays == null ? null : Math.round(recoveryDays * 10) / 10,
      direction,
      confidence,
      lastSeen: trips[trips.length - 1]?.end ?? null,
      qualifies: nTrips >= MIN_OCCURRENCES && direction === "harm" &&
        confidence != null,
      surfaced: true,
      perDay: { deltaPct: perDayDelta, n: travelDays.length },
      perTrip: {
        deltaPct: tripDelta == null ? null : Math.round(tripDelta * 10) / 10,
        recoveryDays: recoveryDays == null ? null : Math.round(recoveryDays * 10) / 10,
        n: nTrips,
      },
      occurrences: trips.slice(-MAX_OCCURRENCES_STORED).map((t) => ({
        start: t.start,
        end: t.end,
        days: t.days,
        titles: t.titles.slice(0, 5),
        source: t.sources[0] ?? null,
      })),
    });
  }
  return items;
}

/**
 * Apply the storage cap. A qualifying pattern is NEVER dropped; the cap only
 * trims the rest.
 */
export function applyCap(items: SubtypePattern365[]): SubtypePattern365[] {
  const out: SubtypePattern365[] = [];
  const byMeasure = new Map<PatternMeasure, SubtypePattern365[]>();
  for (const it of items) {
    if (it.qualifies) {
      out.push(it);
      continue;
    }
    const list = byMeasure.get(it.measure) ?? [];
    list.push(it);
    byMeasure.set(it.measure, list);
  }
  for (const list of byMeasure.values()) {
    list.sort((a, b) =>
      Math.abs(b.deltaPct ?? 0) - Math.abs(a.deltaPct ?? 0) || b.n - a.n
    );
    out.push(...list.slice(0, MAX_NON_QUALIFYING_PER_MEASURE));
  }
  return out;
}

/** The whole pass. Pure — never throws on missing data, returns what it can. */
export function computeSubtypePatterns365(
  input: ComputeInput,
): SubtypePatterns365 {
  const seriesByMeasure = {
    rhr: seriesFor(input.wearable, "rhr"),
    hrv: seriesFor(input.wearable, "hrv"),
    sleep: seriesFor(input.wearable, "sleep"),
  };

  const groups = groupEventDays(input.events ?? []);
  const items: SubtypePattern365[] = [];

  for (const g of groups.values()) {
    // Travel's category entry is built from trips, not event days.
    if (g.matchLevel === "category" && g.categoryId === "G") continue;
    for (const measure of ["rhr", "hrv", "sleep"] as const) {
      const it = buildItem(g, measure, seriesByMeasure[measure], "day");
      if (it) items.push(it);
    }
    const rec = buildItem(g, "recovery", seriesByMeasure.rhr, "day");
    if (rec) items.push(rec);
  }

  items.push(...buildTravelCategoryItems(input.travel, seriesByMeasure));

  return {
    generatedAt: new Date().toISOString(),
    windowDays: WINDOW_DAYS_365,
    items: applyCap(items),
    travelDays: (input.travel?.days ?? []).filter((d) => d.travel).map((d) => ({
      date: d.date,
      travel: true,
      source: d.source,
      reason: d.reason,
      titles: d.titles,
    })),
  };
}
