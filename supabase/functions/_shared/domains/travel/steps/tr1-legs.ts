// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step TR1: Travel Legs and Duration Extraction.
// Source: Part 2 Layer 2 (Section 4.3, TR1).

import type { TravelLeg } from "../types.ts";
import type { ClassificationStamp } from "../../events/types.ts";
import type { CanonicalCalendarItem } from "../../calendar/types.ts";
import { LONG_HAUL_HOURS } from "../constants.ts";

export function stepExtractTravelLegs(
  items: CanonicalCalendarItem[],
  stamps: ClassificationStamp[],
): {
  legs: TravelLeg[];
  totalTravelMinutes: number;
} {
  const legs: TravelLeg[] = [];
  let totalTravelMinutes = 0;

  for (const item of items) {
    const stamp = stamps.find((s) => s.itemId === (item.externalId || item.identityKey));
    if (!stamp || stamp.category !== "G") continue;

    const startMs = item.startUtc ? new Date(item.startUtc).getTime() : 0;
    const endMs = item.endUtc ? new Date(item.endUtc).getTime() : 0;
    const durationMinutes = (endMs > startMs)
      ? Math.round((endMs - startMs) / 60000)
      : (stamp.dimensions.durationMinutes ?? 120);

    let mode: TravelLeg["mode"] = "unknown";
    if (stamp.subtype === "trv.flight" || stamp.subtype === "trv.long_haul") {
      mode = "flight";
    } else if (item.title.toLowerCase().includes("train") || item.title.toLowerCase().includes("eurostar")) {
      mode = "train";
    } else if (stamp.subtype === "trv.travel_day") {
      mode = "flight";
    }

    const haulTier: "short_haul" | "long_haul" =
      (durationMinutes >= LONG_HAUL_HOURS * 60 || stamp.subtype === "trv.long_haul")
        ? "long_haul"
        : "short_haul";

    legs.push({
      mode,
      durationMinutes,
      haulTier,
      departureUtc: item.startUtc,
      arrivalUtc: item.endUtc,
    });

    totalTravelMinutes += durationMinutes;
  }

  return {
    legs,
    totalTravelMinutes,
  };
}
