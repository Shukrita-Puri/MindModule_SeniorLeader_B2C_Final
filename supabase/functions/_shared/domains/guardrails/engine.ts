// [KIND: engine] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Guardrails Engine (GRD) for Mind Module.
// Evaluates candidates across all surfaces before output.
// Source: Part 2 Layer 5 (Section 5).

import {
  B2B_CHAIN_GAP_MINUTES,
  DAILY_PUSH_CAP,
  DEFAULT_SEND_WINDOW,
  DENSE_DAY_MAX_PRACTICE_MINUTES,
  DENSE_DAY_MAX_WORDS,
  PUSH_SPACING_MINUTES,
} from "./constants.ts";
import type {
  CandidatePayload,
  FormLimits,
  GuardrailContext,
  GuardrailVerdict,
} from "./types.ts";

/** Helper to format time into "your 3pm" or "your 10:30am" */
function formatTimeReference(meetingTime?: string): string {
  if (!meetingTime) return "your upcoming session";
  // If already formatted like "3pm" or "15:00"
  if (meetingTime.toLowerCase().includes("am") || meetingTime.toLowerCase().includes("pm")) {
    return `your ${meetingTime}`;
  }
  const parts = meetingTime.split(":");
  if (parts.length >= 2) {
    const hour = parseInt(parts[0], 10);
    const minute = parseInt(parts[1], 10);
    const ampm = hour >= 12 ? "pm" : "am";
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    const minStr = minute === 0 ? "" : `:${minute.toString().padStart(2, "0")}`;
    return `your ${h12}${minStr}${ampm}`;
  }
  return `your ${meetingTime}`;
}

/** Check if current local time is within quiet hours */
function checkQuietHours(
  hour: number,
  minute: number,
  wearableBedtime?: string | null,
): { inQuietHours: boolean; reason: string } {
  const currentTotal = hour * 60 + minute;

  if (wearableBedtime) {
    // Bedtime minus 30 minutes
    const parts = wearableBedtime.split(":");
    if (parts.length >= 2) {
      const bHour = parseInt(parts[0], 10);
      const bMin = parseInt(parts[1], 10);
      const quietStart = bHour * 60 + bMin - 30; // 30 min before bedtime
      // Wake time default 06:30 if not specified
      const quietEnd = DEFAULT_SEND_WINDOW.earliestHour * 60 + DEFAULT_SEND_WINDOW.earliestMinute; // 390 min (06:30)

      // If quietStart is later in the day (e.g. 22:00 = 1320 min)
      if (currentTotal >= quietStart || currentTotal < quietEnd) {
        return {
          inQuietHours: true,
          reason: `quiet_hours (bedtime minus 30 min: ${wearableBedtime} - 30m)`,
        };
      }
      return { inQuietHours: false, reason: "" };
    }
  }

  // Default send window: 06:30 to 21:00
  const windowStart = DEFAULT_SEND_WINDOW.earliestHour * 60 + DEFAULT_SEND_WINDOW.earliestMinute; // 390
  const windowEnd = DEFAULT_SEND_WINDOW.latestHour * 60 + DEFAULT_SEND_WINDOW.latestMinute; // 1260

  if (currentTotal < windowStart || currentTotal >= windowEnd) {
    return {
      inQuietHours: true,
      reason: "quiet_hours (outside 06:30-21:00 window)",
    };
  }

  return { inQuietHours: false, reason: "" };
}

/**
 * Main Guardrail Evaluation function (GRD1 - GRD5).
 * Enforces hard stops, pacing, shape, and privacy before delivery.
 */
export function evaluateGuardrails(
  candidate: CandidatePayload,
  context: GuardrailContext,
): GuardrailVerdict {
  // Compute standard form limits based on day state
  const formLimits: FormLimits = {
    pushAllowed: true,
    appOpenAllowed: !context.isDenseDay && !context.inPostDemandingGap,
    maxWords: context.isDenseDay ? DENSE_DAY_MAX_WORDS : undefined,
    maxPracticeMinutes: context.isDenseDay
      ? DENSE_DAY_MAX_PRACTICE_MINUTES
      : context.isCrisisEpisode
      ? 3
      : undefined,
  };

  // 1. Missing Consent (Health / Physiology)
  if (candidate.isHealthPhysiology && context.healthConsentGranted === false) {
    return {
      verdict: "suppress",
      reasonCode: "health_consent_missing",
      description: "User has not granted health-data consent; suppress physiology output (GR-10)",
    };
  }

  // 2. Gate Closed
  if (context.gateIsOpen === false || context.cardsAwaiting === true) {
    return {
      verdict: "suppress",
      reasonCode: "gate_closed",
      description: "Layer 2 Gate is closed; suppress candidate output",
    };
  }

  // 3. Crisis Mode: Only crisis-relevant content allowed (GR-07)
  if (context.isCrisisEpisode && !candidate.isCrisisContent) {
    return {
      verdict: "suppress",
      reasonCode: "crisis_mode",
      description: "Crisis episode active; suppressing non-crisis candidate (GR-07)",
    };
  }

  // 4. Already Done: Plan slot or JIT prep already completed today (GR-16)
  if (
    candidate.anchorEventId &&
    context.completedSlotAnchorIdsToday &&
    context.completedSlotAnchorIdsToday.includes(candidate.anchorEventId)
  ) {
    return {
      verdict: "suppress",
      reasonCode: "already_done",
      description: "Action or prep for this anchor event is already completed today (GR-16)",
    };
  }

  // 5. Protected Slot: Gap after high-stakes or emotionally demanding item (GR-04)
  if (context.inPostDemandingGap) {
    if (!candidate.isRecoveryOffer) {
      return {
        verdict: "defer",
        reasonCode: "protected_slot",
        description: "Post-demanding gap is reserved for recovery offers only; other candidates deferred (GR-04)",
      };
    }
  }

  // 6. Push-Specific Pacing & Hard Stops
  if (candidate.kind === "push") {
    // Quiet Hours Check (GR-01, GR-01b, GR-01c)
    const quietCheck = checkQuietHours(
      context.nowLocalHour,
      context.nowLocalMinute,
      context.wearableBedtime,
    );
    if (quietCheck.inQuietHours) {
      return {
        verdict: "defer",
        reasonCode: "quiet_hours",
        description: `Push outside send window: ${quietCheck.reason}`,
      };
    }

    // Daily Cap (GR-02, GR-19)
    // Countable pushes capped at DAILY_PUSH_CAP (3); silent syncs and week-ahead don't count
    const isCountable = candidate.isCountablePush ?? (candidate.pushKind !== "look_ahead");
    if (isCountable) {
      if (context.countablePushesTodayCount >= DAILY_PUSH_CAP) {
        return {
          verdict: "suppress",
          reasonCode: "daily_cap",
          description: `Daily push limit reached (${context.countablePushesTodayCount}/${DAILY_PUSH_CAP}) (GR-02, GR-19)`,
        };
      }

      // Spacing: At least 2h (120 min) between countable pushes
      if (
        context.minutesSinceLastPush != null &&
        context.minutesSinceLastPush < PUSH_SPACING_MINUTES
      ) {
        const remainingMinutes = PUSH_SPACING_MINUTES - context.minutesSinceLastPush;
        const deferDate = new Date(context.nowUtc.getTime() + remainingMinutes * 60 * 1000);
        return {
          verdict: "defer",
          reasonCode: "spacing",
          description: `Minimum 2h spacing required between countable pushes (last push was ${context.minutesSinceLastPush}m ago)`,
          deferUntilUtc: deferDate.toISOString(),
        };
      }
    }

    // Back-to-back Chain Guard (GR-14, GR-15)
    if (
      context.gapMinutesRemaining != null &&
      context.gapMinutesRemaining < B2B_CHAIN_GAP_MINUTES
    ) {
      return {
        verdict: "suppress",
        reasonCode: "back_to_back",
        description: `Gap of ${context.gapMinutesRemaining}m is below 15m minimum back-to-back threshold (GR-14)`,
      };
    }
  }

  // 7. Privacy / Time-only Modification (GR-08, GR-09)
  // Sensitive meeting or private item cannot quote titles or names
  if (candidate.isPrivateItem || candidate.isSensitiveMeeting) {
    let modifiedText = candidate.body;
    const timeRef = formatTimeReference(candidate.meetingTime);

    if (candidate.body) {
      // If body contains sensitive info like "before your session with Dr Patel" or appointment titles
      // Rewrite lead to "Before your 3pm..."
      if (/before your/i.test(candidate.body)) {
        // Strip everything from "before your" to the end of that clause or sentence
        const dataPart = candidate.body.replace(/\s*before your.*$/i, "").trim();
        if (dataPart) {
          modifiedText = `Before ${timeRef}. ${dataPart}.`;
        } else {
          modifiedText = `Before ${timeRef}.`;
        }
      } else {
        modifiedText = `Before ${timeRef}. ${candidate.body}`;
      }
    }

    return {
      verdict: "modify",
      reasonCode: "time_only",
      description: "Private item or sensitive meeting modified to time-only reference (GR-08, GR-09)",
      modifiedText,
      formLimits,
    };
  }

  // 8. Normal Allow
  return {
    verdict: "allow",
    reasonCode: "ok",
    description: "All guardrail checks passed",
    formLimits,
  };
}
