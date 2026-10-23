// Re-export Layer 2 Time domain and maintain backward compatibility.
// Source: Part 2 Layer 2 (Section 4.1), Final Tree Plan.

export * from "../domains/time/index.ts";

import {
  SATURDAY_WEEKEND_COUNTRIES,
} from "../domains/time/constants.ts";
import { timeEngine } from "../domains/time/engine.ts";

export const SATURDAY_WEEKLY_COUNTRIES = SATURDAY_WEEKEND_COUNTRIES;

export interface UserLocaleContext {
  homeCountry: string;
  currentCountry: string | null;
  timezone: string;
  localDate: string;
  dayOfWeek: number;
  weekendDays: number[];
  planningDayOfWeek: number;
  isWeekendRestDay: boolean;
}

export function planningDayOfWeek(homeCountry?: string | null): 0 | 6 {
  const c = (homeCountry ?? "").toUpperCase();
  return SATURDAY_WEEKLY_COUNTRIES.has(c) ? 6 : 0;
}

export function resolveUserLocaleContext(opts: {
  localDate: string | null;
  utcNowMs: number;
  homeCountry: string | null;
  timezone: string;
  timezoneOffsetMinutes: number;
  currentCountry?: string | null;
}): UserLocaleContext {
  const now = new Date(opts.utcNowMs);
  const facts = timeEngine.evaluate(
    {
      homeCountry: opts.homeCountry,
      deviceTimezone: opts.timezone,
    },
    now,
  );

  return {
    homeCountry: facts.homeCountry || "US",
    currentCountry: opts.currentCountry || null,
    timezone: facts.effectiveTimezone,
    localDate: opts.localDate || facts.localDate,
    dayOfWeek: facts.weekday,
    weekendDays: facts.weekendDays,
    planningDayOfWeek: facts.planningDay as 0 | 6,
    isWeekendRestDay: facts.isWeekendDay,
  };
}
