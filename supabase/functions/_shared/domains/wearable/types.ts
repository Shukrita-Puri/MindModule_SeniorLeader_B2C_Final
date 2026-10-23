// [KIND: specification] [LAYER: 0] [TIERS: 0] [AUDIENCE: universal]
// Domain types for Layer 0 Wearables.
// Source: Part 2 Layer 0 (Section 5, 12.1).

import type { Provenance as SpineProvenance } from "../../spine/types.ts";

export type WearableMetric =
  | "hrv"
  | "restingHr"
  | "sleepTotalMin"
  | "sleepDeepMin"
  | "sleepRemMin"
  | "sleepScore"
  | "sleepEfficiency";

export interface MetricValue {
  value: number;
  unit: "ms" | "bpm" | "min" | "score" | "pct";
  metricProvenance:
    | "direct_oura"
    | "direct_whoop"
    | "apple_health_native"
    | "android_native"
    | "oura_via_apple_health"
    | "third_party_via_apple_health"
    | "unknown";
  recordedAt: string;
}

export interface WearableSample {
  atUtc: string;
  value: number;
}

export interface CanonicalWearableDay {
  schemaVersion: 1;
  userId: string;
  localDate: string; // The day the sleep ENDS (wake date)
  metrics: Partial<Record<WearableMetric, MetricValue>>;
  samples: {
    hrv?: WearableSample[];
    hr?: WearableSample[];
  };
  provenance: SpineProvenance;
}

export type WearableProvenance =
  | "direct_oura"
  | "direct_whoop"
  | "apple_health_native"
  | "oura_via_apple_health"
  | "third_party_via_apple_health"
  | "unknown";

export type WearableMergeContext = {
  directOuraConnected: boolean;
  directWhoopConnected: boolean;
  appleWatchPresentToday: boolean;
};

export type ReconciliationRecord = {
  metric: string;
  previousValue: unknown;
  incomingValue: unknown;
  previousSource: WearableProvenance;
  incomingSource: WearableProvenance;
  winner: "previous" | "incoming";
  reason: string;
};

export type MergeOptions = {
  now?: Date;
  recencyGuardHours?: number;
  onReconcile?: (rec: ReconciliationRecord) => void;
};
