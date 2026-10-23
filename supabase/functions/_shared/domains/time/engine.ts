// [KIND: engine] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Time and Locale Engine Orchestrator.
// Source: Part 2 Layer 2 (Section 4.1).

import type { TimeLocaleProfile, TimeLocaleFacts, PublicHoliday } from "./types.ts";
import { stepLocalNow } from "./steps/tl1-local-now.ts";
import { stepResolveHome } from "./steps/tl2-home.ts";
import { stepWeekendAndPlanning } from "./steps/tl3-weekend.ts";
import { stepPublicHolidays } from "./steps/tl4-holidays.ts";

export class TimeEngine {
  /**
   * Evaluates date, weekday, locale, weekend, and public holidays for the user.
   */
  public evaluate(
    profile: TimeLocaleProfile,
    now: Date = new Date(),
    options?: { calendarHolidays?: PublicHoliday[] },
  ): TimeLocaleFacts {
    const { effectiveTimezone, localDate, weekday, dayBounds } = stepLocalNow(profile, now);
    const { homeCountry, homeCountryStatus, homeRegion } = stepResolveHome(profile);
    const { weekendDays, planningDay, isWeekendDay } = stepWeekendAndPlanning(homeCountry, weekday);
    const publicHolidays = stepPublicHolidays({
      homeCountry,
      homeRegion,
      localDate,
      calendarHolidays: options?.calendarHolidays,
    });

    return {
      localDate,
      weekday,
      dayBounds,
      effectiveTimezone,
      homeCountry,
      homeCountryStatus,
      homeRegion,
      weekendDays,
      planningDay,
      isWeekendDay,
      publicHolidays,
    };
  }
}

export const timeEngine = new TimeEngine();
