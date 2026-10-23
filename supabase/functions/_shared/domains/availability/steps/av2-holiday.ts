// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step AV2: Public Holiday Corroboration.
// Source: Part 2 Layer 2 (Section 4.2, AV2).

import type { PublicHoliday } from "../../time/types.ts";
import type { CanonicalCalendarItem } from "../../calendar/types.ts";

export function stepPublicHoliday(params: {
  localDate: string;
  publicHolidays: PublicHoliday[];
  items: CanonicalCalendarItem[];
  homeCountry: string | null;
  homeRegion: string | null;
}): { name: string; region: string | null; source: string } | null {
  // 1. From Time & Locale publicHolidays list (already filtered for home)
  const todayHoliday = params.publicHolidays.find((h) => h.date === params.localDate);
  if (todayHoliday) {
    return {
      name: todayHoliday.name,
      region: todayHoliday.region ?? null,
      source: todayHoliday.source,
    };
  }

  // 2. From calendar event title with region filter
  for (const item of params.items) {
    const titleLower = item.title.toLowerCase();
    if (titleLower.includes("bank holiday") || titleLower.includes("public holiday") || titleLower.includes("national holiday")) {
      // Check region token if present
      if (params.homeRegion && titleLower.includes("(") && titleLower.includes(")")) {
        const match = titleLower.match(/\(([^)]+)\)/);
        if (match) {
          const regionInTitle = match[1].trim();
          if (!params.homeRegion.toLowerCase().includes(regionInTitle.toLowerCase())) {
            // Holiday for another region -> does not apply to home
            continue;
          }
        }
      }
      return {
        name: item.title,
        region: params.homeRegion,
        source: "calendar",
      };
    }
  }

  return null;
}
