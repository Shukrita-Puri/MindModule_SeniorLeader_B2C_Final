// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step LD9 & LD10: Work on Non-Working Days and Recovery Owed.
// Source: Part 2 Layer 2 (Section 4.5, LD9, LD10).

import type { AvailabilityFacts } from "../../availability/types.ts";
import type { WorkOnNonWorkingDayFact, LoadLevel, LoadReason } from "../types.ts";
import { WORK_ON_NONWORKDAY_MINUTES } from "../constants.ts";

export function stepWorkOnNonWorkingDay(params: {
  availability: AvailabilityFacts;
  workMeetingCount: number;
  totalWorkMinutes: number;
  hasHighStakesMeeting: boolean;
  computedLevel: LoadLevel;
  reasons: LoadReason[];
}): {
  workOnNonWorkingDay: WorkOnNonWorkingDayFact | null;
  recoveryOwed: boolean;
  recoveryReason: string | null;
} {
  const isNonWorkingFrame = !params.availability.isWorkingDay;

  let workOnNonWorkingDay: WorkOnNonWorkingDayFact | null = null;
  let recoveryOwed = false;
  let recoveryReason: string | null = null;

  if (isNonWorkingFrame && (params.workMeetingCount > 0 || params.totalWorkMinutes > 0)) {
    const isFullWorkingDay =
      params.workMeetingCount >= 2 ||
      params.hasHighStakesMeeting ||
      params.totalWorkMinutes >= WORK_ON_NONWORKDAY_MINUTES;

    const frameLabel = params.availability.frame === "weekend"
      ? "Working weekend"
      : params.availability.frame === "leave"
      ? "Working on leave"
      : "Working on public holiday";

    workOnNonWorkingDay = {
      active: true,
      isFullWorkingDay,
      meetingCount: params.workMeetingCount,
      workMinutes: params.totalWorkMinutes,
      label: frameLabel,
    };
  }

  // Recovery owed determination (LD10):
  // Set for heavy day, high-stakes day, work on non-working day, or heavy travel day
  if (params.computedLevel === "heavy") {
    recoveryOwed = true;
    recoveryReason = `Heavy load due to ${params.reasons.join(", ")}`;
  } else if (params.hasHighStakesMeeting) {
    recoveryOwed = true;
    recoveryReason = "High-stakes anchor requires evening offload and morning reset";
  } else if (workOnNonWorkingDay?.isFullWorkingDay) {
    recoveryOwed = true;
    recoveryReason = `${workOnNonWorkingDay.label} demands recovery`;
  }

  return {
    workOnNonWorkingDay,
    recoveryOwed,
    recoveryReason,
  };
}
