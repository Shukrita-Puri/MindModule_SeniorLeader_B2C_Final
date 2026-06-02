// MRS v3 — Afternoon window context (12:00–17:59 local).
//
// Answers: "What has today already cost, what is still ahead, is a gap
// developing now?" Only window that reads intraday HR. Pure derivation.

import type { AfternoonContext, WindowContextInput } from './window-context-types.ts';
import {
  availableGapsCount,
  backToBackHours,
  deviationPct,
  firstHighStakes,
  highestCategory,
  meetingCount,
  splitByNow,
} from './_event-utils.ts';
import { categoryOf } from './_event-utils.ts';

/**
 * Build the afternoon context. Pure. Safe to call with empty/null inputs.
 */
export function buildAfternoonContext(input: WindowContextInput): AfternoonContext {
  const { completed, remaining } = splitByNow(input.todayEvents, input.now);

  const wear = input.wearable ?? null;
  const hrPct = deviationPct(wear?.hrCurrent ?? null, wear?.rhrBaseline30d ?? null);

  const highestRemaining = firstHighStakes(remaining, input.now);

  // Decision-leakage proxy: emotional-drain Cat-D event in next 4h AND
  // current HR elevated > 10% above resting baseline.
  const t = input.now.getTime();
  const hasDrainNext4h = remaining.some((e) => {
    if (categoryOf(e.title) !== 'D') return false;
    const start = new Date(e.start_time).getTime();
    if (!Number.isFinite(start)) return false;
    return start - t <= 4 * 3600_000;
  });
  const decisionLeakageRisk = hasDrainNext4h && (hrPct != null && hrPct >= 10);

  const jitRemaining = (input.jitEventsToday ?? []).filter((j) => {
    if (j.actioned) return false;
    const s = new Date(j.event_start_time).getTime();
    return Number.isFinite(s) && s > t;
  }).length;

  return {
    window: 'afternoon',
    meetingsCompleted: meetingCount(completed),
    highestCompletedCategory: highestCategory(completed),
    meetingsRemaining: meetingCount(remaining),
    highestRemainingStakes: highestRemaining,
    backToBackRemainingHours: backToBackHours(remaining),
    availableGapsRemaining: availableGapsCount(remaining, 15),
    currentHrVsRestingPct: hrPct,
    decisionLeakageRisk,
    jitEventsRemaining: jitRemaining,
    planPriorityOneTitle: input.plan?.priorityOneTitle ?? null,
    planPriorityOneCompleted: input.plan?.priorityOneCompleted ?? false,
  };
}