// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step RD4: Signal Pills Derivation.
// Source: Part 2 Layer 2 (Section 5.1.1, RD4).

import type { RawBiometrics, BiometricBaselines, SignalPill, PillColor } from "../types.ts";
import { HRV_DEFICIT_RATIO, SHORT_SLEEP_MINUTES } from "../constants.ts";

export function stepDerivePills(params: {
  raw: RawBiometrics;
  baselines?: BiometricBaselines | null;
  freshness: "fresh" | "stale" | "missing";
}): {
  decisionReadiness: SignalPill;
  physicalReserves: SignalPill;
  resilienceCapacity: SignalPill;
} {
  if (params.freshness === "missing") {
    const greyPill = (name: SignalPill["name"]): SignalPill => ({
      name,
      color: "grey",
      score: 50,
      freshness: "missing",
      contributors: ["Wearable reading missing"],
    });
    return {
      decisionReadiness: greyPill("decision_readiness"),
      physicalReserves: greyPill("physical_reserves"),
      resilienceCapacity: greyPill("resilience_capacity"),
    };
  }

  const baselines = params.baselines ?? {
    hrvBaselineMs: 50,
    restingHrBaselineBpm: 60,
    sleepBaselineMinutes: 450,
  };

  const rawHrv = params.raw.hrvMs ?? baselines.hrvBaselineMs;
  const rawRhr = params.raw.restingHrBpm ?? baselines.restingHrBaselineBpm;
  const rawSleep = params.raw.sleepMinutes ?? baselines.sleepBaselineMinutes;

  // 1. Decision Readiness (HRV & cognitive readiness)
  const hrvDeficit = (baselines.hrvBaselineMs - rawHrv) / baselines.hrvBaselineMs;
  let drColor: PillColor = "green";
  const drContributors: string[] = [];

  if (hrvDeficit >= HRV_DEFICIT_RATIO) {
    drColor = hrvDeficit >= 0.25 ? "red" : "amber";
    drContributors.push(`HRV ${Math.round(hrvDeficit * 100)}% below personal baseline`);
  } else {
    drContributors.push("HRV steady at or above baseline");
  }

  // 2. Physical Reserves (Sleep duration & efficiency)
  let prColor: PillColor = "green";
  const prContributors: string[] = [];
  if (rawSleep < SHORT_SLEEP_MINUTES) {
    prColor = rawSleep < 300 ? "red" : "amber";
    prContributors.push(`Short sleep duration: ${Math.round(rawSleep / 60 * 10) / 10} hours`);
  } else {
    prContributors.push("Sleep duration sufficient");
  }

  // 3. Resilience Capacity (Resting HR and recovery)
  let rcColor: PillColor = "green";
  const rcContributors: string[] = [];
  const rhrElevated = rawRhr - baselines.restingHrBaselineBpm;
  if (rhrElevated >= 5) {
    rcColor = rhrElevated >= 10 ? "red" : "amber";
    rcContributors.push(`Resting HR elevated +${rhrElevated} bpm`);
  } else {
    rcContributors.push("Resting heart rate in normal baseline range");
  }

  return {
    decisionReadiness: {
      name: "decision_readiness",
      color: drColor,
      score: Math.max(0, Math.min(100, Math.round((1 - hrvDeficit) * 80))),
      freshness: params.freshness,
      contributors: drContributors,
    },
    physicalReserves: {
      name: "physical_reserves",
      color: prColor,
      score: Math.max(0, Math.min(100, Math.round((rawSleep / baselines.sleepBaselineMinutes) * 80))),
      freshness: params.freshness,
      contributors: prContributors,
    },
    resilienceCapacity: {
      name: "resilience_capacity",
      color: rcColor,
      score: Math.max(0, Math.min(100, Math.round((baselines.restingHrBaselineBpm / Math.max(1, rawRhr)) * 80))),
      freshness: params.freshness,
      contributors: rcContributors,
    },
  };
}
