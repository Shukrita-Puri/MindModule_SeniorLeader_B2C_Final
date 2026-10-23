// [KIND: step] [LAYER: 2] [TIERS: 0] [AUDIENCE: universal]
// Step TL1: Local Now (Effective timezone, local date, weekday, day boundaries).
// Source: Part 2 Layer 2 (Section 4.1, TL1).

export function stepLocalNow(
  profile: { deviceTimezone?: string | null; homeTimezone?: string | null },
  now: Date,
): {
  effectiveTimezone: string;
  localDate: string;
  weekday: number;
  dayBounds: { startIso: string; endIso: string };
} {
  const effectiveTimezone = profile.deviceTimezone || profile.homeTimezone || "UTC";

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: effectiveTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const localDate = formatter.format(now); // YYYY-MM-DD

  // Format weekday in effective timezone
  const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: effectiveTimezone,
    weekday: "short",
  });
  const weekdayShort = weekdayFormatter.format(now);
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdayMap[weekdayShort] ?? now.getUTCDay();

  // Day boundaries in UTC approximate
  const startIso = `${localDate}T00:00:00.000Z`;
  const endIso = `${localDate}T23:59:59.999Z`;

  return {
    effectiveTimezone,
    localDate,
    weekday,
    dayBounds: { startIso, endIso },
  };
}
