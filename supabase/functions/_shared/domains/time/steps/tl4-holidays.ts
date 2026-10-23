// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step TL4: Public Holidays for Home.
// Source: Part 2 Layer 2 (Section 4.1, TL4).

import type { PublicHoliday } from "../types.ts";
import { HOLIDAY_LOOKAHEAD_DAYS } from "../constants.ts";

/**
 * Standard known public holidays for supported major regions (national & regional).
 * Extensible through public lookup or user calendar markers.
 */
const KNOWN_HOLIDAYS: Record<string, Array<{ month: number; day: number; name: string; region?: string }>> = {
  GB: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 5, day: 1, name: "Early May Bank Holiday" },
    { month: 5, day: 29, name: "Spring Bank Holiday" },
    { month: 8, day: 28, name: "Summer Bank Holiday", region: "England" },
    { month: 11, day: 30, name: "St Andrew's Day", region: "Scotland" },
    { month: 12, day: 25, name: "Christmas Day" },
    { month: 12, day: 26, name: "Boxing Day" },
  ],
  US: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 7, day: 4, name: "Independence Day" },
    { month: 11, day: 11, name: "Veterans Day" },
    { month: 12, day: 25, name: "Christmas Day" },
  ],
  DE: [
    { month: 1, day: 1, name: "Neujahr" },
    { month: 1, day: 6, name: "Heilige Drei Könige", region: "Bavaria" },
    { month: 10, day: 3, name: "Tag der Deutschen Einheit" },
    { month: 12, day: 25, name: "Erster Weihnachtstag" },
    { month: 12, day: 26, name: "Zweiter Weihnachtstag" },
  ],
  AE: [
    { month: 1, day: 1, name: "New Year's Day" },
    { month: 12, day: 2, name: "National Day" },
  ],
  SA: [
    { month: 2, day: 22, name: "Founding Day" },
    { month: 9, day: 23, name: "National Day" },
  ],
};

export function stepPublicHolidays(params: {
  homeCountry: string | null;
  homeRegion: string | null;
  localDate: string;
  calendarHolidays?: PublicHoliday[];
}): PublicHoliday[] {
  const result: PublicHoliday[] = [];
  if (!params.homeCountry) return result;

  const country = params.homeCountry.toUpperCase();
  const baseDate = new Date(`${params.localDate}T00:00:00Z`);

  // Compute lookahead window
  const endDate = new Date(baseDate.getTime() + HOLIDAY_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

  const countryHolidays = KNOWN_HOLIDAYS[country] || [];
  const currentYear = baseDate.getUTCFullYear();

  for (const h of countryHolidays) {
    if (h.region && params.homeRegion && !params.homeRegion.toLowerCase().includes(h.region.toLowerCase())) {
      continue;
    }

    const hDateStr = `${currentYear}-${String(h.month).padStart(2, "0")}-${String(h.day).padStart(2, "0")}`;
    const hDate = new Date(`${hDateStr}T00:00:00Z`);

    if (hDate >= baseDate && hDate <= endDate) {
      result.push({
        date: hDateStr,
        name: h.name,
        country,
        region: h.region || null,
        source: "dataset",
      });
    }
  }

  // Corroborate with user's calendar holidays if provided
  if (params.calendarHolidays && params.calendarHolidays.length > 0) {
    for (const ch of params.calendarHolidays) {
      if (ch.country.toUpperCase() === country) {
        if (!ch.region || !params.homeRegion || params.homeRegion.toLowerCase().includes(ch.region.toLowerCase())) {
          if (!result.some((r) => r.date === ch.date)) {
            result.push({
              ...ch,
              source: "calendar",
            });
          }
        }
      }
    }
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}
