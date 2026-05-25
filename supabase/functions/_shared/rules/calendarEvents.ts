/**
 * Cross-app calendar event rules.
 *
 * Single source of truth for:
 *   - Cross-calendar duplicate collapse (same event in 2 calendars => 1)
 *   - Load unit counting (overlapping different titles in same slot => 1 unit)
 *   - Importance ranking (user tag > historical relationship weight > heuristics)
 *   - "Next Up" event picker for the Brief signal pill
 *
 * Consumed by:
 *   - src/components/home/CalendarReplacementPickerModal.tsx (display dedupe)
 *   - src/components/home/TodayThreePriorities.tsx (load counts)
 *   - supabase/functions/_shared/rules/calendarEvents.ts (Deno mirror -- KEEP IN SYNC)
 *     used by generate-mastery-plan, smart-nudges, list-replacement-calendar-events,
 *     and any future brief generator that needs Next Up.
 *
 * Add new cross-cutting rules as sibling files in src/utils/rules/, not here.
 */

export type Period = 'morning' | 'afternoon' | 'evening';

export interface RuleEvent {
  id: string;
  title: string;
  startTime: string; // ISO
  endTime: string;   // ISO
  provider?: string | null;
  attendeesCount?: number | null;
  isOrganizer?: boolean | null;
  isRecurring?: boolean | null;
}

export interface ImportanceContext {
  /** From plan_ledger.userEdits.slotEdits keyed by normalized title. */
  userPriorityByTitle?: Record<string, 'high' | 'medium' | 'low' | null>;
  userRelationshipByTitle?: Record<string, string | null>;
  /** Aggregated weights from causality_findings.signal_summary
   *  (priority_tag_observation) keyed by relationship token. */
  historicalRelationshipWeight?: Record<string, number>;
}

export interface EventImportance {
  score: number;       // 0..1
  reason: string;      // human-auditable, e.g. "high tag + board keyword"
}

const PROVIDER_PRECEDENCE_IOS = ['apple', 'google', 'microsoft'];
const PROVIDER_PRECEDENCE_WEB = ['google', 'microsoft', 'apple'];
const HIGH_STAKES_KEYWORDS = [
  'board', 'quarterly', 'investor', 'pitch', 'client',
  'review', 'presentation', 'interview', 'budget', 'strategy',
  'executive', 'stakeholder', 'all-hands', 'all hands',
];

function normalizeTitle(t: string | null | undefined): string {
  return (t || '')
    .toLowerCase()
    .replace(/[\s\-_/\\.,:;!?'"()\[\]]+/g, ' ')
    .trim();
}

function providerRank(provider: string | null | undefined, platform: 'ios' | 'web'): number {
  const list = platform === 'web' ? PROVIDER_PRECEDENCE_WEB : PROVIDER_PRECEDENCE_IOS;
  const idx = list.indexOf((provider || '').toLowerCase());
  return idx === -1 ? 99 : idx;
}

/** Period bucket for a local hour (matches Standardized Time Windows memory). */
export function periodFor(date: Date): Period {
  const h = date.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  return 'evening';
}

/**
 * Collapse the same event across multiple calendars to a single row.
 * Match key = normalizedTitle + roundedStartMinute + roundedEndMinute.
 * Winner = best provider per platform precedence.
 */
export function collapseDuplicateEvents<T extends RuleEvent>(
  events: T[],
  platform: 'ios' | 'web' = 'web',
): T[] {
  const groups = new Map<string, T[]>();
  for (const e of events) {
    if (!e?.startTime || !e?.endTime) continue;
    const startMin = Math.round(new Date(e.startTime).getTime() / 60000);
    const endMin = Math.round(new Date(e.endTime).getTime() / 60000);
    const key = `${normalizeTitle(e.title)}|${startMin}|${endMin}`;
    const bucket = groups.get(key) || [];
    bucket.push(e);
    groups.set(key, bucket);
  }
  const winners: T[] = [];
  for (const bucket of groups.values()) {
    bucket.sort((a, b) => providerRank(a.provider, platform) - providerRank(b.provider, platform));
    winners.push(bucket[0]);
  }
  return winners.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
}

/**
 * Count "load units" for the day. Overlapping distinct meetings collapse to 1.
 * Input should already be passed through collapseDuplicateEvents.
 */
export function countLoadUnits<T extends RuleEvent>(events: T[]): {
  loadUnits: number;
  byPeriod: Record<Period, number>;
} {
  const byPeriod: Record<Period, number> = { morning: 0, afternoon: 0, evening: 0 };
  if (events.length === 0) return { loadUnits: 0, byPeriod };

  const sorted = [...events].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
  let clusterStart = new Date(sorted[0].startTime);
  let clusterEnd = new Date(sorted[0].endTime);
  let units = 0;
  const closeCluster = () => {
    units++;
    byPeriod[periodFor(clusterStart)]++;
  };
  for (let i = 1; i < sorted.length; i++) {
    const s = new Date(sorted[i].startTime);
    const e = new Date(sorted[i].endTime);
    // Overlap = next start < current cluster end. Touching back-to-back (=) stays separate.
    if (s.getTime() < clusterEnd.getTime()) {
      if (e > clusterEnd) clusterEnd = e;
    } else {
      closeCluster();
      clusterStart = s;
      clusterEnd = e;
    }
  }
  closeCluster();
  return { loadUnits: units, byPeriod };
}

/** Score one event. Higher = more important. */
export function scoreImportance(event: RuleEvent, ctx: ImportanceContext = {}): EventImportance {
  const titleKey = normalizeTitle(event.title);
  const reasons: string[] = [];
  let score = 0;

  // 1. Explicit user importance tag (strongest signal).
  const userTag = ctx.userPriorityByTitle?.[titleKey];
  if (userTag === 'high')   { score += 0.5; reasons.push('high tag'); }
  if (userTag === 'medium') { score += 0.25; reasons.push('medium tag'); }
  if (userTag === 'low')    { score -= 0.1; reasons.push('low tag'); }

  // 2. Historical relationship weight (from causality_findings).
  const rel = ctx.userRelationshipByTitle?.[titleKey];
  if (rel) {
    const w = ctx.historicalRelationshipWeight?.[rel] ?? 0;
    if (w > 0) { score += Math.min(0.25, w * 0.25); reasons.push(rel); }
  }

  // 3. Heuristics.
  const t = (event.title || '').toLowerCase();
  for (const kw of HIGH_STAKES_KEYWORDS) {
    if (t.includes(kw)) { score += 0.15; reasons.push(`${kw} keyword`); break; }
  }
  if (event.isOrganizer) { score += 0.05; reasons.push('organizer'); }
  if ((event.attendeesCount ?? 0) >= 5) { score += 0.1; reasons.push('large attendance'); }
  if (event.isRecurring) { score -= 0.05; reasons.push('recurring'); }

  // Clamp 0..1
  score = Math.max(0, Math.min(1, score));
  return { score, reason: reasons.join(' + ') || 'baseline' };
}

/** Sort events by importance, ties broken by earliest start. */
export function rankByImportance<T extends RuleEvent>(
  events: T[],
  ctx: ImportanceContext = {},
): Array<T & { importance: EventImportance }> {
  return events
    .map((e) => ({ ...e, importance: scoreImportance(e, ctx) }))
    .sort((a, b) => {
      if (b.importance.score !== a.importance.score) return b.importance.score - a.importance.score;
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });
}

/**
 * Pick the single most-important upcoming event from a candidate window.
 * If two events overlap on the same slot, the importance score breaks the tie.
 */
export function pickNextUp<T extends RuleEvent>(
  events: T[],
  ctx: ImportanceContext = {},
  now: Date = new Date(),
): (T & { importance: EventImportance }) | null {
  const future = events.filter((e) => new Date(e.endTime).getTime() > now.getTime());
  if (future.length === 0) return null;
  const deduped = collapseDuplicateEvents(future);
  // First find the next time-slot: events that start at/after the earliest upcoming start
  // and overlap with it.
  const sorted = [...deduped].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
  const firstStart = new Date(sorted[0].startTime).getTime();
  const firstEnd = new Date(sorted[0].endTime).getTime();
  const slotCandidates = sorted.filter((e) => {
    const s = new Date(e.startTime).getTime();
    return s < firstEnd || s === firstStart;
  });
  const ranked = rankByImportance(slotCandidates, ctx);
  return ranked[0] ?? null;
}