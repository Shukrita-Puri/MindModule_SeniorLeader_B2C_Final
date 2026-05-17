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

// Batch 2 will implement: travelPreFlightMandatory, travelLandingOffload,
// travelLandingPlusHighStakes, longHaulRecovery, postTripReentry.

export {};