// [KIND: engine] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// Generic Pattern Spec Runner.
// Source: Part 2 Layer 4 (Section 5.1, 6, 12.1).

import {
  PATTERNS_SPEC_VERSION,
  PATTERNS_SPINE_VERSION,
} from "../constants.ts";
import { buildFindingId, buildStableFindingKey } from "../keys.ts";
import type {
  ExposureEvent,
  Finding,
  History,
  MetricComparison,
  PatternSpec,
} from "../types.ts";
import { computeOwnBaseline } from "./baselines.ts";
import { evaluateConfidence } from "./confidence.ts";
import { resolveLagValue } from "./lag.ts";
import { groupExposuresWithRollup } from "./rollup.ts";

export interface RunSpecsOptions {
  isShadow?: boolean;
}

export function runPatternSpecs(
  specs: PatternSpec[],
  history: History,
  options: RunSpecsOptions = {}
): Finding[] {
  const isShadow = options.isShadow ?? true;
  const findings: Finding[] = [];

  // Flatten all exposure events from history
  const allExposures: ExposureEvent[] = [];
  for (const day of history.days) {
    if (day.events) {
      allExposures.push(...day.events);
    }
  }

  for (const spec of specs) {
    const baseline = computeOwnBaseline(history, spec.metric);
    if (baseline === null || baseline === 0) continue;

    // Group exposures with subtype rollup for sparse buckets (n < 3)
    const exposureGroups = groupExposuresWithRollup(allExposures);

    for (const [bucketKey, exposures] of exposureGroups.entries()) {
      const comparisons: MetricComparison[] = [];

      for (const exp of exposures) {
        const val = resolveLagValue(exp, history, spec.metric, spec.lag);
        if (val === null || isNaN(val)) continue;

        const diffAbs = val - baseline;
        const diffPct = Math.round((diffAbs / baseline) * 100);

        // Higher RHR/HR is harm; lower HRV/sleep/PRS/cognition is harm
        const isHarm =
          spec.metric === "rhr" || spec.metric === "hr"
            ? diffPct > 0
            : diffPct < 0;

        const direction =
          diffPct === 0 ? "neutral" : isHarm ? "harm" : "benefit";

        comparisons.push({
          date: exp.date,
          exposureId: exp.id,
          bucketKey,
          exposedValue: val,
          baselineValue: baseline,
          diffAbs,
          diffPct,
          direction,
        });
      }

      if (comparisons.length === 0) continue;

      const avgDiffPct =
        comparisons.reduce((acc, c) => acc + c.diffPct, 0) /
        comparisons.length;
      const avgDiffAbs =
        comparisons.reduce((acc, c) => acc + c.diffAbs, 0) /
        comparisons.length;
      const avgExposedVal =
        comparisons.reduce((acc, c) => acc + c.exposedValue, 0) /
        comparisons.length;

      const { confidence, twoWindowPassed } = evaluateConfidence(
        comparisons,
        avgDiffPct
      );

      if (confidence === "insufficient_data") continue;

      const isOverallHarm =
        spec.metric === "rhr" || spec.metric === "hr"
          ? avgDiffPct > 0
          : avgDiffPct < 0;
      const effectDirection =
        avgDiffPct === 0 ? "neutral" : isOverallHarm ? "harm" : "benefit";
      const stableKey = buildStableFindingKey({
        metric: spec.metric,
        bucketKey,
        lag: spec.lag,
        direction: effectDirection,
      });

      const patternKind = isShadow
        ? `shadow:${spec.id}`
        : spec.id;

      const sampleDates = comparisons.map((c) => c.date).sort();
      const firstSeenDate = sampleDates[0];
      const lastSeenDate = sampleDates[sampleDates.length - 1];

      const pctDisplay = Math.abs(Math.round(avgDiffPct));
      const reason = `${bucketKey} events tend to show ${pctDisplay}% ${
        avgDiffPct < 0 ? "lower" : "higher"
      } ${spec.metric} (n = ${comparisons.length} measured, baseline = ${baseline})`;

      findings.push({
        findingId: buildFindingId(stableKey, isShadow),
        stableKey,
        patternKind,
        bucketKey,
        metric: spec.metric,
        direction: effectDirection,
        effectPct: Math.round(avgDiffPct),
        effectAbs: Math.round(avgDiffAbs * 10) / 10,
        confidence,
        occurrences: exposures.length,
        measuredN: comparisons.length,
        baselineValue: baseline,
        exposedValue: Math.round(avgExposedVal * 10) / 10,
        twoWindowPassed,
        firstSeenDate,
        lastSeenDate,
        sampleDates,
        reason,
        provenance: {
          historyDays: history.days.length,
          specsVersion: PATTERNS_SPEC_VERSION,
          spineVersion: PATTERNS_SPINE_VERSION,
          computedAt: new Date().toISOString(),
        },
      });
    }
  }

  return findings;
}
