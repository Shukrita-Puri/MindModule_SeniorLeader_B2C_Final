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
}

export interface RedistributeResult {
  finalWeights: Record<SubComponentId, number>;
  earnedWeight: number;
  awaitingSignals: boolean;
  weightProvenance: {
    window: Window;
    earned: Array<{ id: SubComponentId; weight: number }>;
    redistributed_to: Array<{ id: SubComponentId; from: number; to: number }>;
    awaiting_signals: boolean;
  };
}

/**
 * §8.3 — per-cycle, per-sub-component weight redistribution.
 *
 * Demand sub-components are the always-on reservoir. When some unavailable
 * weight needs a home and no Demand sub-component is available, it falls
 * back to whichever non-Demand sub-components ARE available, distributed
 * pro-rata to their target weights.
 */
export function redistribute(window: Window, subs: SubScore[]): RedistributeResult {
  const cells = MRS_V4_WEIGHTS[window];
  const byId = new Map(subs.map((s) => [s.id, s]));

  const earnedCells = cells.filter((c) => byId.get(c.id)?.available === true);
  const earnedWeight = earnedCells.reduce((s, c) => s + c.weight, 0);
  const unearnedWeight = Math.max(0, 100 - earnedWeight);

  const finalWeights = Object.fromEntries(
    cells.map((c) => [c.id, 0] as const),
  ) as Record<SubComponentId, number>;
  for (const c of earnedCells) finalWeights[c.id] = c.weight;

  const redistributed_to: RedistributeResult['weightProvenance']['redistributed_to'] = [];

  if (unearnedWeight > 0 && earnedCells.length > 0) {
    // Prefer Demand as the reservoir.
    const demand = earnedCells.filter((c) => c.pillar === 'demand');
    const reservoir = demand.length > 0 ? demand : earnedCells;
    const reservoirTotal = reservoir.reduce((s, c) => s + c.weight, 0);
    for (const c of reservoir) {
      const share = (c.weight / reservoirTotal) * unearnedWeight;
      const before = finalWeights[c.id];
      finalWeights[c.id] = before + share;
      redistributed_to.push({ id: c.id, from: before, to: finalWeights[c.id] });
    }
  }

  const awaitingSignals = earnedCells.length === 0;

  return {
    finalWeights,
    earnedWeight,
    awaitingSignals,
    weightProvenance: {
      window,
      earned: earnedCells.map((c) => ({ id: c.id, weight: c.weight })),
      redistributed_to,
      awaiting_signals: awaitingSignals,
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
  const { finalWeights, awaitingSignals, weightProvenance } = redistribute(window, subs);

  if (awaitingSignals) {
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

  const baseline = Math.max(0, Math.min(100, Math.round(physContribution + otherContribution)));
  return { baseline, awaitingSignals: false, weightProvenance: provenance };
}
