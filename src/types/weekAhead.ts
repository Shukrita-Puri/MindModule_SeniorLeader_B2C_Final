/**
 * weekAhead.ts — FE mirror of the edge function's `WeekAheadPriority`.
 *
 * Vite cannot import Deno-flavoured modules (`npm:` specifiers), so we
 * duplicate the struct here. Keep in sync with
 * `supabase/functions/_shared/events/priority-types.ts`.
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
  subcategoryId: string | null;
  /** Snapshot aliases written into weekly_plan_snapshots.priorities[]. */
  eventCategory?: string | null;
  eventSubcategory?: string | null;
  event_category?: string | null;
  event_subcategory?: string | null;
  event_title_display?: string;
  priorityRank?: number;
  priority_rank?: number;
}
