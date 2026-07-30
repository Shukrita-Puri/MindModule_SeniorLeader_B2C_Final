import { dayOfWeekFromIsoDate } from "../signal-engine/day-kind-detector.ts";

export const SATURDAY_WEEKLY_COUNTRIES = new Set([
  "SA", "KW", "QA", "BH", "OM", "IL",
]);

export interface UserLocaleContext {
  homeCountry: string;          // ISO-3166 alpha-2
  currentCountry: string | null;
  timezone: string;             // IANA tz
  localDate: string;            // YYYY-MM-DD in USER's tz — not server UTC
  dayOfWeek: number;            // from localDate in user's tz — THE ONLY dayOfWeek used downstream
  weekendDays: number[];        // derived from homeCountry via planningDayOfWeek()
  planningDayOfWeek: number;    // reused from week-ahead-mode.ts
  isWeekendRestDay: boolean;    // weekendDays.includes(dayOfWeek)
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
  const homeCountry = (opts.homeCountry || "US").toUpperCase();
  const currentCountry = opts.currentCountry || null;
  const timezone = opts.timezone || "UTC";

  // Calculate local date and day of week in user's timezone
  const now = new Date(opts.utcNowMs);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  
  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value || "";
  const month = parts.find((p) => p.type === "month")?.value || "";
  const day = parts.find((p) => p.type === "day")?.value || "";
  const localDate = opts.localDate || `${year}-${month}-${day}`;
  const dayOfWeek = dayOfWeekFromIsoDate(localDate);

  const planDay = planningDayOfWeek(homeCountry);
  // If planning day is Saturday (6), weekend is Friday (5) and Saturday (6)
  // If planning day is Sunday (0), weekend is Saturday (6) and Sunday (0)
  const weekendDays = planDay === 6 ? [5, 6] : [0, 6];
  const isWeekendRestDay = weekendDays.includes(dayOfWeek);

  return {
    homeCountry,
    currentCountry,
    timezone,
    localDate,
    dayOfWeek,
    weekendDays,
    planningDayOfWeek: planDay,
    isWeekendRestDay,
  };
}
