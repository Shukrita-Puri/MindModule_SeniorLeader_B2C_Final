// JIT v2 — Tactical signals. Behavioural / pattern layer.
//
// patternHit READS `causality_findings.signal_summary` (canonical store
// per mem://architecture/unified-pattern-store) and never recomputes.
// Bucket vocabulary is resolved by the shared pattern-bucket helper in
// `../events/event-classifier.ts`. It preserves the historical
// `signal_summary` label set while resolving from canonical subtypes first,
// so JIT writers/readers and the persisted causality store stay in sync
// without a parallel taxonomy.
import { classifyPatternBucket } from '../events/event-classifier.ts';

export function classifyEventBucket(title: string | null | undefined): string | null {
  return classifyPatternBucket(title);
}

export interface PatternSignal {
  bucket: string;
  hrvDeltaPct: number;
  rhrDeltaPct: number;
  n: number;
  confidence: 'strong' | 'emerging';
}

/**
 * Score 0..35 reflecting how reliably THIS user is knocked off-state by
 * events that look like this one. Reads pre-computed causality findings.
 *
 * Cap raised from 25 → 35 (JIT v2 rework) so Tactical's earnable point
 * pool can genuinely lead Immediate at T2/T3 maturity. Also adds an
 * "acute recurring-HR" bonus (+8) when this bucket shows a sustained
 * resting-HR elevation (rhrDeltaPct ≥ 15, n ≥ 3).
 */
export function patternHit(
  title: string | null | undefined,
  signalSummary: any | null | undefined,
): { score: number; signal: PatternSignal | null } {
  if (!signalSummary) return { score: 0, signal: null };
  const bucket = classifyEventBucket(title);
  if (!bucket) return { score: 0, signal: null };

  const hrv = Array.isArray(signalSummary.event_to_hrv)
    ? signalSummary.event_to_hrv.find((r: any) => r?.event_type === bucket) : null;
  const rhr = Array.isArray(signalSummary.event_to_rhr)
    ? signalSummary.event_to_rhr.find((r: any) => r?.event_type === bucket) : null;

  if (!hrv && !rhr) return { score: 0, signal: null };

  const confidence: 'strong' | 'emerging' =
    (hrv?.confidence === 'strong' || rhr?.confidence === 'strong') ? 'strong' : 'emerging';

  // Base weight by confidence; magnitude bumps it further.
  let s = confidence === 'strong' ? 15 : 8;
  const hrvMag = Math.abs(Number(hrv?.hrvDeltaPct ?? 0));
  const rhrMag = Math.abs(Number(rhr?.rhrDeltaPct ?? 0));
  if (hrvMag >= 20 || rhrMag >= 15) s += 10;
  else if (hrvMag >= 10 || rhrMag >= 8) s += 5;

  // Acute recurring-HR bonus — sustained elevation on this bucket is a
  // strong "this event consistently spikes me" signal.
  const rhrN = Number(rhr?.n ?? 0);
  const rhrDelta = Number(rhr?.rhrDeltaPct ?? 0);
  if (rhrN >= 3 && rhrDelta >= 15) s += 8;

  // Clamp (raised: 25 → 35)
  if (s > 35) s = 35;

  const sig: PatternSignal = {
    bucket,
    hrvDeltaPct: Number(hrv?.hrvDeltaPct ?? 0),
    rhrDeltaPct: Number(rhr?.rhrDeltaPct ?? 0),
    n: Math.max(Number(hrv?.n ?? 0), Number(rhr?.n ?? 0)),
    confidence,
  };
  return { score: s, signal: sig };
}

/**
 * Soft "focus" boost only. Graduated importance (`high`/`medium`/`low`)
 * is now handled by the SOVEREIGN layer (`sovereignTagAdjustment` in
 * `select-jit.ts`) and sits OUTSIDE the weighted sum so it can override
 * or demote regardless of tier totals.
 *
 * Kept here so legacy callers and tests still compile. Only `focus`
 * survives in Tactical as a small additive nudge.
 */
export function userPriorityTagBoost(tags: string[] | null | undefined): number {
  if (!Array.isArray(tags) || tags.length === 0) return 0;
  const norm = tags.map((t) => String(t).toLowerCase());
  if (norm.includes('focus')) return 8;
  return 0;
}

/** Past dismissals + "not relevant" feedback for the same bucket. Cap −10. */
export function skipPenaltyFor(bucket: string | null, skipCountsByBucket: Record<string, number>): number {
  if (!bucket) return 0;
  const n = skipCountsByBucket[bucket] || 0;
  // 1 skip → 3, 2 → 6, 3+ → 10
  if (n <= 0) return 0;
  if (n === 1) return 3;
  if (n === 2) return 6;
  return 10;
}

/** Past JIT completed + felt-better signal for the same bucket. Cap +15. */
export function followThroughBoost(bucket: string | null, followThroughByBucket: Record<string, number>): number {
  if (!bucket) return 0;
  const n = followThroughByBucket[bucket] || 0;
  if (n <= 0) return 0;
  if (n === 1) return 4;
  if (n === 2) return 7;
  if (n === 3) return 11;
  return 15;
}

/**
 * SOVEREIGN layer — user-declared importance tag is OUTSIDE the weighted
 * sum (see `select-jit.ts`). High = +45 promote, Medium = +20, Low =
 * hard demote regardless of tier totals. `focus` stays a soft Tactical
 * additive (see `userPriorityTagBoost`).
 */
export function sovereignTagAdjustment(tags: string[] | null | undefined): { bonus: number; demote: boolean } {
  if (!Array.isArray(tags) || tags.length === 0) return { bonus: 0, demote: false };
  const norm = tags.map((t) => String(t).toLowerCase().trim());
  if (norm.includes('low') || norm.includes('skip')) return { bonus: 0, demote: true };
  if (norm.includes('high') || norm.includes('critical') || norm.includes('must-prep')) return { bonus: 45, demote: false };
  if (norm.includes('medium') || norm.includes('priority')) return { bonus: 20, demote: false };
  return { bonus: 0, demote: false };
}
