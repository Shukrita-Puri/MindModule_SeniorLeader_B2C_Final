// OWNERSHIP: engineering. Single source of truth for how the Brief speaks about
// time-to-event. Every surface that references an upcoming calendar event in
// deterministic copy must use these helpers — never hardcode "within 24 hours",
// "later today", or "soon".
//
// Chief-of-Staff register: precise when precision is useful (minutes / hours),
// coarse only when the event is genuinely far out.

/**
 * Bucketed, human phrase for "how long until this event".
 * Returns null when the event has passed, is unknown, or is beyond tomorrow —
 * callers then omit the timing clause entirely rather than inventing one.
 */
export function timeUntilPhrase(
  minutesUntil: number | null | undefined,
): string | null {
  if (typeof minutesUntil !== "number" || !Number.isFinite(minutesUntil)) {
    return null;
  }
  const m = Math.round(minutesUntil);
  if (m < -15) return null; // already well past
  if (m <= 5) return "starting now";
  if (m < 15) return "in under 15 minutes";
  if (m < 60) return `in ${Math.round(m / 5) * 5} minutes`;
  if (m < 90) return "in about an hour";
  if (m < 300) return `in about ${Math.round(m / 60)} hours`;
  if (m < 12 * 60) return "later today";
  if (m <= 24 * 60) return "tomorrow";
  return null;
}

/** `the board call in 45 minutes` — or the bare reference when timing is unknown. */
export function withTiming(
  reference: string,
  minutesUntil: number | null | undefined,
): string {
  const phrase = timeUntilPhrase(minutesUntil);
  return phrase ? `${reference} ${phrase}` : reference;
}
