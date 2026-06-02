// MRS v3 — Internal helpers shared by the three window-context builders.
//
// Pure functions only. No DB calls. No throws on bad data. Used by
// morning/afternoon/evening-context.ts so each window stays focused on the
// shape of its output, not on event parsing mechanics.

import type { ClassifiedEventLite, DemandLevel } from './types.ts';
import type { EventLite, StakesCategory } from './window-context-types.ts';
import { computeCalendarDemand } from './demand-scorer.ts';
import { computeCognitiveFragmentation } from './cognitive-fragmentation.ts';
import { classifyEvent } from '../executive-state-taxonomy.ts';

/** A–C are externally-visible stakes; D is conflict/people; E is deep work. */
export const HIGH_STAKES_CATEGORIES: ReadonlySet<StakesCategory> =
  new Set<StakesCategory>(['A', 'B', 'C']);

/** Stakes ranking for `highestCompletedCategory` / `highestRemainingStakes`. */
const STAKES_RANK: Record<string, number> = {
  A: 8, B: 7, C: 6, D: 5, E: 4, F: 3, G: 2, H: 1,
};

function safeTime(value: string | Date | undefined | null): number | null {
  if (value == null) return null;
  const t = typeof value === 'string' ? new Date(value).getTime() : value.getTime();
  return Number.isFinite(t) ? t : null;
}

export function categoryOf(title: string | null | undefined): StakesCategory | null {
  if (!title) return null;
  const ev = classifyEvent(title);
  if (!ev || !ev.categoryId) return null;
  const id = String(ev.categoryId).toUpperCase();
  return STAKES_RANK[id] ? (id as StakesCategory) : null;
}

export function toEventLite(
  e: ClassifiedEventLite,
  now?: Date,
): EventLite {
  const start = safeTime(e.start_time);
  const cat = categoryOf(e.title);
  const lite: EventLite = {
    title: e.title ?? '',
    startTime: typeof e.start_time === 'string' ? e.start_time : new Date(e.start_time).toISOString(),
    endTime: typeof e.end_time === 'string' ? e.end_time : new Date(e.end_time).toISOString(),
    category: cat,
  };
  if (now && start != null) {
    lite.minutesUntil = Math.round((start - now.getTime()) / 60000);
  }
  return lite;
}

export function splitByNow(
  events: ClassifiedEventLite[],
  now: Date,
): { completed: ClassifiedEventLite[]; remaining: ClassifiedEventLite[] } {
  const t = now.getTime();
  const completed: ClassifiedEventLite[] = [];
  const remaining: ClassifiedEventLite[] = [];
  for (const e of events) {
    const end = safeTime(e.end_time);
    const start = safeTime(e.start_time);
    if (end != null && end <= t) completed.push(e);
    else if (start != null && start >= t) remaining.push(e);
    else remaining.push(e); // in-progress → treat as remaining
  }
  return { completed, remaining };
}

export function loadScore(events: ClassifiedEventLite[]): {
  score: number; level: DemandLevel; hasHighStakes: boolean;
} {
  if (!events.length) return { score: 0, level: 'low', hasHighStakes: false };
  const demand = computeCalendarDemand(events);
  return {
    score: demand.demandScore,
    level: demand.load,
    hasHighStakes: demand.hasHighStakes,
  };
}

export function hasConflict(events: ClassifiedEventLite[]): boolean {
  // Conflict = any classified Category D event, or two events overlapping in time.
  for (const e of events) {
    if (categoryOf(e.title) === 'D') return true;
  }
  const sorted = events
    .map((e) => ({ s: safeTime(e.start_time), e: safeTime(e.end_time) }))
    .filter((x): x is { s: number; e: number } => x.s != null && x.e != null)
    .sort((a, b) => a.s - b.s);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].s < sorted[i - 1].e) return true;
  }
  return false;
}

export function highestCategory(events: ClassifiedEventLite[]): StakesCategory | null {
  let best: StakesCategory | null = null;
  let bestRank = 0;
  for (const e of events) {
    const c = categoryOf(e.title);
    if (!c) continue;
    const r = STAKES_RANK[c] ?? 0;
    if (r > bestRank) { best = c; bestRank = r; }
  }
  return best;
}

export function firstHighStakes(
  events: ClassifiedEventLite[],
  now: Date,
): EventLite | null {
  const sorted = [...events].sort((a, b) => {
    const ta = safeTime(a.start_time) ?? 0;
    const tb = safeTime(b.start_time) ?? 0;
    return ta - tb;
  });
  for (const e of sorted) {
    const c = categoryOf(e.title);
    if (c && HIGH_STAKES_CATEGORIES.has(c)) return toEventLite(e, now);
  }
  return null;
}

export function meetingCount(events: ClassifiedEventLite[]): number {
  return events.filter((e) => {
    const s = safeTime(e.start_time);
    const en = safeTime(e.end_time);
    if (s == null || en == null) return false;
    return en > s; // exclude all-day-style sentinel rows
  }).length;
}

export function backToBackHours(events: ClassifiedEventLite[]): number {
  return computeCognitiveFragmentation(
    events.map((e) => ({ start_time: e.start_time, end_time: e.end_time })),
  ).back_to_back_hours;
}

export function availableGapsCount(
  events: ClassifiedEventLite[],
  minGapMinutes = 15,
): number {
  const slots = events
    .map((e) => ({ s: safeTime(e.start_time), e: safeTime(e.end_time) }))
    .filter((x): x is { s: number; e: number } => x.s != null && x.e != null)
    .sort((a, b) => a.s - b.s);
  let n = 0;
  for (let i = 1; i < slots.length; i++) {
    const gapMin = (slots[i].s - slots[i - 1].e) / 60000;
    if (gapMin >= minGapMinutes) n += 1;
  }
  return n;
}

export function deviationPct(
  current: number | null | undefined,
  baseline: number | null | undefined,
): number | null {
  if (current == null || baseline == null || !Number.isFinite(baseline) || baseline === 0) {
    return null;
  }
  return Math.round(((current - baseline) / baseline) * 100);
}