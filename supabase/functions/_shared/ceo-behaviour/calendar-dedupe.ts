/**
 * Cross-calendar duplicate collapse for CEO-behaviour load aggregation.
 *
 * Complements (does not replace) executive-state-taxonomy.dedupeCalendarEvents,
 * which keys strictly on (normalizedTitle | startMs). This helper adds:
 *   - title-agnostic timeslot match: |startA-startB| < 2min AND |endA-endB| < 2min
 *   - all-day event exclusion from back-to-back hour aggregation
 *   - structured dedupe reason logging for telemetry
 *
 * Returns a canonical event set + the aggregated back-to-back hour count for the
 * day. Used by multiCalendarLoad and (transitively) backToBackLoadOverride.
 */
export type LoadEvent = {
  id?: string;
  title?: string | null;
  startMs: number;
  endMs: number;
  source?: string | null;
  allDay?: boolean;
  stakesLevel?: string | null;
};

export type DedupeReason = "title" | "timeslot" | "all-day-filter";

export interface DedupeResult {
  canonical: LoadEvent[];
  removed: Array<{ id?: string; reason: DedupeReason }>;
  sources: string[];
  backToBackHoursAggregated: number;
}

const TWO_MIN_MS = 2 * 60 * 1000;

function normalizeTitle(t: string | null | undefined): string {
  return (t || "")
    .toLowerCase()
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\s\-_/\\.,:;!?'"()\[\]]+/g, " ")
    .trim();
}

export function dedupeForLoad(events: LoadEvent[]): DedupeResult {
  const removed: DedupeResult["removed"] = [];
  // 1. Drop all-day events from load aggregation.
  const dayEvents: LoadEvent[] = [];
  for (const e of events) {
    if (e.allDay) {
      removed.push({ id: e.id, reason: "all-day-filter" });
      continue;
    }
    dayEvents.push(e);
  }

  // 2. Title-exact + same-start dedupe (existing contract).
  const byKey = new Map<string, LoadEvent>();
  const orphans: LoadEvent[] = [];
  for (const e of dayEvents) {
    const t = normalizeTitle(e.title);
    if (!t) {
      orphans.push(e);
      continue;
    }
    const key = `${t}|${Math.round(e.startMs / 60000)}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, e);
    } else {
      removed.push({ id: e.id, reason: "title" });
    }
  }

  // 3. Title-agnostic timeslot dedupe (±2 min on both ends).
  const pool = [...byKey.values(), ...orphans].sort((a, b) => a.startMs - b.startMs);
  const canonical: LoadEvent[] = [];
  for (const e of pool) {
    const dup = canonical.find(
      (c) =>
        Math.abs(c.startMs - e.startMs) < TWO_MIN_MS &&
        Math.abs(c.endMs - e.endMs) < TWO_MIN_MS &&
        (c.source ?? null) !== (e.source ?? null),
    );
    if (dup) {
      removed.push({ id: e.id, reason: "timeslot" });
      continue;
    }
    canonical.push(e);
  }

  // 4. Aggregated back-to-back hours = sum(duration) on overlapping/contiguous chain
  //    where consecutive events have gap <15min.
  const sorted = [...canonical].sort((a, b) => a.startMs - b.startMs);
  let total = 0;
  let chainStart: number | null = null;
  let chainEnd: number | null = null;
  for (const e of sorted) {
    if (chainEnd != null && e.startMs - chainEnd <= 15 * 60 * 1000) {
      chainEnd = Math.max(chainEnd, e.endMs);
    } else {
      if (chainStart != null && chainEnd != null) {
        total += (chainEnd - chainStart) / (60 * 60 * 1000);
      }
      chainStart = e.startMs;
      chainEnd = e.endMs;
    }
  }
  if (chainStart != null && chainEnd != null) {
    total += (chainEnd - chainStart) / (60 * 60 * 1000);
  }

  const sources = Array.from(
    new Set(canonical.map((e) => e.source).filter((s): s is string => Boolean(s))),
  );

  return {
    canonical,
    removed,
    sources,
    backToBackHoursAggregated: Math.round(total * 10) / 10,
  };
}
