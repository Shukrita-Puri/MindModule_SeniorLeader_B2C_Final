// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step AV1: Explicit Personal Leave.
// Source: Part 2 Layer 2 (Section 4.2, AV1).

import type { LeaveInfo } from "../types.ts";
import { PTO_TITLE_RX } from "../constants.ts";
import type { CanonicalCalendarItem } from "../../calendar/types.ts";

export function stepExplicitLeave(params: {
  declaredLeave?: boolean;
  providerOoo?: boolean;
  items: CanonicalCalendarItem[];
}): LeaveInfo | null {
  // 1. In-app declared leave ("I'm off")
  if (params.declaredLeave) {
    return {
      source: "declared",
      inferred: false,
      confidence: "high",
      evidence: ["User declared leave in-app"],
    };
  }

  // 2. Provider out-of-office status
  if (params.providerOoo) {
    return {
      source: "explicit",
      inferred: false,
      confidence: "high",
      evidence: ["Calendar provider out-of-office status active"],
    };
  }

  // 3. Calendar item matching OOO / PTO / Annual leave
  for (const item of params.items) {
    if (PTO_TITLE_RX.test(item.title)) {
      if (item.allDay) {
        return {
          source: "explicit",
          inferred: false,
          confidence: "high",
          evidence: [`All-day leave item: "${item.title}"`],
        };
      } else {
        // Timed partial leave
        const partialHours = (item.startUtc && item.endUtc)
          ? { start: item.startUtc, end: item.endUtc }
          : null;
        return {
          source: "explicit",
          partialHours,
          inferred: false,
          confidence: "high",
          evidence: [`Timed partial leave item: "${item.title}"`],
        };
      }
    }
  }

  return null;
}
