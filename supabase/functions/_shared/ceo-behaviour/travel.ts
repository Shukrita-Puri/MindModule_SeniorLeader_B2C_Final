/**
 * CLUSTER: Travel (overrides every other cluster when active)
 * SOURCE: doc §5.2 rows "Travel arrival" / "Long-haul prep room" / "Post-trip reentry"
 *         + user direction (travel always wins, including on weekends).
 *
 * APPLICATION (Batch 2):
 * - BRIEF: anchor to "Landing → [next event]" or "Travel day — protect tomorrow".
 * - PLAN:  `regulate` (somatic pause) in slot closest to landing+60min;
 *          `integrate` in evening slot for long-haul.
 * - NUDGE: pre-flight 60-240min before flight; landing nudge T+60min after
 *          travel-event end; long-haul evening nudge 21:00 local at destination.
 *
 * RULES (Batch 2):
 *   travelPreFlightMandatory      // travel day, no landing yet → mandatory self-reg
 *   travelLandingOffload          // landing detected, no high-stakes follow-up → decompress
 *   travelLandingPlusHighStakes   // landing + high-stakes within 24h → offload then prep
 *   longHaulRecovery              // duration ≥3h, return day → full decompression
 *   postTripReentry               // yesterday was travel day, next-day density ≥medium
 *
 * LANDING DETECTION:
 *   signals.travelLandingDetected = true when EITHER
 *     - signals.foreignTelecomDetected === true  [reserved for native bridge — always false today]
 *     - ctx.lastTravelEventEndedMinutesAgo != null && lastTravelEventEndedMinutesAgo <= 60
 *
 * SIGNALS CONSUMED: travelDay, travelLandingDetected, longHaulFlight,
 *                   postTripReentryRisk, foreignTelecomDetected,
 *                   highStakesEventInNext24h, lastTravelEventEndedMinutesAgo.
 * OVERRIDES: suppresses Weekend, PTO, Workweek cadence (Workweek rules may still
 *            evaluate for evidence pills but Travel framing wins).
 */

import type { BehaviourFlag, RuleContext } from "../brief-context.ts";

/**
 * Canonical travel-title regex. Single source of truth for detecting whether a
 * calendar event title represents a travel leg (flight / airport / boarding /
 * landing / long-haul / red-eye / layover / transit / train).
 *
 * All consumers (brief-signal-coverage, generate-mastery-plan, smart-nudges)
 * MUST import this rather than re-declaring their own regex/keyword list, to
 * keep travel detection consistent across Brief / Plan / Nudges.
 *
 * Pure shape — does NOT classify whether a long gap is a true connection vs
 * personal time; that triangulation lives in the Edge consumer that populates
 * `inFlightConnectionMinutes`.
 */
export const TRAVEL_TITLE_RX =
  /\b(flight|flying|fly to|airport|boarding|depart(?:ure)?|arrival|arriving|landing|long[- ]haul|red[- ]?eye|layover|transit|train)\b/i;

/** Convenience predicate over the canonical travel regex. */
export function isTravelTitle(title: string | null | undefined): boolean {
  return !!title && TRAVEL_TITLE_RX.test(title);
}

/**
 * Compute the post-landing protected window.
 *   - If a meeting exists within 30-60min of landing → that meeting drives prep
 *     (window collapses to "prep ahead of it" framing).
 *   - Long-haul (≥3h): 90min default.
 *   - Short-haul: 60min default.
 * Caller passes ctx.lastTravelEventEndedMinutesAgo (>=0).
 */
function landingWindowMinutes(ctx: RuleContext): number {
  const longHaul =
    !!ctx.signals.longHaulFlight && ctx.signals.longHaulFlight.durationHours >= 3;
  return longHaul ? 90 : 60;
}

function landingActive(ctx: RuleContext): boolean {
  return ctx.signals.travelLandingDetected === true;
}

/** Travel day, no landing yet → pre-flight mandatory self-regulation. */
export function travelPreFlightMandatory(ctx: RuleContext): BehaviourFlag | null {
  if (!ctx.signals.travelDay) return null;
  if (landingActive(ctx)) return null;
  // Batch 4 — tighten to the 60–240 min window. Mechanical preFlightWindow is
  // populated by brief-signal-coverage from the FIRST travel event of the day.
  // If the field is unset (legacy callers) fall back to firing on travelDay
  // alone so we don't regress before consumers re-route.
  const win = ctx.signals.preFlightWindowMinutes;
  if (win !== undefined && win === null) return null;

  const title = ctx.signals.nextTravelEventTitle ?? undefined;
  return {
    rule: "travelPreFlightMandatory",
    severity: "medium",
    evidence: [
      "travel day",
      win != null ? `T-${win}min to departure` : "pre-flight window",
    ],
    anchorEvent: title,
    stake: "Operational Drive",
    copyHint:
      "anchor to pre-flight self-regulation — one somatic + one orientation pass; protect arrival state, not departure speed",
  };
}

/** Landed, no high-stakes follow-up → decompress, hold cadence quiet for the window. */
export function travelLandingOffload(ctx: RuleContext): BehaviourFlag | null {
  if (!landingActive(ctx)) return null;

  const next = ctx.signals.highStakesEventInNext24h;
  if (next && next.minutesUntil <= 24 * 60) return null; // landingPlusHighStakes owns this

  const since = ctx.lastTravelEventEndedMinutesAgo ?? 0;
  const window = landingWindowMinutes(ctx);
  const insideWindow = since <= window;

  return {
    rule: "travelLandingOffload",
    severity: insideWindow ? "high" : "medium",
    evidence: [
      "landing detected",
      `T+${Math.max(0, since)}min`,
      `window ${window}min`,
    ],
    stake: "Internal Buffer",
    copyHint:
      "decompression frame — immigration/transit overhead is real; one body-down practice, no app-open CTA inside the protected window",
  };
}

/** Landed AND a high-stakes meeting is in next 24h → offload then sharpen for the meeting. */
export function travelLandingPlusHighStakes(ctx: RuleContext): BehaviourFlag | null {
  if (!landingActive(ctx)) return null;
  const next = ctx.signals.highStakesEventInNext24h;
  if (!next) return null;

  // If meeting is within 30-60min of landing, the meeting itself drives prep timing.
  const meetingDrivesPrep = next.minutesUntil <= 60;

  return {
    rule: "travelLandingPlusHighStakes",
    severity: meetingDrivesPrep || next.minutesUntil <= 240 ? "high" : "medium",
    evidence: [
      "landing detected",
      `next high-stakes in ${next.minutesUntil}min`,
    ],
    anchorEvent: next.title,
    stake: "Executive Presence",
    copyHint: meetingDrivesPrep
      ? "no protected window — the meeting drives prep timing; one focused regulation pass (can be done in transit), then enter the call"
      : "decompress first, then sharpen — sequence matters; do not skip the body-down step to over-prep the slides",
  };
}

/** Long-haul flight (≥3h), return day → full decompression in evening slot. */
export function longHaulRecovery(ctx: RuleContext): BehaviourFlag | null {
  const lh = ctx.signals.longHaulFlight;
  if (!lh || lh.durationHours < 3) return null;
  if (!ctx.signals.travelDay && !landingActive(ctx)) return null;

  return {
    rule: "longHaulRecovery",
    severity: "high",
    evidence: [`long-haul ${lh.durationHours}h`],
    stake: "Operational Drive",
    copyHint:
      "long-haul carries a multi-day cost — evening practice is non-negotiable; sleep window > performance theatre tonight",
  };
}

/** Yesterday was travel + next-day density is medium/high → reentry-risk framing. */
export function postTripReentry(ctx: RuleContext): BehaviourFlag | null {
  if (!ctx.signals.postTripReentryRisk) return null;

  return {
    rule: "postTripReentry",
    severity: "medium",
    evidence: ["post-trip reentry", "tomorrow heavy"],
    stake: "Mental Bandwidth",
    copyHint:
      "reentry is its own load — do not treat today as a normal workday; protect the first 90 minutes tomorrow with a hard orientation block",
  };
}

// --- Batch 4: True connection leg in-flight nudge ---------------------------
// Fires only when Edge sets `inFlightConnectionMinutes` — i.e. it has confirmed
// this is a true connecting leg with a short enough layover that a during-flight
// self-regulation practice is realistic (assumes WiFi available).
// Long gaps (≥ ~9–10h) fall through to advancePrep24h (if a meeting is in the
// gap) or stay silent (likely personal time / PTO). That triangulation lives in
// Edge — this rule is shape-only.
export function travelInFlightConnection(ctx: RuleContext): BehaviourFlag | null {
  const window = ctx.signals.inFlightConnectionMinutes;
  if (window == null) return null;

  const title = ctx.signals.nextTravelEventTitle ?? "next leg";
  return {
    rule: "travelInFlightConnection",
    severity: "medium",
    evidence: [`connection in ${window}min`],
    anchorEvent: title,
    stake: "Internal Buffer",
    copyHint:
      `during-flight self-regulation pass — one body-down practice before "${title}"; do not over-program the layover`,
  };
}