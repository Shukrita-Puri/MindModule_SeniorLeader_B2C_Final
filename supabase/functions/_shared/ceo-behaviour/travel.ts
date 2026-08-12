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

// ---------------------------------------------------------------------------
// Part 1 — Travel Load & Post-Landing Delivery Split. Single source of truth
// for the tier/window/delivery constants. Inline literals elsewhere (brief-
// signal-coverage, back-to-back) MUST import from here.
// ---------------------------------------------------------------------------

export const LONG_HAUL_MIN_HOURS = 3;
export const LANDING_WINDOW_SHORT_MIN = 60;
export const LANDING_WINDOW_LONG_MIN = 90;
export const LANDING_PRACTICE_GATE_MIN = 120;
export const LANDING_NUDGE_ONLY_MAX_MIN = 60;
export const TRAVEL_AWAY_MIN_KM = 50;
export const SHORT_HAUL_RETURN_WINDOW_MIN = 30;

export type TravelStateValue =
  | 'not_travelling'
  | 'travel_planned'
  | 'en_route'
  | 'arrived'
  | 'returning'
  | 'location_unknown'
  | string;

/** Pure helper — true when the user is currently away from their home
 *  location. Either signal alone is sufficient. */
export function isAwayFromHome(
  state?: TravelStateValue | null,
  distanceKm?: number | null,
): boolean {
  if (state && (state === 'en_route' || state === 'arrived' || state === 'returning')) {
    return true;
  }
  if (typeof distanceKm === 'number' && distanceKm > TRAVEL_AWAY_MIN_KM) {
    return true;
  }
  return false;
}

/** Group today's travel-titled events by their local calendar date and return
 *  true when two or more share today's date (outbound + return). Caller passes
 *  `now` so we anchor the date in the user's local clock. */
export function isSameDayRoundTrip(
  events: ReadonlyArray<TravelEventLike>,
  now: Date,
): boolean {
  const todayKey = toLocalDateKey(now);
  let count = 0;
  for (const e of events) {
    if (!isTravelTitle(e.title)) continue;
    const start = new Date(e.start_time);
    if (!Number.isFinite(start.getTime())) continue;
    if (toLocalDateKey(start) !== todayKey) continue;
    count += 1;
    if (count >= 2) return true;
  }
  return false;
}

function toLocalDateKey(d: Date): string {
  // YYYY-MM-DD in the caller's runtime timezone. brief-signal-coverage already
  // passes Date objects normalised to the user's local clock, so getFullYear /
  // getMonth / getDate are the correct accessors.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Tier classification — long-haul wins. Same-day round-trip requires both
 *  the calendar shape AND that the user is actually away (eliminates the
 *  "drove to the next town and back" edge case). */
export function classifyTravelTier(
  durationHours: number,
  sameDayReturn: boolean,
  awayFromHome: boolean,
): 'long_haul' | 'short_haul' | 'short_haul_round_trip' {
  if (durationHours >= LONG_HAUL_MIN_HOURS) return 'long_haul';
  if (sameDayReturn && awayFromHome) return 'short_haul_round_trip';
  return 'short_haul';
}

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
    !!ctx.signals.longHaulFlight &&
    ctx.signals.longHaulFlight.durationHours >= LONG_HAUL_MIN_HOURS;
  return longHaul ? LANDING_WINDOW_LONG_MIN : LANDING_WINDOW_SHORT_MIN;
}

/** Part 1 — fail-open gate. Returns true when caller hasn't hydrated
 *  travel_state (awayFromHome === undefined) OR when away is confirmed. */
function awayOrUnknown(ctx: RuleContext): boolean {
  return ctx.signals.awayFromHome !== false;
}

/** Part 1 — true when the new same-day round-trip arc owns this tick.
 *  travelLandingOffload / travelLandingPlusHighStakes yield to it. */
function roundTripArcActive(ctx: RuleContext): boolean {
  return ctx.signals.travelTier === 'short_haul_round_trip';
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
      "The journey will cost more than the timetable shows. Beat (a): name the wearable signal + the flight as the day's real demand. Beat (b): travel takes more from the system than it appears — name that honestly. Beat (c): direction is protecting what's there before the journey spends it. Beat (d): arrival-oriented close (3–6 words). Never 'the journey is the day' alone — that is not a direction.",
  };
}

/** Landed, no high-stakes follow-up → decompress, hold cadence quiet for the window. */
export function travelLandingOffload(ctx: RuleContext): BehaviourFlag | null {
  if (!landingActive(ctx)) return null;
  if (!awayOrUnknown(ctx)) return null;            // Part 1 — at home, do not fire
  if (roundTripArcActive(ctx)) return null;         // Part 1 — round-trip arc owns this

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
      "The transit has already been paid for. Beat (a): name the signal + the fact of landing. Beat (b): the journey cost is already in the system — the body is still catching up even if the diary has moved on. Beat (c): sequence the first work block against the lag, not through it. Beat (d): close toward the rhythm returning.",
    landingDeliveryMode: insideWindow ? 'in_app_practice' : 'standard',
  };
}

/** Landed AND a high-stakes meeting is in next 24h → offload then sharpen for the meeting. */
export function travelLandingPlusHighStakes(ctx: RuleContext): BehaviourFlag | null {
  if (!landingActive(ctx)) return null;
  if (!awayOrUnknown(ctx)) return null;
  if (roundTripArcActive(ctx)) return null;
  const next = ctx.signals.highStakesEventInNext24h;
  if (!next) return null;

  // If meeting is within 30-60min of landing, the meeting itself drives prep timing.
  const meetingDrivesPrep = next.minutesUntil <= LANDING_NUDGE_ONLY_MAX_MIN;

  // Part 1 — delivery split:
  //   ≤60min  → push_only (no deep link, single cue)
  //   60-120  → push_only (prep-framed, still no deep link)
  //   ≥120    → in_app_practice (current default behaviour)
  const deliveryMode: BehaviourFlag['landingDeliveryMode'] =
    next.minutesUntil < LANDING_PRACTICE_GATE_MIN ? 'push_only' : 'in_app_practice';

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
    landingDeliveryMode: deliveryMode,
  };
}

/** Long-haul flight (≥3h), return day → full decompression in evening slot. */
export function longHaulRecovery(ctx: RuleContext): BehaviourFlag | null {
  const lh = ctx.signals.longHaulFlight;
  if (!lh || lh.durationHours < LONG_HAUL_MIN_HOURS) return null;
  if (!ctx.signals.travelDay && !landingActive(ctx)) return null;

  return {
    rule: "longHaulRecovery",
    severity: "high",
    evidence: [`long-haul ${lh.durationHours}h`],
    stake: "Operational Drive",
    copyHint:
      "Long-haul compounds everything: timezone, logistics, decision load at the other end. Beat (a): name the signal + the long-haul fact. Beat (b): the cost starts before boarding — name it. Beat (c): bank what you have now; the other side needs you intact. Beat (d): arrival-oriented close. Never a practice prescription.",
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
      "The trip left a lag that often goes unacknowledged. Beat (a): name the signal + the reentry fact. Beat (b): the body is still catching up even when the diary assumes normal service. Beat (c): sequence the first work block against the lag, not through it — one priority only. Beat (d): close toward protecting tonight so tomorrow doesn't start behind.",
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

// --- Canonical travel sub-arc window detection -----------------------------
// These thresholds encode the §4 Travel (G) timing contract for downstream
// nudge/notification consumers. Mirrors EVENT_PHASE_MAP.G.pre `T-3h pre-flight`
// (we accept 60–240min to allow earlier surfacing without losing intent) and
// the `in-flight` phase (≥90min duration so a mid-air protocol is realistic).
//
// Any consumer that needs to detect pre-flight or in-flight calendar windows
// MUST import these helpers rather than re-implementing the math, to keep
// Brief / Plan / Nudges aligned to a single travel sub-arc taxonomy.

export const TRAVEL_PRE_FLIGHT_WINDOW_MIN_MINUTES = 60;
export const TRAVEL_PRE_FLIGHT_WINDOW_MAX_MINUTES = 240;
export const TRAVEL_IN_FLIGHT_MIN_DURATION_MINUTES = 90;

export interface TravelEventLike {
  title?: string | null;
  start_time: string;
  end_time: string;
}

export interface TravelSubArcMatch {
  eventTitle: string;
  minutesUntil: number;
}

/**
 * Detect the first pre-flight travel event currently inside the canonical
 * pre-flight window (60–240 min before start). Returns null if no qualifying
 * travel event exists. Event titles are filtered via `isTravelTitle` so the
 * taxonomy match is single-sourced.
 */
export function detectPreFlightTravelEvent(
  events: ReadonlyArray<TravelEventLike>,
  now: Date,
): TravelSubArcMatch | null {
  const nowMs = now.getTime();
  for (const e of events) {
    if (!isTravelTitle(e.title)) continue;
    const startMs = new Date(e.start_time).getTime();
    const m = Math.round((startMs - nowMs) / 60000);
    if (
      m >= TRAVEL_PRE_FLIGHT_WINDOW_MIN_MINUTES &&
      m <= TRAVEL_PRE_FLIGHT_WINDOW_MAX_MINUTES
    ) {
      return { eventTitle: e.title || "Travel", minutesUntil: m };
    }
  }
  return null;
}

/**
 * Detect an in-flight travel event the user is currently inside, provided the
 * leg is long enough (≥90min) for a mid-flight protocol to be realistic.
 * `minutesUntil` is reported as minutes elapsed since start (matches the
 * existing smart-nudges field semantics for the in-flight sub-arc).
 */
export function detectInFlightTravelEvent(
  events: ReadonlyArray<TravelEventLike>,
  now: Date,
): TravelSubArcMatch | null {
  const nowMs = now.getTime();
  for (const e of events) {
    if (!isTravelTitle(e.title)) continue;
    const startMs = new Date(e.start_time).getTime();
    const endMs = new Date(e.end_time).getTime();
    const lengthMin = (endMs - startMs) / 60000;
    if (
      lengthMin >= TRAVEL_IN_FLIGHT_MIN_DURATION_MINUTES &&
      nowMs >= startMs &&
      nowMs <= endMs
    ) {
      return {
        eventTitle: e.title || "Flight",
        minutesUntil: Math.round((nowMs - startMs) / 60000),
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Part 1 — Same-Day Round-Trip Arc
//
// Three flags, all gated on travelTier === 'short_haul_round_trip'. Reuse
// existing trigger points (arrival/landing detection, back-to-back
// detection, return arrival) — no new scheduling infrastructure.
// ---------------------------------------------------------------------------

/**
 * Arc 1 — landed at the destination on a same-day round-trip.
 * Reframed as informational ("travel day ahead"), not recovery.
 * `push_only`: no deep-link CTA, single in-body cue.
 */
export function travelDayArrivalFraming(ctx: RuleContext): BehaviourFlag | null {
  if (!roundTripArcActive(ctx)) return null;
  if (!landingActive(ctx)) return null;
  // Only fire while the user is at the destination (not yet returned home).
  if (ctx.signals.awayFromHome === false) return null;

  const since = ctx.lastTravelEventEndedMinutesAgo ?? 0;
  return {
    rule: "travelDayArrivalFraming",
    severity: "medium",
    evidence: ["same-day round-trip", "arrival", `T+${Math.max(0, since)}min`],
    stake: "Operational Drive",
    copyHint:
      "travel day ahead — frame what's on the other side of the day; one orientation cue, no app-open CTA, do not invite a deep practice",
    landingDeliveryMode: 'push_only',
  };
}

/**
 * Arc 2 — destination day is back-to-back. Silent otherwise (no fallback).
 */
export function travelDayDuringPushOnly(ctx: RuleContext): BehaviourFlag | null {
  if (!roundTripArcActive(ctx)) return null;
  // Inline back-to-back check — same threshold as backToBackLoadOverride.
  // Imported via local helper to avoid a circular dep on back-to-back.ts.
  const local = ctx.backToBackHoursToday ?? 0;
  const agg = ctx.signals.backToBackHoursAggregated ?? 0;
  if (Math.max(local, agg) < 4) return null;

  return {
    rule: "travelDayDuringPushOnly",
    severity: "medium",
    evidence: ["same-day round-trip", `back-to-back ${Math.max(local, agg)}h`],
    stake: "Mental Bandwidth",
    copyHint:
      "compressed travel day — single breathing-cue notification only, no app-open CTA; lower frequency than a normal day",
    landingDeliveryMode: 'push_only',
  };
}

/**
 * Arc 3 — return leg arrival back home. Standard delivery (deep link allowed).
 * Window is SHORT_HAUL_RETURN_WINDOW_MIN (30 min). NOT gated by awayFromHome
 * being true — arriving home IS the trigger, so awayFromHome should now be
 * false. Defensive: also fires if awayFromHome is undefined (back-compat).
 */
export function travelDayReturnRecovery(ctx: RuleContext): BehaviourFlag | null {
  if (!roundTripArcActive(ctx)) return null;
  if (!landingActive(ctx)) return null;
  const since = ctx.lastTravelEventEndedMinutesAgo ?? 0;
  if (since > SHORT_HAUL_RETURN_WINDOW_MIN) return null;
  // Must be back home (or unknown). If we explicitly know they are still
  // away, this is not the return leg — Arc 1 owns it.
  if (ctx.signals.awayFromHome === true) return null;

  return {
    rule: "travelDayReturnRecovery",
    severity: "high",
    evidence: ["same-day round-trip", "return arrival", `T+${Math.max(0, since)}min`],
    stake: "Internal Buffer",
    copyHint:
      "back home — short decompression window; one body-down practice closes the day, deep-link to Plan is allowed",
    landingDeliveryMode: 'standard',
  };
}