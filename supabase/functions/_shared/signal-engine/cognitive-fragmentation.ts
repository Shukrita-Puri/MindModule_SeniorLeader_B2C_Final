// MRS v2 — Cognitive fragmentation score.
//
// Pure helper: scores how chopped-up a calendar day is from the events
// alone. Two ingredients drive the score:
//
//   1. Back-to-back hours   — total wall-clock hours spent inside chains of
//      meetings separated by < 15 minutes (a chain = 2+ adjacent events
//      with sub-15-min gaps; the chain hours include each event's duration
//      plus the short gaps themselves).
//   2. Short-gap density    — share of adjacent-event gaps that are < 15
//      minutes. Captures "death by 12 transitions" days even when each
//      block is short.
//
// Score (0–100):
//   score = clamp( round( 12 * backToBackHours + 60 * shortGapRatio ), 0, 100 )
//
// Tuning anchors:
//   - 1h back-to-back stretch + no short gaps   → 12 (green)
//   - 3h back-to-back + 30% short gaps          → 36 + 18 = 54  (amber)
//   - 5h back-to-back + 60% short gaps          → 60 + 36 = 96  (red)
//
// Inputs come from the same `ClassifiedEventLite` shape used elsewhere in
// the signal engine — accepts loose objects so callers don't have to
// pre-classify. Events with bad times are skipped, not thrown on.

export interface FragmentationEvent {
  start_time: string | Date;
  end_time: string | Date;
}

export interface FragmentationResult {
  /** Total wall-clock hours inside back-to-back chains (< 15-min gaps). */
  back_to_back_hours: number;
  /** Count of adjacent-event gaps below 15 minutes. */
  short_gap_count: number;
  /** Total adjacent-event gaps considered (events − 1, after sort). */
  adjacent_gap_count: number;
  /** 0–100 composite score (higher = more fragmented). */
  fragmentation_score: number;
}

const SHORT_GAP_MIN = 15;

export function computeCognitiveFragmentation(
  events: FragmentationEvent[],
): FragmentationResult {
  const empty: FragmentationResult = {
    back_to_back_hours: 0,
    short_gap_count: 0,
    adjacent_gap_count: 0,
    fragmentation_score: 0,
  };
  if (!Array.isArray(events) || events.length === 0) return empty;

  // Parse + sort by start time. Skip rows with bad timestamps.
  type Slot = { start: number; end: number };
  const slots: Slot[] = [];
  for (const e of events) {
    const start = new Date(e.start_time).getTime();
    const end = new Date(e.end_time).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    slots.push({ start, end });
  }
  if (slots.length === 0) return empty;
  slots.sort((a, b) => a.start - b.start);

  // Walk adjacent pairs.
  let shortGapCount = 0;
  let backToBackMs = 0;
  let chainStartIdx: number | null = null;

  for (let i = 1; i < slots.length; i++) {
    const prev = slots[i - 1];
    const curr = slots[i];
    const gapMin = Math.max(0, (curr.start - prev.end) / 60000);
    if (gapMin < SHORT_GAP_MIN) {
      shortGapCount++;
      if (chainStartIdx == null) chainStartIdx = i - 1;
    } else if (chainStartIdx != null) {
      // Chain ended at slots[i-1]. Account for chain hours.
      backToBackMs += slots[i - 1].end - slots[chainStartIdx].start;
      chainStartIdx = null;
    }
  }
  if (chainStartIdx != null) {
    backToBackMs += slots[slots.length - 1].end - slots[chainStartIdx].start;
  }

  const backToBackHours = backToBackMs / 3_600_000;
  const adjacentGapCount = slots.length - 1;
  const shortGapRatio = adjacentGapCount > 0 ? shortGapCount / adjacentGapCount : 0;

  const raw = 12 * backToBackHours + 60 * shortGapRatio;
  const fragmentation_score = Math.max(0, Math.min(100, Math.round(raw)));

  return {
    back_to_back_hours: Math.round(backToBackHours * 10) / 10,
    short_gap_count: shortGapCount,
    adjacent_gap_count: adjacentGapCount,
    fragmentation_score,
  };
}