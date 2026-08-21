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
    if (n >= 3 && gap >= 20) return 'emerging';
    return 'insufficient';
  }
  // peak-day / peak-window
  if (n >= 6 && gap >= 30) return 'strong';
  if (n >= 3 && gap >= 20) return 'emerging';
  return 'insufficient';
}

/** Card-only ranking overrides (spec 6). Shared backend weights untouched. */
export const CARD_KIND_WEIGHT: Partial<Record<RhythmKind, number>> = {
  'cell-peak': 1.0,
  'consecutive-pos': 0.95,
  'peak-day': 0.85,
  'peak-window': 0.78,
};

function pluralDay(di: number): string {
  return `${DAYS_FULL[di] ?? 'Day'}s`;
}

/** Assemble the app-facing sentence from structured stats. Null = not renderable. */
export function buildSentence(f: RhythmFinding): { text: string; tier: ConfidenceTier } | null {
  const s = f.stats;
  if (!s) return null;
  if (!isPositiveFinding(f)) return null;
  const tier = guardTier(f);
  if (tier === 'insufficient') return null;
  // A "peak" must actually be good in absolute terms, not merely the least-bad
  // bucket. Anything under a 50% positive rate is a relative gap, not a peak.
  if (s.bestPct != null && s.bestPct < 50) return null;


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
  const text = tier === 'emerging'
    ? `Early signal — ${core.charAt(0).toLowerCase()}${core.slice(1)} (${s.n} observations so far).`
    : `${core} (n=${s.n}).`;
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
 * Reweighting: Strong tier always outranks Emerging; ties break on priorityScore.
 * One sentence per dimension, soft cap 3.
 */
export function buildSection(
  findings: RhythmFinding[],
  scope: 'check-in' | 'wearable',
  cap = 3,
): PatternSentence[] {
  const rows: PatternSentence[] = [];
  for (const f of findings) {
    const inScope = scope === 'check-in' ? CHECK_IN_DIMS.has(f.dimension) : !CHECK_IN_DIMS.has(f.dimension);
    if (!inScope) continue;
    const built = buildSentence(f);
    if (!built) continue;
    rows.push({ ...built, dimension: f.dimension, dimLabel: DIM_LABELS[f.dimension], finding: f });
  }
  rows.sort((a, b) => {
    const tierRank = (t: ConfidenceTier) => (t === 'strong' ? 1 : 0);
    const d = tierRank(b.tier) - tierRank(a.tier);
    if (d !== 0) return d;
    return b.finding.priorityScore - a.finding.priorityScore;
  });
  const seenDim = new Set<RhythmDimension>();
  const out: PatternSentence[] = [];
  for (const r of rows) {
    if (seenDim.has(r.dimension)) continue;
    seenDim.add(r.dimension);
    out.push(r);
    if (out.length >= cap) break;
  }
  return out;
}

/** Empty-state copy per section. */
export const EMPTY_STATE: Record<'check-in' | 'wearable', string> = {
  'check-in': 'Not enough check-ins yet to call a pattern. Three on the same day or window unlocks the first read.',
  wearable: 'Not enough wearable nights yet to call a pattern. Keep syncing — three comparable nights unlocks the first read.',
};
