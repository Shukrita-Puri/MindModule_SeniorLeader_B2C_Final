// MRS v4 — Per-cycle baseline composer.
//
// Pure orchestrator combining §8.3 redistribution and §3 weighted sum, with
// the §3.2a measured-only severe-sleep-deficit cap applied to the
// Physiological pillar.
//
// Contract:
//   - Caller supplies a `score: 0..100` and `available: boolean` for every
//     sub-component in the current window (use `MRS_V4_WEIGHTS[window]`).
//   - When `available=false`, `score` is ignored — the weight is
//     redistributed per §8.3.
//   - Returns `baseline`, `weightProvenance` (audit JSONB), and the boolean
//     `awaitingSignals` flag for the "nothing-yet" copy matrix.
//
// §3.2a is intentionally enforced inside this composer (not inside the sleep
// sub-component composer) because it caps the *pillar contribution*, not the
// sub-component score. The cap is mathematically equivalent to scaling the
// Physiological pillar's contribution down so it never exceeds the
// Mixed-tier ceiling (64) — sleep absence cannot reach this guard, by
// construction: the trigger checks `available=true` first.

import { MRS_V4_WEIGHTS, type SubComponentId, type Window } from './mrs-v4-weights.ts';

/** Per-sub-component input. `score` is ignored when `available=false`. */
export interface SubScore {
  id: SubComponentId;
  score: number;       // 0..100
  available: boolean;
  /**
   * Raw measured calendar demand (0..100 load) for Demand cells, carried for
   * the audit trail only. `0` means "measured, genuinely empty" — never
   * "missing". Missing is expressed as `available: false`.
   */
  rawDemand?: number | null;
  /** True when the score came from the zero-demand recovery rule. */
  zeroDemandCredit?: boolean;
}

export interface RedistributeResult {
  finalWeights: Record<SubComponentId, number>;
  earnedWeight: number;
  awaitingSignals: boolean;
  physiologicalAvailable: boolean;
  demandAvailable: boolean;
  weightProvenance: {
    window: Window;
    earned: Array<{ id: SubComponentId; weight: number }>;
    redistributed_to: Array<{ id: SubComponentId; from: number; to: number }>;
    awaiting_signals: boolean;
    physiological_available: boolean;
    demand_available: boolean;
    zero_demand_credit?: Array<{ id: SubComponentId; raw_demand: number | null; score: number }>;
  };
}

/**
 * §8.3 — per-cycle, per-sub-component weight redistribution, INTRA-PILLAR.
 *
 * Unearned Physiological weight redistributes only across earned
 * Physiological cells; unearned Demand weight only across earned Demand
 * cells. Pattern is additive context: it never carries score-bearing weight,
 * never absorbs another pillar's weight, and never donates its own.
 *
 * MRS requires BOTH required pillars. If either Physiological or Demand has
 * zero earned cells, the baseline cannot form (`awaitingSignals = true`).
 *
 * Semantics: `number` = earned, `0` = earned, `available:false` = unearned.
 */
export function redistribute(window: Window, subs: SubScore[]): RedistributeResult {
  const cells = MRS_V4_WEIGHTS[window];
  const byId = new Map(subs.map((s) => [s.id, s]));

  const scoreBearingCells = cells.filter((c) => c.pillar !== 'pattern');
  const earnedCells = scoreBearingCells.filter((c) => byId.get(c.id)?.available === true);

  const finalWeights = Object.fromEntries(
    cells.map((c) => [c.id, 0] as const),
  ) as Record<SubComponentId, number>;
  for (const c of earnedCells) finalWeights[c.id] = c.weight;

  const redistributed_to: RedistributeResult['weightProvenance']['redistributed_to'] = [];

  // Intra-pillar redistribution — strictly no cross-pillar transfer.
  for (const pillar of ['physiological', 'demand'] as const) {
    const pillarCells = scoreBearingCells.filter((c) => c.pillar === pillar);
    if (pillarCells.length === 0) continue;
    const pillarEarned = pillarCells.filter((c) => byId.get(c.id)?.available === true);
    if (pillarEarned.length === 0) continue; // pillar unavailable — weight simply drops
    const pillarUnearnedWeight = pillarCells
      .filter((c) => byId.get(c.id)?.available !== true)
      .reduce((s, c) => s + c.weight, 0);
    if (pillarUnearnedWeight <= 0) continue;
    const earnedTotal = pillarEarned.reduce((s, c) => s + c.weight, 0);
    for (const c of pillarEarned) {
      const share = (c.weight / earnedTotal) * pillarUnearnedWeight;
      const before = finalWeights[c.id];
      finalWeights[c.id] = before + share;
      redistributed_to.push({ id: c.id, from: before, to: finalWeights[c.id] });
    }
  }

  const physiologicalAvailable = earnedCells.some((c) => c.pillar === 'physiological');
  const demandAvailable = earnedCells.some((c) => c.pillar === 'demand');
  // MRS requires BOTH physiological and demand information. Pattern never
  // gates and never unlocks a baseline.
  const awaitingSignals = !physiologicalAvailable || !demandAvailable;
  const earnedWeight = earnedCells.reduce((s, c) => s + finalWeights[c.id], 0);

  const zeroDemandCredit = earnedCells
    .filter((c) => c.pillar === 'demand' && byId.get(c.id)?.zeroDemandCredit === true)
    .map((c) => ({
      id: c.id,
      raw_demand: byId.get(c.id)?.rawDemand ?? 0,
      score: byId.get(c.id)?.score ?? 0,
    }));

  return {
    finalWeights,
    earnedWeight,
    awaitingSignals,
    physiologicalAvailable,
    demandAvailable,
    weightProvenance: {
      window,
      earned: earnedCells.map((c) => ({ id: c.id, weight: c.weight })),
      redistributed_to,
      awaiting_signals: awaitingSignals,
      physiological_available: physiologicalAvailable,
      demand_available: demandAvailable,
      ...(zeroDemandCredit.length > 0 ? { zero_demand_credit: zeroDemandCredit } : {}),
    },
  };
}

/** §3.2a — severe sleep-deficit measurement (measured-only, with absence guard). */
export interface SleepDeficitInput {
  /** Must be true for the override to even be considered (§8.2). */
  available: boolean;
  sleepTotalMinutes?: number | null;
  sleepQuality?: 'poor' | 'fair' | 'good' | 'peak' | null;
}

export function isSevereSleepDeficit(input: SleepDeficitInput): boolean {
  // Absence-is-not-deficit guard. Required by §3.2a — see spec.
  if (!input.available) return false;
  const minutes = input.sleepTotalMinutes;
  const quality = input.sleepQuality;
  const minutesBad = typeof minutes === 'number' && Number.isFinite(minutes) && minutes < 300;
  const qualityBad = quality === 'poor';
  return minutesBad || qualityBad;
}

export interface ComposeBaselineResult {
  baseline: number | null;     // 0..100, integer or null while awaiting
  awaitingSignals: boolean;
  weightProvenance: RedistributeResult['weightProvenance'] & {
    sleep_deficit_override?: true;
    sleep_total_minutes?: number | null;
    sleep_quality?: string | null;
    physiological_contribution_before_cap?: number;
    physiological_contribution_after_cap?: number;
  };
}

/**
 * Compose the §3 weighted baseline.
 *
 * @param window      Current time-of-day window.
 * @param subs        Per-sub-component score + availability for this window.
 * @param sleep       §3.2a severe-deficit measurement (measured-only).
 * @returns           baseline + awaiting flag + audit-trail provenance.
 */
export function composeBaselineV4(
  window: Window,
  subs: SubScore[],
  sleep: SleepDeficitInput = { available: false },
): ComposeBaselineResult {
  const { finalWeights, earnedWeight, awaitingSignals, weightProvenance } = redistribute(window, subs);

  if (awaitingSignals || earnedWeight <= 0) {
    return { baseline: null, awaitingSignals: true, weightProvenance };
  }

  const byId = new Map(subs.map((s) => [s.id, s]));
  const cells = MRS_V4_WEIGHTS[window];

  // Compute per-pillar contribution so we can apply the §3.2a cap to
  // Physiological alone without re-implementing the weighted sum.
  let physContribution = 0;
  let otherContribution = 0;
  for (const cell of cells) {
    const sub = byId.get(cell.id);
    if (!sub) continue;
    const w = finalWeights[cell.id] ?? 0;
    if (w <= 0) continue;
    const score = sub.available ? sub.score : 0; // unavailable → weight is 0, so score is moot
    const contribution = (score * w) / 100;
    if (cell.pillar === 'physiological') physContribution += contribution;
    else otherContribution += contribution;
  }

  let provenance = { ...weightProvenance } as ComposeBaselineResult['weightProvenance'];

  // §3.2a: cap Physiological *contribution* at the Mixed-tier ceiling (64).
  // The cap targets the contribution (already weight-scaled) so the rest of
  // the pillars are unaffected — and so a measured severe deficit cannot be
  // masked by an unusually high HRV reading.
  if (isSevereSleepDeficit(sleep)) {
    const cap = 64; // Mixed-tier ceiling, per §7.
    const physCellsActive = cells.filter(
      (c) => c.pillar === 'physiological' && (finalWeights[c.id] ?? 0) > 0,
    );
    const physWeightSum = physCellsActive.reduce((s, c) => s + (finalWeights[c.id] ?? 0), 0);
    // Maximum legitimate phys contribution at full ceiling per its current
    // weight share. If current contribution exceeds (cap × physWeightSum / 100),
    // pin it down.
    const physCeiling = (cap * physWeightSum) / 100;
    if (physContribution > physCeiling) {
      provenance = {
        ...provenance,
        sleep_deficit_override: true,
        sleep_total_minutes: sleep.sleepTotalMinutes ?? null,
        sleep_quality: sleep.sleepQuality ?? null,
        physiological_contribution_before_cap: Math.round(physContribution * 100) / 100,
        physiological_contribution_after_cap: Math.round(physCeiling * 100) / 100,
      };
      physContribution = physCeiling;
    } else {
      // Override is "armed" but didn't bite this cycle — still record it so
      // the audit trail explains why the score isn't higher than it is.
      provenance = {
        ...provenance,
        sleep_deficit_override: true,
        sleep_total_minutes: sleep.sleepTotalMinutes ?? null,
        sleep_quality: sleep.sleepQuality ?? null,
        physiological_contribution_before_cap: Math.round(physContribution * 100) / 100,
        physiological_contribution_after_cap: Math.round(physContribution * 100) / 100,
      };
    }
  }

  // Pattern weight is never score-bearing, so the earned weight is < 100 by
  // construction. Renormalise over earned weight — this is a scale
  // correction, NOT a cross-pillar transfer: each pillar keeps its own
  // relative share.
  const raw = ((physContribution + otherContribution) * 100) / earnedWeight;
  const baseline = Math.max(0, Math.min(100, Math.round(raw)));
  return { baseline, awaitingSignals: false, weightProvenance: provenance };
}
