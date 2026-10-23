// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step AV3 & AV4: Weekend and Long Weekend Determination.
// Source: Part 2 Layer 2 (Section 4.2, AV3, AV4).

import type { PublicHoliday } from "../../time/types.ts";

export function stepWeekendAndLongWeekend(params: {
  localDate: string;
  isWeekendDay: boolean;
  weekendDays: number[];
  publicHolidays: PublicHoliday[];
}): {
  isWeekend: boolean;
  longWeekend: { startDate: string; endDate: string } | null;
} {
  const isWeekend = params.isWeekendDay;
  const curr = new Date(`${params.localDate}T00:00:00Z`);

  // Check if today is part of a long weekend
  // A long weekend is formed when a public holiday falls on the working day
  // immediately preceding or succeeding the weekend.
  const prevDate = new Date(curr.getTime() - 24 * 60 * 60 * 1000);
  const nextDate = new Date(curr.getTime() + 24 * 60 * 60 * 1000);
  const prevDateStr = prevDate.toISOString().slice(0, 10);
  const nextDateStr = nextDate.toISOString().slice(0, 10);

  const prevIsHoliday = params.publicHolidays.some((h) => h.date === prevDateStr);
  const nextIsHoliday = params.publicHolidays.some((h) => h.date === nextDateStr);
  const todayIsHoliday = params.publicHolidays.some((h) => h.date === params.localDate);

  let longWeekend: { startDate: string; endDate: string } | null = null;

  // Case 1: Weekend with Monday holiday -> Sat, Sun, Mon
  // If today is Saturday (6) and Monday is holiday:
  if (isWeekend && nextIsHoliday) {
    longWeekend = { startDate: params.localDate, endDate: nextDateStr };
  } else if (todayIsHoliday && params.weekendDays.includes(prevDate.getUTCDay())) {
    // Today is Monday holiday after weekend
    const satDate = new Date(curr.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    longWeekend = { startDate: satDate, endDate: params.localDate };
  } else if (todayIsHoliday && params.weekendDays.includes(nextDate.getUTCDay())) {
    // Today is Friday holiday before weekend
    const sunDate = new Date(curr.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    longWeekend = { startDate: params.localDate, endDate: sunDate };
  }

  return {
    isWeekend,
    longWeekend,
  };
}
