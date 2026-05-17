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

import type { BehaviourFlag, RuleContext } from "../brief-context.ts";

const DECISION_KEYWORD_RX =
  /\b(decision|approval|approve|review|sign[-\s]?off|go\s?\/?\s?no[-\s]?go|vote|budget|hiring|termination|firing|promotion|investment|commit|kick[-\s]?off|launch|close|offer)\b/i;
const DECISION_BOOST_RX =
  /\b(board|investor|exec|leadership|strategy)\b/i;

/**
 * Layer 1: title scoring.
 *   +1.0  decision keyword
 *   +0.5  boost keyword (on top of decision keyword)
 *   +0.3  committee size (attendees ≥ 6)
 *   +0.2  compressed (duration < 30min)
 */
export function titleDecisionScore(e: {
  title: string;
  attendeeCount?: number;
  durationMinutes?: number;
}): number {
  if (!DECISION_KEYWORD_RX.test(e.title)) return 0;
  let s = 1.0;
  if (DECISION_BOOST_RX.test(e.title)) s += 0.5;
  if ((e.attendeeCount ?? 0) >= 6) s += 0.3;
  if (typeof e.durationMinutes === "number" && e.durationMinutes < 30) s += 0.2;
  return s;
}

/**
 * Layer 2: attendee-aware multiplier.
 *   ≥6 attendees → 1.5  (committee — every voice multiplies cognitive load)
 *   ==2 attendees → 0.7 (1:1 ask — directional but lower density)
 *   unknown      → 1.0  (iOS-aggregated events have no attendee count;
 *                       do not penalise)
 */
export function attendeeWeight(attendeeCount?: number): number {
  if (typeof attendeeCount !== "number") return 1.0;
  if (attendeeCount >= 6) return 1.5;
  if (attendeeCount === 2) return 0.7;
  return 1.0;
}

/**
 * Layer 3: rolling 4h window sum. Returns `null` when no signal.
 * Thresholds: ≥4.0 high, ≥2.5 medium, else null.
 */
export function decisionDensity(ctx: RuleContext): BehaviourFlag | null {
  // Prefer pre-computed score from signal coverage when available; otherwise
  // derive from upcomingEvents in the next 4h.
  const precomputed = ctx.signals.decisionDensityScore ?? null;
  let score = precomputed;

  const contributing: string[] = [];
  if (score == null) {
    const window = ctx.upcomingEvents.filter(
      (e) => e.minutesUntil >= 0 && e.minutesUntil <= 240,
    );
    let s = 0;
    for (const e of window) {
      const layer1 = titleDecisionScore({
        title: e.title,
        attendeeCount: e.attendeeCount,
        durationMinutes: e.durationMinutes,
      });
      if (layer1 <= 0) continue;
      const weighted = layer1 * attendeeWeight(e.attendeeCount);
      s += weighted;
      if (contributing.length < 3) contributing.push(e.title);
    }
    score = Math.round(s * 10) / 10;
  }

  if (score == null || score < 2.5) return null;

  const severity = score >= 4.0 ? "high" : "medium";
  const evidence: string[] = [`decision density ${score}`];
  if (contributing.length) evidence.push(`across ${contributing.length} call(s)`);

  return {
    rule: "decisionDensity",
    severity,
    evidence,
    anchorEvent: contributing[0],
    stake: "Decision Power",
    copyHint:
      "name the cluster, not any single call — the cost is the switching between high-weight calls; prime focus once, then protect it; avoid invitations to 'just think it through'",
  };
}
