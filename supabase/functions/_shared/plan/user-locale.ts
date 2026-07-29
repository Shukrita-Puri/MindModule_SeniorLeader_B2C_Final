export interface UserLocaleContext {
  weekendDays: number[];
  planningDayOfWeek: number;
}

export function resolveUserLocaleContext(opts: {
  localDate: string | null;
  utcNowMs: number;
  homeCountry: string | null;
  timezone: string;
  timezoneOffsetMinutes: number;
}): UserLocaleContext {
  const isMiddleEast = opts.homeCountry === "AE" || opts.homeCountry === "SA" || opts.homeCountry === "IL" || opts.homeCountry === "EG";
  return {
    weekendDays: isMiddleEast ? [5, 6] : [0, 6],
    planningDayOfWeek: isMiddleEast ? 5 : 0,
  };
}
