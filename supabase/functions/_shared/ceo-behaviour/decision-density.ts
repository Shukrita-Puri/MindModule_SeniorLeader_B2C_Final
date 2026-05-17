/**
 * CLUSTER: Decision density (NEW — Batch 3)
 * SOURCE: user request — measure cognitive decision-load in a rolling 4h window.
 *
 * APPLICATION (Batch 3):
 * - BRIEF: surface "X decisions clustered between Y and Z" when score ≥ medium.
 * - PLAN:  `prepare` (mindset flow) boosted into the slot preceding densest window.
 * - NUDGE: when score ≥ high AND meetingPrepCliff fires → severity stacks to high.
 *
 * RULES (Batch 3): decisionDensity
 *
 * MEASUREMENT (3 layers; cheap to ship):
 *   Layer 1 — Title scoring:
 *     DECISION_KEYWORDS = decision|approval|approve|review|sign-off|sign off|
 *                         go/no-go|go no go|vote|budget|hiring|termination|firing|
 *                         promotion|investment|commit|kick-off|launch|close|offer
 *     DECISION_BOOST_KEYWORDS = board|investor|exec|leadership|strategy
 *     decisionScore(title) = 1.0 if DECISION_KEYWORD present
 *                          + 0.5 if also BOOST keyword
 *                          + 0.3 if attendee count >= 6 (committee)
 *                          + 0.2 if duration < 30min (compressed)
 *
 *   Layer 2 — Attendee weight (when available):
 *     attendees >= 6 + decision keyword → committee × 1.5
 *     attendees == 2 + decision keyword → 1:1 ask × 0.7
 *     attendees unknown → × 1.0 (no penalty for iOS-aggregated events)
 *
 *   Layer 3 — Rolling window:
 *     score = Σ decisionScore(e) × attendeeWeight(e) over events in next 4h
 *     ≥ 4.0 → high; ≥ 2.5 → medium; else null
 *
 * SIGNALS CONSUMED: signals.decisionDensityScore, signals.decisionDensityWindow,
 *                   ctx.upcomingEvents (attendeeCount, durationMinutes).
 */

// Batch 3 will implement: decisionDensity (+ scoring helper).

export {};