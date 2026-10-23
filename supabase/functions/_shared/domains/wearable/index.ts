// [KIND: barrel] [LAYER: 0] [TIERS: 0] [AUDIENCE: universal]
// Public entry point for Layer 0 Wearable domain.
// Source: Part 2 Layer 0 (Section 5), Part 4 Tree (wearable/).

export * from "./constants.ts";
export * from "./metrics.ts";
export * from "./canonical.ts";
export type { CanonicalWearableDay, MetricValue, WearableMetric, WearableSample } from "./types.ts";
