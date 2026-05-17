/**
 * Barrel for the CEO behaviour cluster files.
 *
 * Add a new behaviour by:
 *   1. Implementing it in the appropriate cluster file.
 *   2. Re-exporting the function from this barrel.
 *   3. Adding it to ALL_RULES with the correct scope tags.
 *
 * Do NOT create new rule files per surface (brief/plan/nudge). Surface gating is
 * the scope-tag's job, not the file's.
 */

import type { ScopedRule } from "../brief-context.ts";

// --- Workweek cluster ---
import {
  vetoRisk,
  secondWind,
  circadianPriority,
  decisionLeakageGuard,
  personalFrictionInference,
  boardLevelOutcome,
  sundayReset,
  notificationIsProduct,
} from "./workweek.ts";

// --- Post-peak cluster ---
import { postPeakHangover } from "./post-peak.ts";

// --- Conference cluster ---
import { conferenceDepletion } from "./conference.ts";

// --- Batch 2 clusters ---
import {
  weekendMorningLightTouch,
  weekendWithMeeting,
  fullWorkingWeekend,
  weekendDeepWorkBlock,
  sundayEveningWeekAhead,
} from "./weekend.ts";
import {
  holidayReducedTouch,
  ptoWithMeetingFallback,
} from "./pto-holiday.ts";
import {
  travelPreFlightMandatory,
  travelLandingOffload,
  travelLandingPlusHighStakes,
  longHaulRecovery,
  postTripReentry,
} from "./travel.ts";
import { advancePrep24h } from "./high-stakes-prep.ts";
import {
  backToBackLoadOverride,
  meetingPrepCliff,
} from "./back-to-back.ts";
import { multiCalendarLoad } from "./multi-calendar.ts";

// --- Batch 3 clusters ---
import { decisionDensity } from "./decision-density.ts";
import {
  stackedStakes,
  crisisInjection,
  contextSwitchingCost,
  preEventSleepTarget,
  timeSinceLastRecovery,
} from "./stubs.ts";
import { interpersonalMeetingContext } from "./interpersonal.ts";
import { emptySlotProtection } from "./empty-slot.ts";
import { upwardReporting } from "./upward-reporting.ts";

export {
  vetoRisk,
  secondWind,
  circadianPriority,
  decisionLeakageGuard,
  postPeakHangover,
  personalFrictionInference,
  boardLevelOutcome,
  sundayReset,
  notificationIsProduct,
  conferenceDepletion,
  // Batch 2
  weekendMorningLightTouch,
  weekendWithMeeting,
  fullWorkingWeekend,
  weekendDeepWorkBlock,
  sundayEveningWeekAhead,
  holidayReducedTouch,
  ptoWithMeetingFallback,
  travelPreFlightMandatory,
  travelLandingOffload,
  travelLandingPlusHighStakes,
  longHaulRecovery,
  postTripReentry,
  advancePrep24h,
  backToBackLoadOverride,
  meetingPrepCliff,
  multiCalendarLoad,
  // Batch 3
  decisionDensity,
  interpersonalMeetingContext,
  emptySlotProtection,
  upwardReporting,
  stackedStakes,
  crisisInjection,
  contextSwitchingCost,
  preEventSleepTarget,
  timeSinceLastRecovery,
};

/**
 * All rules + the surfaces each is allowed to fire on. Order does NOT imply
 * priority — severity does. behaviour-evaluator sorts the output.
 */
export const ALL_RULES: ScopedRule[] = [
  { scopes: ["brief", "plan", "nudge"], fn: vetoRisk },
  { scopes: ["brief", "plan"],          fn: secondWind },
  { scopes: ["brief", "plan", "nudge"], fn: circadianPriority },
  { scopes: ["brief", "plan", "nudge"], fn: decisionLeakageGuard },
  { scopes: ["brief", "plan"],          fn: postPeakHangover },
  { scopes: ["brief"],                  fn: personalFrictionInference },
  { scopes: ["brief", "plan", "nudge"], fn: boardLevelOutcome },
  { scopes: ["brief", "plan", "nudge"], fn: sundayReset },
  { scopes: ["nudge"],                  fn: notificationIsProduct },
  { scopes: ["brief", "plan", "nudge"], fn: conferenceDepletion },

  // --- Batch 2: Weekend ladder (brief + plan; nudge timing handled in smart-nudges) ---
  { scopes: ["brief", "plan", "nudge"], fn: fullWorkingWeekend },
  { scopes: ["brief", "plan", "nudge"], fn: weekendWithMeeting },
  { scopes: ["brief", "plan", "nudge"], fn: weekendDeepWorkBlock },
  { scopes: ["brief", "plan", "nudge"], fn: sundayEveningWeekAhead },
  { scopes: ["brief", "nudge"],         fn: weekendMorningLightTouch },

  // --- Batch 2: PTO / Holiday ---
  { scopes: ["brief", "nudge"],         fn: holidayReducedTouch },
  { scopes: ["brief", "plan", "nudge"], fn: ptoWithMeetingFallback },

  // --- Batch 2: Travel (overrides every other cluster when active) ---
  { scopes: ["brief", "plan", "nudge"], fn: travelPreFlightMandatory },
  { scopes: ["brief", "plan", "nudge"], fn: travelLandingOffload },
  { scopes: ["brief", "plan", "nudge"], fn: travelLandingPlusHighStakes },
  { scopes: ["brief", "plan", "nudge"], fn: longHaulRecovery },
  { scopes: ["brief", "plan"],          fn: postTripReentry },

  // --- Batch 2: High-stakes 24h prep ---
  { scopes: ["brief", "plan", "nudge"], fn: advancePrep24h },

  // --- Batch 2: Back-to-back + meeting-prep cliff ---
  { scopes: ["brief", "plan", "nudge"], fn: backToBackLoadOverride },
  { scopes: ["nudge"],                  fn: meetingPrepCliff },

  // --- Batch 2: Multi-calendar load aggregation ---
  { scopes: ["brief", "plan"],          fn: multiCalendarLoad },

  // --- Batch 3: Decision density (rolling 4h window) ---
  { scopes: ["brief", "plan", "nudge"], fn: decisionDensity },

  // --- Batch 3 stubs (API surface locked; null until detectors land) ---
  { scopes: ["brief", "plan", "nudge"], fn: interpersonalMeetingContext },
  { scopes: ["plan", "nudge"],          fn: emptySlotProtection },
  { scopes: ["brief", "plan", "nudge"], fn: upwardReporting },
  { scopes: ["brief", "plan", "nudge"], fn: stackedStakes },
  { scopes: ["brief", "plan", "nudge"], fn: crisisInjection },
  { scopes: ["brief", "plan", "nudge"], fn: contextSwitchingCost },
  { scopes: ["nudge"],                  fn: preEventSleepTarget },
  { scopes: ["nudge"],                  fn: timeSinceLastRecovery },
];