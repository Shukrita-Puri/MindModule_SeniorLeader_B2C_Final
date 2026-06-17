// JIT v2 §2 — adaptive tier weighting. Tactical earns authority as
// patterns accumulate. We READ patterns straight from the canonical
// store (`causality_findings.signal_summary`, per
// mem://architecture/unified-pattern-store) and never recompute.
//
// Day-count is the FLOOR (can't enter T2 on day 3 even with patterns).
// Pattern-count is the CEILING (a 60-day user with no patterns stays T1).

export type MaturityTier = 'T0' | 'T1' | 'T2' | 'T3';

export interface TierWeights {
  tier: MaturityTier;
  immediate: number;
  tactical: number;
  strategic: number;
  /** Distinct pattern buckets that cleared confidence + n thresholds. */
  patternCount: number;
  /** Days since user account creation. */
  accountAgeDays: number;
}

const WEIGHTS: Record<MaturityTier, { immediate: number; tactical: number; strategic: number }> = {
  T0: { immediate: 0.60, tactical: 0.25, strategic: 0.15 },
  T1: { immediate: 0.50, tactical: 0.35, strategic: 0.15 },
  // JIT v2 rework: Tactical cleanly leads Immediate at maturity so
  // learned patterns + sustained-HR signals actually outrank raw
  // category/relationship base for seasoned accounts.
  T2: { immediate: 0.35, tactical: 0.50, strategic: 0.15 },
  T3: { immediate: 0.30, tactical: 0.55, strategic: 0.15 },
};

/** Map (accountAgeDays, patternCount) → tier. */
export function pickTier(accountAgeDays: number, patternCount: number): MaturityTier {
  // Floor by account age
  let dayTier: MaturityTier =
    accountAgeDays <= 7  ? 'T0' :
    accountAgeDays <= 14 ? 'T1' :
    accountAgeDays <= 30 ? 'T2' : 'T3';
  // Ceiling by pattern count
  let patternTier: MaturityTier =
    patternCount === 0        ? 'T0' :
    patternCount <= 2         ? 'T1' :
    patternCount <= 5         ? 'T2' : 'T3';
  // Take the minimum (worst signal) — both must agree to upgrade.
  const order = { T0: 0, T1: 1, T2: 2, T3: 3 } as const;
  return order[dayTier] <= order[patternTier] ? dayTier : patternTier;
}

/**
 * Count distinct event-type buckets with n>=3 and confidence in
 * {emerging, strong} across event_to_hrv ∪ event_to_rhr.
 */
export function countMaturePatterns(signalSummary: any | null | undefined): number {
  if (!signalSummary) return 0;
  const buckets = new Set<string>();
  const consider = (rows: any[] | undefined) => {
    if (!Array.isArray(rows)) return;
    for (const r of rows) {
      if (!r || typeof r !== 'object') continue;
      if (typeof r.n !== 'number' || r.n < 3) continue;
      if (r.confidence !== 'strong' && r.confidence !== 'emerging') continue;
      if (typeof r.event_type === 'string') buckets.add(r.event_type);
    }
  };
  consider(signalSummary.event_to_hrv);
  consider(signalSummary.event_to_rhr);
  return buckets.size;
}

export function resolveTierWeights(accountAgeDays: number, signalSummary: any | null | undefined): TierWeights {
  const patternCount = countMaturePatterns(signalSummary);
  const tier = pickTier(accountAgeDays, patternCount);
  return { tier, ...WEIGHTS[tier], patternCount, accountAgeDays };
}