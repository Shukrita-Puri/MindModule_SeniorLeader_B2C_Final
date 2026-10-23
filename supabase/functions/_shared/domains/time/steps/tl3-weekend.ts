// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step TL3: Weekend and Planning Day.
// Source: Part 2 Layer 2 (Section 4.1, TL3).

import { SATURDAY_WEEKEND_COUNTRIES } from "../constants.ts";

export function stepWeekendAndPlanning(homeCountry: string | null, currentWeekday: number): {
  weekendDays: number[];
  planningDay: number;
  isWeekendDay: boolean;
} {
  const c = (homeCountry ?? "").toUpperCase();
  const isFriSat = SATURDAY_WEEKEND_COUNTRIES.has(c);

  // Friday (5) & Saturday (6) for Middle Eastern weekend countries, planning on Saturday (6)
  // Saturday (6) & Sunday (0) for Western / default countries, planning on Sunday (0)
  const weekendDays = isFriSat ? [5, 6] : [0, 6];
  const planningDay = isFriSat ? 6 : 0;
  const isWeekendDay = weekendDays.includes(currentWeekday);

  return {
    weekendDays,
    planningDay,
    isWeekendDay,
  };
}
