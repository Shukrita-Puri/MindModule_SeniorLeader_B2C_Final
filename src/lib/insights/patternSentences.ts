/**
 * "When You Perform Best" — sentence assembly + guards.
 *
 * The backend (performance-rhythm-insights) emits structured `stats` on every
 * rhythm finding; the app owns copy so templates, polarity and the observation
 * guard can evolve without a function redeploy.
 *
 * Rules (spec):
 *  - Card scope: this card is POSITIVE-ONLY. Trough/negative findings are
 *    dropped here (they belong to the Drains surface).
 *  - Observation guard: n < 3 → never shown. 3–4 → Emerging (hedged copy).
 *    n ≥ 5 → Strong (plain copy).
 *  - Soft cap: max 3 sentences per section.
 *  - Polarity: inverted dims (pressure, RHR, HR) read "lower is better".
 */

export type RhythmKind =
  | 'peak-window' | 'low-window' | 'peak-day' | 'low-day'
  | 'consecutive-neg' | 'consecutive-pos' | 'cell-peak';

export type RhythmDimension =
  | 'clarity' | 'emotion' | 'pressure' | 'regulation'
  | 'hrv' | 'sleep_score' | 'sleep_duration' | 'sleep_efficiency'
  | 'rhr' | 'hr';

export interface RhythmStats {
  day?: number;
  comparisonDay?: number;
  window?: number;
  comparisonWindow?: number;
  bestPct?: number;
  comparePct?: number;
  gapPp?: number;
  runLength?: number;
  lastDate?: string;
  n: number;
  dates: string[];
  rawValues?: number[];
  source: 'check-in' | 'wearable';
  polarity: 'high' | 'low';
}

export interface RhythmFinding {
  kind: RhythmKind;
  dimension: RhythmDimension;
  text: string;
  longText: string;
  confidence: number;
  observations: number;
  priorityScore: number;
  stats?: RhythmStats;
}

export type ConfidenceTier = 'insufficient' | 'emerging' | 'strong';

export const CHECK_IN_DIMS = new Set<RhythmDimension>(['clarity', 'emotion', 'pressure', 'regulation']);
export const INVERTED_DIMS = new Set<RhythmDimension>(['pressure', 'rhr', 'hr']);

export const DIM_LABELS: Record<RhythmDimension, string> = {
  clarity: 'Clarity',
  emotion: 'Emotion',
  pressure: 'Pressure',
  regulation: 'Regulation',
  hrv: 'HRV',
  sleep_score: 'Sleep Score',
  sleep_duration: 'Sleep Duration',
  sleep_efficiency: 'Sleep Efficiency',
  rhr: 'Resting Heart Rate',
  hr: 'Heart Rate',
};

/**
 * Positive-direction phrase per dimension (polarity-aware). Complete phrase —
 * it already carries the noun where one reads naturally, so templates must not
 * append DIM_NOUN after it ("most composed composure" is a bug).
 */
const POSITIVE_ADJECTIVE: Record<RhythmDimension, string> = {
  clarity: 'sharpest clarity',
  emotion: 'steadiest emotional read',
  pressure: 'most composed',      // inverted: low pressure = composed
  regulation: 'most regulated',
  hrv: 'most recovered',
  sleep_score: 'best-slept',
  sleep_duration: 'best-rested',
  sleep_efficiency: 'most efficient sleep',
  rhr: 'most recovered',          // inverted: low RHR = recovered
  hr: 'most settled',             // inverted
};

/** Short noun used mid-sentence. */
const DIM_NOUN: Record<RhythmDimension, string> = {
  clarity: 'clarity',
  emotion: 'emotional steadiness',
  pressure: 'composure',
  regulation: 'self-regulation',
  hrv: 'HRV',
  sleep_score: 'sleep quality',
  sleep_duration: 'sleep duration',
  sleep_efficiency: 'sleep efficiency',
  rhr: 'resting heart rate',
  hr: 'heart rate',
};

export const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const WINDOW_LABELS = ['Morning', 'Afternoon', 'Evening'];

const POSITIVE_KINDS = new Set<RhythmKind>(['peak-day', 'peak-window', 'cell-peak', 'consecutive-pos']);

/** Positive-only card scope: keep peaks and positive runs. */
export function isPositiveFinding(f: RhythmFinding): boolean {
  return POSITIVE_KINDS.has(f.kind);
}

export function confidenceTier(n: number): ConfidenceTier {
  if (n < 3) return 'insufficient';
  if (n < 5) return 'emerging';
  return 'strong';
}

/**
 * Observation guard (spec 4): tier is driven by BOTH observation count and the
 * size of the gap, per pattern shape. Anything below emerging is dropped.
 * Emerging gap floor is 15pp so real, still-forming trends surface hedged
 * instead of disappearing.
 */
export function guardTier(f: RhythmFinding): ConfidenceTier {
  const s = f.stats;
  if (!s) return 'insufficient';
  const n = s.n;
  const gap = s.gapPp ?? 0;

  if (f.kind === 'consecutive-pos') {
    const run = s.runLength ?? 0;
    if (run >= 3) return 'strong';
    if (run >= 2) return 'emerging';
    return 'insufficient';
  }
  if (f.kind === 'cell-peak') {
    if (n >= 5 && gap >= 30) return 'strong';
    if (n >= 3 && gap >= 15) return 'emerging';
    return 'insufficient';
  }
  // peak-day / peak-window
  if (n >= 6 && gap >= 30) return 'strong';
  if (n >= 3 && gap >= 15) return 'emerging';
  return 'insufficient';
}

/** Card-only ranking overrides (spec 6). Shared backend weights untouched. */
export const CARD_KIND_WEIGHT: Partial<Record<RhythmKind, number>> = {
  'cell-peak': 1.0,
  'consecutive-pos': 0.95,
  'peak-day': 0.85,
  'peak-window': 0.78,
};

export type CheckInDimension = 'clarity' | 'emotion' | 'pressure' | 'regulation';

/**
 * Section B stays global (nothing is excluded), but each check-in tab prefers
 * the physiology dimensions most relevant to it, so the four tabs don't all
 * read identically.
 */
export const TAB_AFFINITY: Record<CheckInDimension, RhythmDimension[]> = {
  clarity: ['sleep_score', 'sleep_duration', 'hrv'],
  emotion: ['hrv', 'rhr', 'sleep_efficiency'],
  pressure: ['rhr', 'hr', 'hrv'],
  regulation: ['hrv', 'rhr', 'sleep_score'],
};

/** Affinity bonus: first preference 0.30, then 0.20, 0.10; others 0. */
export function affinityBonus(dim: RhythmDimension, tab?: CheckInDimension | null): number {
  if (!tab) return 0;
  const idx = TAB_AFFINITY[tab].indexOf(dim);
  return idx === -1 ? 0 : 0.3 - idx * 0.1;
}


function pluralDay(di: number): string {
  return `${DAYS_FULL[di] ?? 'Day'}s`;
}

/** Assemble the app-facing sentence from structured stats. Null = not renderable. */
export function buildSentence(f: RhythmFinding): { text: string; tier: ConfidenceTier } | null {
  const s = f.stats;
  if (!s) return null;
  if (!isPositiveFinding(f)) return null;
  let tier = guardTier(f);
  if (tier === 'insufficient') return null;
  // A "peak" under a 50% positive rate is a relative gap, not an absolute peak.
  // It still carries signal when the gap is wide, so keep it — but only ever in
  // hedged, emerging wording.
  if (s.bestPct != null && s.bestPct < 50) {
    if ((s.gapPp ?? 0) < 20) return null;
    tier = 'emerging';
  }




  const adj = POSITIVE_ADJECTIVE[f.dimension];
  const noun = DIM_NOUN[f.dimension];
  const isWearable = s.source === 'wearable';
  let core: string | null = null;

  // Wearables write one row per night (tw is always 0), so time-of-day
  // phrasing would be a lie for them — day-scoped copy only.
  if (f.kind === 'cell-peak' && s.day != null && s.window != null && !isWearable) {
    core = `${DAYS_FULL[s.day]} ${(WINDOW_LABELS[s.window] ?? '').toLowerCase()}s are your ${adj} window — ${s.bestPct}% across ${s.n} check-ins`;
  } else if (f.kind === 'cell-peak' && s.day != null && isWearable) {
    core = `${noun.charAt(0).toUpperCase()}${noun.slice(1)} sits ${s.polarity === 'low' ? 'lowest' : 'highest'} on ${pluralDay(s.day)} — ${s.bestPct}% of those nights in your best band`;
  } else if (f.kind === 'peak-window' && s.window != null && !isWearable) {
    const cmp = s.comparisonWindow != null ? ` vs ${s.comparePct}% in the ${(WINDOW_LABELS[s.comparisonWindow] ?? '').toLowerCase()}` : '';
    core = `${WINDOW_LABELS[s.window]}s are your ${adj} window — ${s.bestPct}%${cmp}`;
  } else if (f.kind === 'peak-day' && s.day != null) {
    const cmp = s.comparisonDay != null ? ` vs ${s.comparePct}% on ${pluralDay(s.comparisonDay)}` : '';
    core = isWearable
      ? `${noun.charAt(0).toUpperCase()}${noun.slice(1)} runs ${s.polarity === 'low' ? 'lowest' : 'highest'} on ${pluralDay(s.day)} — ${s.bestPct}% of them in your best band${cmp}`
      : `${pluralDay(s.day)} run your ${adj} — ${s.bestPct}%${cmp}`;
  } else if (f.kind === 'consecutive-pos' && s.day != null && s.runLength) {
    core = `${s.runLength} ${pluralDay(s.day)} in a row in your ${adj} band`;
  }

  if (!core) return null;
  // No observation counts in user-facing copy (spec 8) — they live in the
  // reliability audit panel only.
  const text = tier === 'emerging'
    ? `Early signal — ${core.charAt(0).toLowerCase()}${core.slice(1)}. Pattern still forming.`
    : `${core}.`;
  return { text, tier };
}

export interface PatternSentence {
  text: string;
  tier: ConfidenceTier;
  dimension: RhythmDimension;
  dimLabel: string;
  finding: RhythmFinding;
}

/**
 * Build the renderable sentences for one section.
 * Reweighting: Strong tier always outranks Emerging; ties break on the
 * card-only kind weight, then on the backend priority score.
 * One sentence per dimension, hard cap 3.
 */
export function buildSection(
  findings: RhythmFinding[],
  scope: 'check-in' | 'wearable',
  cap = 3,
  /**
   * 'dimension' — one sentence per dimension (mixed-dimension sections).
   * 'kind' — one sentence per pattern shape, used when the section is already
   * scoped to a single dimension so day / window / streak findings can all
   * surface (e.g. "Evenings are your sharpest clarity window" alongside
   * "3 Fridays in a row…").
   */
  dedupeBy: 'dimension' | 'kind' = 'dimension',
  /**
   * Active check-in tab. Nothing is excluded — it only adds a small ranking
   * bonus to the physiology dimensions most relevant to that tab, so Section B
   * reads differently per tab instead of repeating the same three lines.
   */
  tab?: CheckInDimension | null,
): PatternSentence[] {
  const rows: PatternSentence[] = [];
  for (const f of findings) {
    const inScope = scope === 'check-in' ? CHECK_IN_DIMS.has(f.dimension) : !CHECK_IN_DIMS.has(f.dimension);
    if (!inScope) continue;
    const built = buildSentence(f);
    if (!built) continue;
    rows.push({ ...built, dimension: f.dimension, dimLabel: DIM_LABELS[f.dimension], finding: f });
  }
  const score = (r: PatternSentence) =>
    (CARD_KIND_WEIGHT[r.finding.kind] ?? 0) + affinityBonus(r.dimension, tab);
  rows.sort((a, b) => {
    const tierRank = (t: ConfidenceTier) => (t === 'strong' ? 1 : 0);
    const d = tierRank(b.tier) - tierRank(a.tier);
    if (d !== 0) return d;
    const w = score(b) - score(a);
    if (w !== 0) return w;
    return b.finding.priorityScore - a.finding.priorityScore;
  });
  const seen = new Set<string>();
  const out: PatternSentence[] = [];
  for (const r of rows) {
    const key = dedupeBy === 'kind' ? `${r.dimension}:${r.finding.kind}` : r.dimension;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= cap) break;
  }
  return out;
}

// ── Pipeline B: baseline / performance-lift lines ─────────────────────
// Ranked and guarded the same way Pipeline A findings are, so every Section B
// line is traceable. Positive-only, like the rest of the card.

export type LiftConfidence = 'strong' | 'emerging';
export type LiftWindow = 'morning' | 'afternoon' | 'evening';

export interface PerformanceLiftPayload {
  hr_event_lift?: Array<{
    categoryId?: string;
    categoryName: string;
    hrDeltaBpm: number;
    compositeLift: number;
    n: number;
  }> | null;
  category_lift?: Array<{
    categoryId?: string;
    categoryName: string;
    hrDeltaBpm?: number;
    compositeLift: number;
    n: number;
  }> | null;
  sleep_to_peak?: { deltaPct: number; n: number; bestWindow: LiftWindow | null } | null;
  rhr_recovery_window?: { window: LiftWindow; liftPct: number; n: number } | null;
  recovery_streak_to_peak?: { avgStreakLength: number; n: number } | null;
}

export type LiftKey =
  | 'sleep_to_peak' | 'hr_event_lift' | 'rhr_recovery_window'
  | 'recovery_streak_to_peak' | 'category_lift' | 'best_window' | 'calendar_insight';

export interface LiftLine {
  key: LiftKey;
  text: string;
  tier: 'strong' | 'emerging';
  weight: number;
}

/** Base ranking weights (spec 6, Pipeline B). */
export const LIFT_WEIGHT: Record<LiftKey, number> = {
  sleep_to_peak: 0.92,
  hr_event_lift: 0.82,
  rhr_recovery_window: 0.80,
  recovery_streak_to_peak: 0.75,
  category_lift: 0.72,
  best_window: 0.60,
  calendar_insight: 0.55,
};

/** Per-tab affinity for Pipeline B lines (bonus only, never exclusion). */
export const LIFT_AFFINITY: Record<CheckInDimension, Partial<Record<LiftKey, number>>> = {
  clarity: { sleep_to_peak: 0.3, best_window: 0.1 },
  emotion: { hr_event_lift: 0.3, rhr_recovery_window: 0.2 },
  pressure: { rhr_recovery_window: 0.3, hr_event_lift: 0.2 },
  regulation: { recovery_streak_to_peak: 0.3, hr_event_lift: 0.1 },
};

/**
 * Observation guard for Pipeline B: strong at n >= 5 and >= 15% delta,
 * emerging at n >= 3 and >= 10%. Anything else is dropped.
 */
export function liftTier(n: number, deltaPct: number): 'strong' | 'emerging' | null {
  const d = Math.abs(deltaPct);
  if (n >= 5 && d >= 15) return 'strong';
  if (n >= 3 && d >= 10) return 'emerging';
  return null;
}

function hedge(tier: 'strong' | 'emerging', core: string): string {
  return tier === 'emerging'
    ? `Early signal — ${core.charAt(0).toLowerCase()}${core.slice(1)}. Pattern still forming.`
    : `${core}.`;
}

function windowWord(w?: LiftWindow | null): string {
  return w ? w.toLowerCase() : '';
}

/**
 * Build the ranked, guarded Pipeline B lines for the active tab.
 * `bestWindowLabel` and `calendarInsight` are routed through the same ranking
 * so no line bypasses the pipeline.
 */
export function buildLiftLines(
  lift: PerformanceLiftPayload | null,
  opts: {
    hasCalendar?: boolean;
    tab?: CheckInDimension | null;
    bestWindowLabel?: string | null;
    calendarInsight?: string | null;
  } = {},
  cap = 3,
): LiftLine[] {
  const { hasCalendar = false, tab = null, bestWindowLabel = null, calendarInsight = null } = opts;
  const lines: LiftLine[] = [];
  const push = (key: LiftKey, tier: 'strong' | 'emerging' | null, core: string) => {
    if (!tier) return;
    lines.push({ key, tier, text: hedge(tier, core), weight: LIFT_WEIGHT[key] + (tab ? (LIFT_AFFINITY[tab][key] ?? 0) : 0) });
  };

  const sleep = lift?.sleep_to_peak;
  if (sleep && sleep.deltaPct > 0) {
    push(
      'sleep_to_peak',
      liftTier(sleep.n, sleep.deltaPct),
      `On your best-sleep nights, next-day readiness runs +${sleep.deltaPct}% above baseline${sleep.bestWindow ? ` — peaking in the ${windowWord(sleep.bestWindow)}` : ''}`,
    );
  }

  // hr_event_lift: the highest-weighted physiological demand signal after sleep.
  const hrEvent = (lift?.hr_event_lift ?? []).filter((e) => e.compositeLift > 0)
    .sort((a, b) => b.compositeLift - a.compositeLift)[0];
  if (hrEvent) {
    const bpm = Math.abs(Math.round(hrEvent.hrDeltaBpm));
    push(
      'hr_event_lift',
      liftTier(hrEvent.n, hrEvent.compositeLift),
      `You hold your physiology best around ${hrEvent.categoryName} — heart rate stays ${bpm} bpm steadier and readiness lifts +${hrEvent.compositeLift}%`,
    );
  }

  const rec = lift?.rhr_recovery_window;
  if (rec && rec.liftPct > 0) {
    push(
      'rhr_recovery_window',
      liftTier(rec.n, rec.liftPct),
      `On well-recovered days your ${windowWord(rec.window)} leads by +${rec.liftPct}%`,
    );
  }

  const streak = lift?.recovery_streak_to_peak;
  if (streak && streak.avgStreakLength > 0) {
    // Streak length is not a percentage delta — guard on observations only.
    const tier = streak.n >= 5 ? 'strong' : streak.n >= 3 ? 'emerging' : null;
    push(
      'recovery_streak_to_peak',
      tier,
      `Your peak days typically follow ${streak.avgStreakLength} consecutive low-RHR day${streak.avgStreakLength === 1 ? '' : 's'}`,
    );
  }

  if (hasCalendar) {
    const thriving = (lift?.category_lift ?? []).filter((c) => c.compositeLift > 0)
      .sort((a, b) => b.compositeLift - a.compositeLift).slice(0, 2);
    if (thriving.length > 0) {
      push(
        'category_lift',
        liftTier(thriving[0].n, thriving[0].compositeLift),
        `You thrive in ${thriving.map((c) => c.categoryName).join(' and ')} — readiness lifts +${thriving[0].compositeLift}% on those days`,
      );
    }
  }

  if (bestWindowLabel) {
    lines.push({
      key: 'best_window', tier: 'emerging', text: `Sharpest window: ${bestWindowLabel}.`,
      weight: LIFT_WEIGHT.best_window + (tab ? (LIFT_AFFINITY[tab].best_window ?? 0) : 0),
    });
  }
  if (calendarInsight) {
    lines.push({ key: 'calendar_insight', tier: 'emerging', text: calendarInsight, weight: LIFT_WEIGHT.calendar_insight });
  }

  lines.sort((a, b) => {
    const t = (a.tier === 'strong' ? 1 : 0);
    const d = (b.tier === 'strong' ? 1 : 0) - t;
    if (d !== 0) return d;
    return b.weight - a.weight;
  });
  return lines.slice(0, cap);
}



/** Empty-state copy (spec 9). `no-data` = nothing recorded yet. */
export const EMPTY_STATE: Record<'check-in' | 'wearable', string> = {
  'check-in': 'No clear positive check-in patterns yet for this window — your data is building.',
  wearable: 'No clear performance signals yet for this window — patterns will surface as your data grows.',
};

export const NO_DATA_STATE: Record<'check-in' | 'wearable', string> = {
  'check-in': 'Patterns surface after a few check-ins. Keep going — your first signals are forming.',
  wearable: 'Wearable and calendar patterns will appear here once your data builds.',
};

export const EARLY_PATTERN_NOTE = 'Early patterns — building confidence with each check-in.';

