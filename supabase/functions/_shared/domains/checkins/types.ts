// [KIND: specification] [LAYER: 0] [TIERS: 1] [AUDIENCE: universal]
// Domain types for Layer 0 Check-ins.
// Source: Part 2 Layer 0 (Section 7, 12.1).

import type { Provenance } from "../../spine/types.ts";
import type { CheckinWindow } from "./constants.ts";

export type { CheckinWindow };

export interface CheckInRecord {
  schemaVersion: 1;
  userId: string;
  localDate: string; // YYYY-MM-DD
  window: CheckinWindow;
  atUtc: string;
  dimensions: Record<string, number>; // clarity, emotion, pressure, regulation (1-5)
  words: string[];
  chargeResidue: number | null;
  provenance: Provenance;
}

export interface RawCheckinInput {
  userId: string;
  localDate: string;
  window?: string | null;
  atUtc?: string | null;
  dimensions?: Record<string, number> | null;
  words?: string[] | null;
  chargeResidue?: number | null;
}
