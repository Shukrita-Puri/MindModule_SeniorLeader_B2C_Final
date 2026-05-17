/**
 * CLUSTER: Multi-calendar load aggregation
 * SOURCE: doc §5.2 row "Multi-calendar load distortion" + user direction
 *         (no work/personal labels — mobile-native-first; assess by event title only).
 *
 * APPLICATION (Batch 2):
 * - BRIEF: evidence pill "load spans X calendars" to prevent under-weighting.
 * - PLAN:  no direct boost; downstream rules read aggregated number.
 * - NUDGE: no direct trigger; back-to-back cluster consumes aggregated number.
 *
 * RULES (Batch 2):
 *   multiCalendarLoad  // calendarSources.length >= 2 AND backToBackHoursAggregated >= 4
 *
 * DEDUPE CONTRACT (calendar-neutral; picks ONE event from N duplicates):
 *   1. Normalize titles (lowercase, trim, strip emoji/trailing punctuation).
 *   2. Two events from different sources are duplicates if:
 *        - normalized titles match exactly, OR
 *        - |startA - startB| < 2min AND |endA - endB| < 2min (title-agnostic).
 *   3. Same start time alone → counted as 1 for load (can only attend one).
 *   4. JIT selection picks variant with highest title-based stakes score.
 *   5. All-day events excluded from backToBackHoursAggregated.
 *   6. Log dedupeReason: "title" | "timeslot" | "all-day-filter".
 *
 * SIGNALS CONSUMED: calendarSources, backToBackHoursAggregated.
 * OVERRIDES: none — cross-cutting load helper.
 * HELPER FILE: calendar-dedupe.ts (Batch 2).
 */

// Batch 2 will implement: multiCalendarLoad (+ calendar-dedupe.ts helper).

export {};