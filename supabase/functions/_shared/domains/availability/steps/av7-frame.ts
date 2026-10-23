// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step AV6 & AV7: Quiet Run and Frame Assembly.
// Source: Part 2 Layer 2 (Section 4.2, AV6, AV7).

import type {
  AvailabilityFacts,
  AvailabilityFrame,
  LeaveInfo,
  RunPosition,
} from "../types.ts";
import { QUIET_RUN_WEEKDAYS } from "../constants.ts";

export function stepAssembleFrame(params: {
  explicitLeave: LeaveInfo | null;
  inferredLeave: LeaveInfo | null;
  publicHoliday: { name: string; region: string | null; source: string } | null;
  longWeekend: { startDate: string; endDate: string } | null;
  isWeekend: boolean;
  consecutiveQuietWeekdays?: number;
  runPosition?: RunPosition | null;
}): AvailabilityFacts {
  const leave = params.explicitLeave || params.inferredLeave;

  let frame: AvailabilityFrame = "workday";
  let isWorkingDay = true;

  // Frame precedence order (AV7):
  // leave > long_weekend > public_holiday > weekend > workday
  if (leave) {
    frame = "leave";
    isWorkingDay = false;
  } else if (params.longWeekend) {
    frame = "long_weekend";
    isWorkingDay = false;
  } else if (params.publicHoliday) {
    frame = "public_holiday";
    isWorkingDay = false;
  } else if (params.isWeekend) {
    frame = "weekend";
    isWorkingDay = false;
  } else {
    frame = "workday";
    isWorkingDay = true;
  }

  const possibleLeave = Boolean(
    params.consecutiveQuietWeekdays && params.consecutiveQuietWeekdays >= QUIET_RUN_WEEKDAYS && isWorkingDay
  );

  return {
    frame,
    isWorkingDay,
    leave,
    publicHoliday: params.publicHoliday,
    longWeekend: params.longWeekend,
    runPosition: params.runPosition ?? null,
    possibleLeave,
  };
}
