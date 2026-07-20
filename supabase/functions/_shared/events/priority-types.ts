/**
 * priority-types.ts — shared shape for Week Ahead priority items.
 *
 * Single canonical struct used by both the edge function
 * (`list-week-ahead-priorities`) and, mirrored as plain TS, by the
 * frontend (`src/types/weekAhead.ts`). Keep the two in sync.
 */

export type WeekAheadTag =
  | "prior_priority"
  | "pattern_based"
  | "known_relationship"
  | "high_stakes"
  | "historically_low_signal";

export type PriorSignal = "priority" | "not_this_week" | "never";

export interface WeekAheadPriority {
  eventId: string;
  title: string;
  startTime: string;
  endTime: string;
  localDay: string;
  period: string;
  category: string;
  typeKey: string;
  stakesLevel: string | null;
  score: number;
  scoreReasons: string[];
  tags: WeekAheadTag[];
  isOrganizer: boolean | null;
  priorSignal: PriorSignal | null;
  /** WS-A · A–H taxonomy subcategory. Prefers the value persisted on the
   *  most recent `event_priority_memory` row for this event; falls back to
   *  `enrichEvent(title).subcategory`. `null` when neither yields a value. */
  subcategoryId: string | null;
}