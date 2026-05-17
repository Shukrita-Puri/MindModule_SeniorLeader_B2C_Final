/**
 * CLUSTER: Back-to-back load + meeting-prep cliff
 * SOURCE: doc §5.2 rows "Back-to-back load override" + user's "2nd nudge" cliff rule.
 *
 * APPLICATION (Batch 2):
 * - BRIEF: not surfaced (intra-day, nudge-only signal).
 * - PLAN:  no boost (slots already compressed).
 * - NUDGE: meetingPrepCliff forces notification-is-product copy contract — full
 *          reframe in body, no app-open CTA, TTL = gap minutes − 1.
 *
 * RULES (Batch 2):
 *   backToBackLoadOverride  // ≥4h back-to-back + ≥1 gap <15min → light-touch mode
 *   meetingPrepCliff        // gap ∈ {5,15,30}min before high-stakes → notification-is-product
 *
 * CLIFF SEVERITY:
 *   gap == 5min  → high   (no time even to read more than the title)
 *   gap == 15min → medium (one-line reframe + 90s cue)
 *   gap == 30min → low    (can include a "tap for 2-min reset" CTA)
 *
 * SIGNALS CONSUMED: backToBackHoursToday, backToBackHoursAggregated,
 *                   ctx.nextPreEventGap, ctx.upcomingEvents.
 * OVERRIDES: yields to Travel landing window.
 */

// Batch 2 will implement: backToBackLoadOverride, meetingPrepCliff.

export {};