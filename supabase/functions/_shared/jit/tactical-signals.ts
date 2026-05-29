// JIT v2 — Tactical signals. Behavioural / pattern layer.
//
// patternHit READS `causality_findings.signal_summary` (canonical store
// per mem://architecture/unified-pattern-store) and never recomputes.
// Bucket vocabulary is the SINGLE canonical legacy table in
// `../events/event-classifier.ts` (EVENT_TYPE_KEYWORDS /
// classifyByLegacyTable). We re-export it under the historical name so
// JIT writers/readers and the persisted causality store stay in sync
// without a parallel taxonomy.
import { classifyByLegacyTable } from '../events/event-classifier.ts';

export function classifyEventBucket(title: string | null | undefined): string | null {
  return classifyByLegacyTable(title);
}

export interface PatternSignal {
  bucket: string;
  hrvDeltaPct: number;
  rhrDeltaPct: number;
  n: number;
  confidence: 'strong' | 'emerging';
}

/**
 * Score 0..25 reflecting how reliably THIS user is knocked off-state by
 * events that look like this one. Reads pre-computed causality findings.
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

  // Clamp
  if (s > 25) s = 25;

  const sig: PatternSignal = {
    bucket,
    hrvDeltaPct: Number(hrv?.hrvDeltaPct ?? 0),
    rhrDeltaPct: Number(rhr?.rhrDeltaPct ?? 0),
    n: Math.max(Number(hrv?.n ?? 0), Number(rhr?.n ?? 0)),
    confidence,
  };
  return { score: s, signal: sig };
}

/** User-declared priority tag on the calendar event (0..20). */
export function userPriorityTagBoost(tags: string[] | null | undefined): number {
  if (!Array.isArray(tags) || tags.length === 0) return 0;
  const norm = tags.map((t) => String(t).toLowerCase());
  if (norm.includes('critical') || norm.includes('must-prep')) return 20;
  if (norm.includes('high') || norm.includes('priority')) return 12;
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

/** Past JIT completed + felt-better signal for the same bucket. Cap +10. */
export function followThroughBoost(bucket: string | null, followThroughByBucket: Record<string, number>): number {
  if (!bucket) return 0;
  const n = followThroughByBucket[bucket] || 0;
  if (n <= 0) return 0;
  if (n === 1) return 4;
  if (n === 2) return 7;
  return 10;
}