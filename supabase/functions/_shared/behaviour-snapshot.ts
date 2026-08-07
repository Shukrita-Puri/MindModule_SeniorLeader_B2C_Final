// OWNERSHIP: engineering. Single-source deterministic snapshot of CEO
// behaviour flags + event taxonomy, computed ONCE per (user, local_date,
// window) and shared by Brief, Plan, and Nudges.
//
// Why this layer exists
// ─────────────────────
// `compute-outer-readiness` (Brief) and `generate-mastery-plan` (Plan)
// previously called `evaluateForScope` independently with their own
// `SignalCoverageInput` and `extras`. Tiny drift between those two contexts
// caused incoherence: a Brief could fire `HighStakesPrep @"Board prep"`
// with no corresponding `prepare` slot boost in the Plan.
//
// This module fixes that structurally: callers build ONE `SignalCoverageInput`
// + one `extras`, pass them in, and read both `flagsBrief` and `flagsPlan`
// off the same object. The Brief, Plan, and Nudges consumers downstream
// will read the matching field and never recompute.
//
// The LLM contract is unchanged — consumers still see only the
// `=== ACTIVE CEO BEHAVIOURS ===` and `=== EVENT TAXONOMY ===` strings.

import type { BehaviourFlag, SignalMatrix, SlotBoost } from './brief-context.ts';
import {
  evaluateForScope,
  type RuleContextExtras,
} from './behaviour-wiring.ts';
import { buildSignalMatrix, type SignalCoverageInput } from './brief-signal-coverage.ts';
import { formatEventTaxonomyBlock } from './events/format-taxonomy.ts';

export interface BehaviourSnapshotInput {
  coverage: SignalCoverageInput;
  extras?: RuleContextExtras;
}

export interface BehaviourSnapshotResult {
  flagsBrief: BehaviourFlag[];
  flagsPlan: BehaviourFlag[];
  /** Plan-only SlotBoost[]. Empty when no rule has a slotBoost descriptor. */
  slotBoosts: SlotBoost[];
  /** Pre-formatted prompt fragment for the Brief / Nudges surfaces. */
  promptBlockBrief: string;
  /** Pre-formatted prompt fragment for the Plan surface. */
  promptBlockPlan: string;
  /** Pre-formatted "=== EVENT TAXONOMY ===" block — same for every surface. */
  taxonomyBlock: string;
  /**
   * The deterministic signal matrix the rules were evaluated from. Exposed so
   * the Brief can read the SAME day-awareness signals the Plan uses (PTO,
   * holiday, travel type, conference, full-day events) without recomputing or
   * re-detecting anything. Null only when derivation failed.
   */
  signals: SignalMatrix | null;
  /** Stable signature of inputs — write onto brief_snapshots.input_signature. */
  signatureHash: string;
}

/**
 * Build the deterministic snapshot. Pure (no DB). Never throws — when the
 * shared module flag is off or evaluation fails, returns a fully-zeroed
 * snapshot so consumers can `?? defaultSnapshot()` safely.
 */
export function buildBehaviourSnapshot(
  input: BehaviourSnapshotInput,
): BehaviourSnapshotResult {
  const briefResult = evaluateForScope(input.coverage, 'brief', input.extras);
  const planResult = evaluateForScope(input.coverage, 'plan', input.extras);

  const taxonomyBlock = formatEventTaxonomyBlock(
    (input.coverage.events ?? []).map((e) => ({
      title: e.title,
      startTime: e.startTime,
    })),
  );

  let signals: SignalMatrix | null = null;
  try {
    signals = buildSignalMatrix(input.coverage);
  } catch (err) {
    console.error('[behaviour-snapshot] signal matrix derivation failed:', err);
  }

  return {
    flagsBrief: briefResult?.flags ?? [],
    flagsPlan: planResult?.flags ?? [],
    slotBoosts: planResult?.slotBoosts ?? [],
    promptBlockBrief: briefResult?.promptBlock ?? '',
    promptBlockPlan: planResult?.promptBlock ?? '',
    taxonomyBlock,
    signals,
    signatureHash: computeSignatureHash(input),
  };
}

/**
 * Stable deterministic hash of the snapshot inputs. Cheap FNV-1a over a
 * canonical JSON of the rule-relevant fields. Used to detect parity drift
 * between Brief and Plan reads of the same (user, local_date, window).
 */
function computeSignatureHash(input: BehaviourSnapshotInput): string {
  const cov = input.coverage;
  const compact = {
    now: cov.now instanceof Date ? cov.now.toISOString() : String(cov.now),
    wearable: cov.wearable ?? null,
    checkIn: cov.checkIn ?? null,
    scoreToday: cov.scoreToday ?? null,
    scoreYesterday: cov.scoreYesterday ?? null,
    trailingClarityAvg: cov.trailingClarityAvg ?? null,
    timezone: cov.timezone ?? null,
    eventTitles: (cov.events ?? []).map((e) => `${e.title}|${String(e.startTime)}`),
    morningWasCompressed: cov.morningWasCompressed ?? null,
    middayRecoveryDetected: cov.middayRecoveryDetected ?? null,
    extras: input.extras ?? null,
  };
  return fnv1a(JSON.stringify(compact, (_k, v) => v));
}

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

/** Zero snapshot — useful as a `?? defaultBehaviourSnapshot()` fallback. */
export function defaultBehaviourSnapshot(): BehaviourSnapshotResult {
  return {
    flagsBrief: [],
    flagsPlan: [],
    slotBoosts: [],
    promptBlockBrief: '',
    promptBlockPlan: '',
    taxonomyBlock: '',
    signals: null,
    signatureHash: '00000000',
  };
}