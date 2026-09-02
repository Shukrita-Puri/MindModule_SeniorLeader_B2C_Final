/**
 * metric-polarity.ts — SSOT for how a measured physiological signal may be
 * FRAMED in copy.
 *
 * Why this exists: the nudge pattern formatter used to append "See what it is
 * costing you" to every association regardless of direction. An elevated
 * resting HR genuinely is a load on the body, so that read was right by
 * accident — the same code path would have rendered "RHR down 23% — costing
 * you", which is clinically wrong.
 *
 * Rules (launch contract):
 *   RHR above personal baseline  → unfavourable (load/cost language permitted)
 *   RHR below personal baseline  → favourable   (recovery; NEVER cost)
 *   HRV higher                   → favourable
 *   HRV lower                    → unfavourable
 *   Sleep score higher           → favourable
 *   Sleep score lower            → unfavourable
 *   Heart-rate load higher       → unfavourable
 *
 * Pure module. No IO. Shared by the deterministic bank and the LLM validator
 * so both paths obey the same semantics.
 */

export type MetricKind = "rhr" | "hrv" | "sleep" | "hr_load";
export type MetricPolarity = "favourable" | "unfavourable" | "neutral";
export type PatternConfidence = "strong" | "emerging";

/** Minimum observations before an association may be stated at all. */
export const MIN_PATTERN_SAMPLES = 3;

/**
 * Resolve the framing polarity for a metric given its signed deviation from
 * the user's own baseline. `deltaPct > 0` means "above baseline".
 */
export function metricPolarity(
  metric: MetricKind,
  deltaPct: number | null | undefined,
): MetricPolarity {
  if (deltaPct === null || deltaPct === undefined || !Number.isFinite(deltaPct)) {
    return "neutral";
  }
  if (Math.abs(deltaPct) < 1) return "neutral";
  const above = deltaPct > 0;
  switch (metric) {
    // Higher resting HR / higher HR load = more physiological load.
    case "rhr":
    case "hr_load":
      return above ? "unfavourable" : "favourable";
    // Higher HRV / better sleep = recovery.
    case "hrv":
    case "sleep":
      return above ? "favourable" : "unfavourable";
  }
}

/** True when copy for this metric+direction may use load / cost framing. */
export function costFramingAllowed(
  metric: MetricKind,
  deltaPct: number | null | undefined,
): boolean {
  return metricPolarity(metric, deltaPct) === "unfavourable";
}

/**
 * A causal claim ("X is costing you", "X drives Y") requires both enough
 * samples and strong confidence. Everything below the gate is an observation.
 */
export function isCausalClaimAllowed(
  n: number | null | undefined,
  confidence: PatternConfidence | null | undefined,
): boolean {
  return (n ?? 0) >= MIN_PATTERN_SAMPLES && confidence === "strong";
}

export interface PatternClaimInput {
  /** Human-readable subject, e.g. "Board Reviews" or "Travel". */
  label: string;
  metric: MetricKind;
  /** Signed deviation vs the user's own baseline. */
  deltaPct: number | null;
  n: number | null;
  confidence: PatternConfidence | null;
}

const METRIC_NOUN: Record<MetricKind, string> = {
  rhr: "resting heart rate",
  hrv: "HRV",
  sleep: "sleep",
  hr_load: "heart-rate load",
};

/**
 * Build the association sentence. States the measured direction and never
 * appends a generic "costing you". Emerging / low-sample associations are
 * worded as observations rather than causes.
 */
export function patternClaimSentence(input: PatternClaimInput): string {
  const { label, metric, deltaPct, n, confidence } = input;
  const noun = METRIC_NOUN[metric];
  const polarity = metricPolarity(metric, deltaPct);
  const magnitude = deltaPct === null ? null : Math.abs(Math.round(deltaPct));
  const direction = deltaPct === null ? null : deltaPct > 0 ? "higher" : "lower";

  const measured = magnitude !== null && direction !== null
    ? `${noun} runs about ${magnitude}% ${direction}`
    : `${noun} shifts`;

  const causal = isCausalClaimAllowed(n, confidence);
  if (!causal) {
    // Observation only — no causal verb, no cost framing.
    return `${label}: ${measured} on those days so far. Open your insights.`;
  }

  if (polarity === "favourable") {
    return `${label}: ${measured} on those days — that is recovery, not load. Open your insights.`;
  }
  if (polarity === "unfavourable") {
    return `${label}: ${measured} on those days — that is real load on the body. Open your insights.`;
  }
  return `${label}: ${measured} on those days. Open your insights.`;
}

/** Phrases that assert a cost. Never allowed on a favourable direction. */
const COST_PHRASES = [
  "costing you",
  "what it is costing",
  "what it's costing",
  "the cost of",
  "paying for",
  "draining you",
];

/** Phrases that assert a benefit. Never allowed on an unfavourable direction. */
const BENEFIT_PHRASES = [
  "recovering well",
  "well recovered",
  "improving your recovery",
  "in your favour",
  "paying off",
];

/**
 * Validate generated (LLM or deterministic) copy against the underlying metric
 * sign. Returns a violation string, or null when the copy is consistent.
 */
export function validateMetricPolarityInCopy(
  body: string,
  metric: MetricKind,
  deltaPct: number | null | undefined,
): string | null {
  const lower = body.toLowerCase();
  const polarity = metricPolarity(metric, deltaPct);
  const claimsCost = COST_PHRASES.some((p) => lower.includes(p));
  const claimsBenefit = BENEFIT_PHRASES.some((p) => lower.includes(p));

  if (claimsCost && polarity !== "unfavourable") {
    return `cost framing on a ${polarity} ${metric} direction`;
  }
  if (claimsBenefit && polarity === "unfavourable") {
    return `benefit framing on an unfavourable ${metric} direction`;
  }
  return null;
}

/**
 * Blanket guard: the generic "costing you" suffix is retired everywhere, so
 * copy that still carries it is rejected regardless of metric.
 */
export function containsGenericCostSuffix(body: string): boolean {
  const lower = body.toLowerCase();
  return lower.includes("see what it is costing you") ||
    lower.includes("see what it's costing you");
}
