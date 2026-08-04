// Pure signal-pill derivation.
//
// This module owns the executive-pill algorithm that previously lived inline
// inside `serve()` in `supabase/functions/compute-outer-readiness/index.ts`
// (roughly former L5879–L6357). It is a mechanical extraction:
//   * Thresholds are unchanged.
//   * Precedence (`stateMaxLocal` any-worst-wins reductions) is unchanged.
//   * Label vocabulary, contributor keys, source/freshness metadata,
//     V4 invariants and the physical-reserves displayable gate are all
//     preserved byte-for-byte from the inline block.
//   * No I/O. No DB access. No env reads. History rows for the qualifier
//     / coherence phase are passed in by the caller; the DB fetch itself
//     stays in the edge-function handler.
//
// Turn A2 will hoist the call above Brief generation. This file keeps the
// algorithm callable so parity is testable *before* the hoist happens.

import {
  coldStartLabel,
} from "../signal-engine/context-builder.ts";
import {
  getPillQualifiers,
  assertPillCoherence,
  type CheckinRow as PqCheckinRow,
  type WearableRow as PqWearableRow,
  type PillTier as PqPillTier,
  type CoherenceAdjustment,
} from "../signal-engine/checkin-pattern-aggregator.ts";

export type PillTier = "green" | "amber" | "red" | "neutral";
export type PillKey =
  | "decision_readiness"
  | "physical_reserves"
  | "resilience_capacity";
export type PillSource = "wearable" | "checkin" | "pattern";
export type PillFreshness =
  | "fresh"
  | "stale"
  | "missing"
  | "non_score_bearing"
  | "checkin_only";
export type PillHiddenReason = "no_fresh_wearable" | "no_checkin" | null;

/** Provenance marker set when a secondary (fallback) wearable signal was used. */
export type PillFallbackUsed = "rhr_proxy" | "hr_elevated_proxy" | null;

export interface CooccurrenceSignal {
  cooccurrence_count: number;
  cooccurrence_ratio: number | null;
  days_observed: number;
}

/**
 * Inputs consumed by phases A + B (tier math, payload construction,
 * source/freshness metadata, V4 invariants, Physical-Reserves displayable
 * gate). Everything here was a closure-local read at the former inline
 * site (L5879–L6241).
 */
export interface DerivePillsInput {
  // Wearable — raw values.
  hrvValue: number | null;
  hrvDeviation: number | null;
  sleepDuration: number | null; // minutes
  sleepScoreVal: number | null;
  rhrValue: number | null;
  rhrDeviation: number | null;
  hrValue: number | null;
  hrDeviation: number | null;
  sleepEfficiency: number | null; // wearableContext.sleepEfficiency

  // Wearable context flags used by supply-demand cap.
  wearableContextHrvDeviation: number | null;
  wearableContextPoorSleep: boolean;
  wearableContextHrvElevated: boolean;

  // Check-in dims (self-report).
  clarityLevel: number | null;
  emotionLevel: number | null;
  regulationLevel: number | null;
  pressureLevel: number | null;

  // Calendar.
  calendarLoad: "low" | "medium" | "high" | null;
  calendarPressure: "low" | "medium" | "high" | null;
  highStakesEventsCount: number;

  // Pattern signals.
  rhr3dTrend: "declining" | "stable" | "rising" | "unknown";
  sustainedDeficitFlag: boolean;
  cooccurrence7d: CooccurrenceSignal;

  // Framing.
  protectionGoals: string[];

  // Freshness / gates.
  wearableFreshForGate: boolean;
  checkInFreshForGate: boolean;
  hasWearable: boolean;
  wearableDaysConnected: number | null;
}

export interface SignalPillContributors {
  hrvValue?: number | null;
  sleepDuration?: number | null;
  sleepScore?: number | null;
  clarityLevel?: number | null;
  rhrValue?: number | null;
  hrValue?: number | null;
  sleepEfficiency?: number | null;
  emotionLevel?: number | null;
  regulationLevel?: number | null;
  pressureLevel?: number | null;
  sustainedDeficit?: boolean;
  hrvHighDemandCooccurrence7d?: CooccurrenceSignal;
  protectionGoalsCount?: number;
}

export interface SignalPill {
  key: PillKey;
  label: string;
  tier: PillTier;
  tierLabel: string;
  coldStartLabel: ReturnType<typeof coldStartLabel>;
  contributors: SignalPillContributors;
  sourceTypes: PillSource[];
  isScoreBearing: boolean;
  freshness: PillFreshness;
  hiddenReason: PillHiddenReason;
  detail: string | null;
  contributedByCheckIn: boolean;
  qualifiers?: Record<string, unknown>;
  fallbackUsed?: PillFallbackUsed;
}

export interface DerivePillsResult {
  cognitiveTier: PillTier;
  physicalTier: PillTier;
  resilienceTier: PillTier;
  pills: SignalPill[];
  // Debug/audit — mirrors what the inline block logged.
  supplyDemandGapPill: boolean;
  regulationRiskPill: boolean;
  diagnostics: DerivePillsDiagnostics;
}

export interface PillDiagnostic {
  key: PillKey;
  code:
    | "v4_force_neutral"
    | "v4_clear_checkin_credit"
    | "physical_reserves_no_displayable_contributors";
  message: string;
  meta?: Record<string, unknown>;
}

export interface DerivePillsDiagnostics {
  warnings: PillDiagnostic[];
}

// ────────────────────────────────────────────────────────────────────────
// Vocabulary — pill tier → executive label. Preserved verbatim.
// ────────────────────────────────────────────────────────────────────────
export const PILL_TIER_LABELS: Record<PillKey, Record<PillTier, string>> = {
  decision_readiness: {
    green: "Mind Sharp",
    amber: "Mind Mixed",
    red: "Mind Foggy",
    neutral: "Mind Unread",
  },
  physical_reserves: {
    green: "Body Steady",
    amber: "Body Strained",
    red: "Body Depleted",
    neutral: "Body Unread",
  },
  resilience_capacity: {
    green: "Reserve Strong",
    amber: "Reserve Thin",
    red: "Reserve Spent",
    neutral: "Reserve Unread",
  },
};

export const PILL_NEUTRAL_LABELS: Record<PillKey, string> = {
  decision_readiness: "Mind Unread",
  physical_reserves: "Body Unread",
  resilience_capacity: "Reserve Unread",
};

export const DETAIL_AWAITING =
  "Sync your wearable and then complete a quick check-in to sharpen the picture.";
export const DETAIL_EARLY_READ =
  "Wearable read only. Complete a check-in to refine this pill.";

const STATE_RANK: Record<PillTier, number> = {
  neutral: 0,
  green: 1,
  amber: 2,
  red: 3,
};
const stateMax = (a: PillTier, b: PillTier): PillTier =>
  STATE_RANK[a] >= STATE_RANK[b] ? a : b;

/**
 * Executes Phase A (tier math) + Phase B (payload + metadata + invariants +
 * displayable gate). Pure; deterministic; no timestamps in output.
 */
export function derivePills(input: DerivePillsInput): DerivePillsResult {
  const {
    hrvValue,
    hrvDeviation,
    sleepDuration,
    sleepScoreVal,
    rhrValue,
    rhrDeviation,
    hrValue,
    hrDeviation,
    sleepEfficiency,
    wearableContextHrvDeviation,
    wearableContextPoorSleep,
    wearableContextHrvElevated,
    clarityLevel,
    emotionLevel,
    regulationLevel,
    pressureLevel,
    calendarLoad,
    calendarPressure,
    highStakesEventsCount,
    rhr3dTrend,
    sustainedDeficitFlag,
    cooccurrence7d,
    protectionGoals,
    wearableFreshForGate,
    checkInFreshForGate,
    hasWearable,
    wearableDaysConnected,
  } = input;

  // ── Supply-demand cap + regulation-risk floor (identical to inline). ──
  const supplyDemandGapPill = (() => {
    const demandHigh = calendarLoad === "high" || calendarPressure === "high";
    const bodyDown =
      (typeof wearableContextHrvDeviation === "number" &&
        wearableContextHrvDeviation <= -10) ||
      wearableContextPoorSleep ||
      wearableContextHrvElevated;
    return demandHigh && bodyDown;
  })();
  const regulationRiskPill =
    (regulationLevel != null && regulationLevel <= 2) ||
    (pressureLevel != null && pressureLevel >= 4);

  // ── Cognitive (Decision Readiness): HRV + Sleep(Duration|Score) + Clarity ──
  const cogTiers: PillTier[] = [];
  if (hrvValue != null) {
    if (hrvDeviation != null) {
      cogTiers.push(
        hrvDeviation <= -20 ? "red" : hrvDeviation < -8 ? "amber" : "green",
      );
    } else {
      cogTiers.push(hrvValue < 20 ? "red" : hrvValue < 40 ? "amber" : "green");
    }
  }
  if (sleepDuration != null || sleepScoreVal != null) {
    if (sleepDuration != null && sleepDuration < 360) cogTiers.push("red");
    else if (sleepScoreVal != null && sleepScoreVal < 60) cogTiers.push("red");
    else if (sleepScoreVal != null && sleepScoreVal < 70) cogTiers.push("amber");
    else if (sleepDuration != null && sleepDuration < 420) cogTiers.push("amber");
    else cogTiers.push("green");
  }
  // ── Fallback A (secondary signal only) — RHR as a cognitive-load proxy.
  // Fires ONLY when both primary wearable signals (HRV and sleep) are absent,
  // e.g. an older Apple Watch with no sleep tracking and no HRV yet synced.
  // Elevated RHR indicates sympathetic dominance, which impairs cognition.
  let cognitiveFallbackUsed: PillFallbackUsed = null;
  if (
    cogTiers.length === 0 &&
    hrvValue == null &&
    sleepDuration == null &&
    sleepScoreVal == null &&
    rhrValue != null
  ) {
    if (rhrDeviation != null) {
      cogTiers.push(
        rhrDeviation > 25 ? "red" : rhrDeviation > 15 ? "amber" : "green",
      );
    } else {
      cogTiers.push(rhrValue > 90 ? "red" : rhrValue > 80 ? "amber" : "green");
    }
    cognitiveFallbackUsed = "rhr_proxy";
  }
  if (clarityLevel != null) {
    cogTiers.push(
      clarityLevel <= 2 ? "red" : clarityLevel === 3 ? "amber" : "green",
    );
  }
  let cognitiveTier: PillTier =
    cogTiers.length === 0
      ? "neutral"
      : cogTiers.reduce<PillTier>((a, b) => stateMax(a, b), "neutral");
  if (cognitiveTier === "green" && supplyDemandGapPill) cognitiveTier = "amber";

  // ── Physical Reserves: RHR + HR-elevated proxy only. Sleep excluded. ──
  const physTiers: PillTier[] = [];
  if (rhrValue != null) {
    if (rhrDeviation != null) {
      physTiers.push(
        rhrDeviation > 20 ? "red" : rhrDeviation > 10 ? "amber" : "green",
      );
    } else {
      physTiers.push(rhrValue > 90 ? "red" : rhrValue > 80 ? "amber" : "green");
    }
  }
  if (hrValue != null && hrDeviation != null) {
    physTiers.push(
      hrDeviation > 20 ? "red" : hrDeviation > 10 ? "amber" : "green",
    );
  } else if (rhrDeviation != null) {
    physTiers.push(
      rhrDeviation > 25 ? "red" : rhrDeviation > 15 ? "amber" : "green",
    );
  }
  if (rhr3dTrend === "rising") physTiers.push("amber");
  else if (rhr3dTrend === "declining") physTiers.push("green");
  if (sustainedDeficitFlag) physTiers.push("red");
  const physicalTier: PillTier =
    physTiers.length === 0
      ? "neutral"
      : physTiers.reduce<PillTier>((a, b) => stateMax(a, b), "neutral");

  // ── Resilience Capacity: sleepEfficiency anchor + check-in overlay + pattern ──
  const resTiers: PillTier[] = [];
  if (sleepEfficiency != null) {
    resTiers.push(
      sleepEfficiency >= 85 ? "green" : sleepEfficiency >= 70 ? "amber" : "red",
    );
  }
  // ── Fallback B (secondary signal only) — HR elevation as a recovery proxy.
  // Fires ONLY when the primary anchor (sleep efficiency) is unavailable.
  let resilienceFallbackUsed: PillFallbackUsed = null;
  if (resTiers.length === 0 && sleepEfficiency == null) {
    if (rhrDeviation != null && rhrDeviation > 10) {
      resTiers.push("amber");
      resilienceFallbackUsed = "hr_elevated_proxy";
    } else if (rhrValue != null && rhrValue > 80) {
      resTiers.push("amber");
      resilienceFallbackUsed = "hr_elevated_proxy";
    }
  }
  if (emotionLevel != null) {
    resTiers.push(emotionLevel <= 2 ? "amber" : "green");
  }
  if (regulationLevel != null) {
    resTiers.push(regulationLevel <= 2 ? "amber" : "green");
  }
  if (pressureLevel != null) {
    resTiers.push(pressureLevel >= 4 ? "amber" : "green");
  }
  if (sustainedDeficitFlag) resTiers.push("red");
  if (cooccurrence7d.cooccurrence_count >= 3) resTiers.push("red");
  else if (cooccurrence7d.cooccurrence_count === 2) resTiers.push("amber");
  const hasStakesEarly = highStakesEventsCount > 0;
  if (
    protectionGoals.length > 0 &&
    (calendarPressure === "high" || hasStakesEarly)
  ) {
    resTiers.push("amber");
  }
  let resilienceTier: PillTier =
    resTiers.length === 0
      ? "neutral"
      : resTiers.reduce<PillTier>((a, b) => stateMax(a, b), "neutral");
  if (regulationRiskPill && resilienceTier === "green") resilienceTier = "amber";

  // ── Payload build ─────────────────────────────────────────────────────
  const pillColdStart = coldStartLabel(wearableDaysConnected);
  const diagnostics: PillDiagnostic[] = [];

  const pills: SignalPill[] = [
    {
      key: "decision_readiness",
      label: "Decision Readiness",
      tier: cognitiveTier,
      tierLabel: PILL_TIER_LABELS.decision_readiness[cognitiveTier],
      coldStartLabel: pillColdStart,
      contributors: {
        hrvValue,
        sleepDuration,
        sleepScore: sleepScoreVal,
        clarityLevel,
      },
      sourceTypes: [],
      isScoreBearing: false,
      freshness: "missing",
      hiddenReason: null,
      detail: null,
      contributedByCheckIn: false,
    },
    {
      key: "physical_reserves",
      label: "Physical Reserves",
      tier: physicalTier,
      tierLabel: PILL_TIER_LABELS.physical_reserves[physicalTier],
      coldStartLabel: pillColdStart,
      contributors: { rhrValue, hrValue },
      sourceTypes: [],
      isScoreBearing: false,
      freshness: "missing",
      hiddenReason: null,
      detail: null,
      contributedByCheckIn: false,
    },
    {
      key: "resilience_capacity",
      label: "Resilience Capacity",
      tier: resilienceTier,
      tierLabel: PILL_TIER_LABELS.resilience_capacity[resilienceTier],
      coldStartLabel: pillColdStart,
      contributors: {
        sleepEfficiency,
        emotionLevel,
        regulationLevel,
        pressureLevel,
        sustainedDeficit: sustainedDeficitFlag,
        hrvHighDemandCooccurrence7d: cooccurrence7d,
        protectionGoalsCount: protectionGoals.length,
      },
      sourceTypes: [],
      isScoreBearing: false,
      freshness: "missing",
      hiddenReason: null,
      detail: null,
      contributedByCheckIn: false,
    },
  ];

  // ── Per-pill source-of-truth metadata (V4). ──
  const decisionSources: PillSource[] = [];
  if (hrvValue != null || sleepDuration != null || sleepScoreVal != null) {
    decisionSources.push("wearable");
  }
  if (clarityLevel != null) decisionSources.push("checkin");
  const physicalSources: PillSource[] = [];
  if (rhrValue != null || hrValue != null) physicalSources.push("wearable");
  if (
    rhr3dTrend === "rising" ||
    rhr3dTrend === "declining" ||
    sustainedDeficitFlag
  ) {
    physicalSources.push("pattern");
  }
  const resilienceSources: PillSource[] = [];
  if (sleepEfficiency != null) resilienceSources.push("wearable");
  if (
    emotionLevel != null ||
    regulationLevel != null ||
    pressureLevel != null
  ) {
    resilienceSources.push("checkin");
  }
  if (sustainedDeficitFlag || (cooccurrence7d?.cooccurrence_count ?? 0) > 0) {
    resilienceSources.push("pattern");
  }
  const pillSourceMap: Record<PillKey, PillSource[]> = {
    decision_readiness: decisionSources,
    physical_reserves: physicalSources,
    resilience_capacity: resilienceSources,
  };

  // ── Annotate + V4 gate. ──
  for (const p of pills) {
    const sources = pillSourceMap[p.key] ?? [];
    const hasWearableSrc =
      sources.includes("wearable") || sources.includes("pattern");
    const hasCheckinSrc = sources.includes("checkin");
    const contributedByCheckIn =
      wearableFreshForGate && checkInFreshForGate && hasCheckinSrc;
    let isScoreBearing =
      wearableFreshForGate &&
      (hasWearableSrc || (hasCheckinSrc && checkInFreshForGate));
    let hiddenReason: PillHiddenReason = null;
    let detail: string | null = null;
    if (!wearableFreshForGate) {
      hiddenReason = "no_fresh_wearable";
      isScoreBearing = false;
      p.tier = "neutral";
      p.tierLabel = PILL_NEUTRAL_LABELS[p.key] ?? p.tierLabel;
      detail = DETAIL_AWAITING;
    } else if (!hasWearableSrc && !hasCheckinSrc) {
      hiddenReason = "no_fresh_wearable";
      isScoreBearing = false;
      p.tier = "neutral";
      p.tierLabel = PILL_NEUTRAL_LABELS[p.key] ?? p.tierLabel;
      detail = DETAIL_AWAITING;
    } else if (!checkInFreshForGate && !hasWearableSrc && hasCheckinSrc) {
      hiddenReason = "no_checkin";
      isScoreBearing = false;
      p.tier = "neutral";
      p.tierLabel = PILL_NEUTRAL_LABELS[p.key] ?? p.tierLabel;
      detail = DETAIL_EARLY_READ;
    } else if (!checkInFreshForGate) {
      detail = DETAIL_EARLY_READ;
    }
    let freshnessStr: PillFreshness;
    if (isScoreBearing) freshnessStr = "fresh";
    else if (!hasWearable) freshnessStr = "missing";
    else if (!wearableFreshForGate) freshnessStr = "stale";
    else freshnessStr = "non_score_bearing";
    p.sourceTypes = sources;
    p.isScoreBearing = isScoreBearing;
    p.freshness = freshnessStr;
    p.hiddenReason = hiddenReason;
    p.detail = detail;
    p.contributedByCheckIn = contributedByCheckIn;
  }

  // ── V4 invariant (defensive normalisation). ──
  for (const p of pills) {
    if (!wearableFreshForGate) {
      if (p.isScoreBearing || p.tier !== "neutral" || p.contributedByCheckIn) {
        diagnostics.push({
          key: p.key,
          code: "v4_force_neutral",
          message:
            "[signal-pills-v4] invariant: forcing neutral/non-score-bearing",
        });
        p.isScoreBearing = false;
        p.contributedByCheckIn = false;
        p.tier = "neutral";
        p.tierLabel = PILL_NEUTRAL_LABELS[p.key] ?? p.tierLabel;
        p.hiddenReason = p.hiddenReason ?? "no_fresh_wearable";
        p.freshness = hasWearable ? "stale" : "missing";
      }
    } else if (!checkInFreshForGate && p.contributedByCheckIn) {
      diagnostics.push({
        key: p.key,
        code: "v4_clear_checkin_credit",
        message:
          "[signal-pills-v4] invariant: clearing contributedByCheckIn",
      });
      p.contributedByCheckIn = false;
    }
  }

  // ── Physical Reserves displayable-contributor gate. ──
  for (const p of pills) {
    if (p.key !== "physical_reserves") continue;
    const c = p.contributors;
    const isNum = (v: unknown): v is number =>
      typeof v === "number" && Number.isFinite(v);
    const displayableCount =
      (isNum(c.rhrValue) ? 1 : 0) + (isNum(c.hrValue) ? 1 : 0);
    if (displayableCount === 0 && p.tier !== "neutral") {
      diagnostics.push({
        key: p.key,
        code: "physical_reserves_no_displayable_contributors",
        message:
          "[signal-pills-v4][physical_reserves] forcing neutral — no displayable contributors",
        meta: {
          previousTier: p.tier,
          previousTierLabel: p.tierLabel,
        },
      });
      p.tier = "neutral";
      p.tierLabel = PILL_NEUTRAL_LABELS.physical_reserves;
      p.isScoreBearing = false;
      p.contributedByCheckIn = false;
      p.hiddenReason = p.hiddenReason ?? "no_fresh_wearable";
      p.detail = "Body detail not available for this reading.";
      p.freshness = hasWearable ? "stale" : "missing";
    }
  }

  return {
    cognitiveTier,
    physicalTier,
    resilienceTier,
    pills,
    supplyDemandGapPill,
    regulationRiskPill,
    diagnostics: { warnings: diagnostics },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Phase D — qualifier construction + coherence reconciliation.
// Pure post-processing over history rows fetched by the caller.
// ────────────────────────────────────────────────────────────────────────

export interface FinalizePillsInput {
  pills: SignalPill[]; // output of derivePills(); cloned before reconciliation
  safeTier: PqPillTier; // outer MRS band (mirrors inline call site)
  cognitiveTier: PillTier;
  physicalTier: PillTier;
  resilienceTier: PillTier;
  checkinHistory14d: PqCheckinRow[];
  wearableHistory14d: PqWearableRow[];
  baselines: {
    hrv: number | null;
    rhr: number | null;
    sleep: number | null;
  };
  hrv3dTrend: "improving" | "stable" | "declining" | "unknown";
  rhr3dTrend: "declining" | "stable" | "rising" | "unknown";
}

export interface FinalizePillsResult {
  pills: SignalPill[];
  qualifiers: ReturnType<typeof getPillQualifiers>;
  coherence: {
    inSync: boolean;
    adjustments: CoherenceAdjustment[];
  };
  coherenceWarning: string | null;
  diagnostics: FinalizePillsDiagnostics;
}

export interface FinalizePillsDiagnostics {
  warnings: Array<{
    code: "coherence_adjustment";
    message: string;
  }>;
}

export function finalizePills(input: FinalizePillsInput): FinalizePillsResult {
  const {
    pills,
    safeTier,
    cognitiveTier,
    physicalTier,
    resilienceTier,
    checkinHistory14d,
    wearableHistory14d,
    baselines,
    hrv3dTrend,
    rhr3dTrend,
  } = input;
  const nextPills = pills.map((pill) => ({
    ...pill,
    contributors: { ...pill.contributors },
    sourceTypes: [...pill.sourceTypes],
    qualifiers: pill.qualifiers ? { ...pill.qualifiers } : pill.qualifiers,
  }));

  const qualifiers = getPillQualifiers(
    checkinHistory14d,
    wearableHistory14d,
    baselines,
  );

  const coherenceResult = assertPillCoherence(safeTier, [
    { key: "decision_readiness", tier: cognitiveTier as PqPillTier },
    { key: "physical_reserves", tier: physicalTier as PqPillTier },
    { key: "resilience_capacity", tier: resilienceTier as PqPillTier },
  ]);
  const { pills: coherentPills, warning } = coherenceResult;
  let coherenceWarning: string | null = null;
  if (warning) {
    coherenceWarning = warning;
    for (const cp of coherentPills) {
      const p = nextPills.find((x) => x.key === cp.key);
      if (p && p.tier !== cp.tier) {
        p.tier = cp.tier as PillTier;
        p.tierLabel =
          PILL_TIER_LABELS[cp.key as PillKey]?.[cp.tier as PillTier] ??
          p.tierLabel;
      }
    }
  }

  // ── Attach qualifiers ─────────────────────────────────────────────────
  for (const p of nextPills) {
    if (p.key === "decision_readiness") {
      p.qualifiers = {
        hrv: { ...qualifiers.hrv, trend3d: hrv3dTrend ?? null },
        sleep: qualifiers.sleep,
        clarity: qualifiers.clarity,
      };
    } else if (p.key === "physical_reserves") {
      p.qualifiers = {
        rhr: { ...qualifiers.rhr, trend3d: rhr3dTrend ?? null },
      };
    } else if (p.key === "resilience_capacity") {
      const latestSleepEff =
        (wearableHistory14d[0] as { sleep_efficiency?: number } | undefined)
          ?.sleep_efficiency;
      if (typeof latestSleepEff === "number") {
        p.contributors.sleepEfficiency = latestSleepEff;
      }
      p.qualifiers = {
        emotion: qualifiers.emotion,
        regulation: qualifiers.regulation,
        pressure: qualifiers.pressure,
        sleep_efficiency: qualifiers.sleep_efficiency,
      };
    }
  }

  return {
    pills: nextPills,
    qualifiers,
    coherence: {
      inSync: coherenceResult.inSync,
      adjustments: coherenceResult.adjustments,
    },
    coherenceWarning,
    diagnostics: {
      warnings: coherenceWarning
        ? [{ code: "coherence_adjustment", message: coherenceWarning }]
        : [],
    },
  };
}
