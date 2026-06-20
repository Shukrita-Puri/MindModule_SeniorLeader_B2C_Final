/**
 * event-priority-memory.ts — read + scoring helpers for the
 * `event_priority_memory` table. Used by both `list-week-ahead-priorities`
 * and `generate-mastery-plan` to bias ranking toward what each user has
 * historically marked as a real priority (and away from rejected categories).
 *
 * SSOT: docs/GENERATE_MASTERY_PLAN_SSOT.md §17.3 / §17.5.
 */

// deno-lint-ignore-file no-explicit-any

export type PriorityMemorySignal =
  | "priority"
  | "not_this_week"
  | "never"
  | "cancelled_now"
  | "cancelled_as_noise"
  | "cancelled_keep_surfacing";

export interface PriorityMemoryRow {
  event_category: string;
  event_type_key: string;
  signal: PriorityMemorySignal;
  occurred_at: string; // ISO
}

export interface PriorityMemoryIndex {
  rowsByKey: Map<string, PriorityMemoryRow[]>;
}

const KEY = (category: string, typeKey: string) =>
  `${(category || "").toLowerCase()}::${(typeKey || "").toLowerCase()}`;

/** Build an in-memory lookup keyed by (category, type_key). */
export function indexPriorityMemory(rows: PriorityMemoryRow[]): PriorityMemoryIndex {
  const map = new Map<string, PriorityMemoryRow[]>();
  for (const r of rows ?? []) {
    const k = KEY(r.event_category, r.event_type_key);
    const bucket = map.get(k);
    if (bucket) bucket.push(r);
    else map.set(k, [r]);
  }
  return { rowsByKey: map };
}

export interface MemoryBoostResult {
  /** Net delta to add to the candidate's score (clamped to [-50, +30]). */
  delta: number;
  /** Set to true when a 'never' signal exists — caller MUST drop candidate. */
  hardDemote: boolean;
  /** Human-readable reasons safe to surface in `scoreReasons[]`. */
  reasons: string[];
}

/**
 * Compute the memory boost for a single event candidate.
 * Decay windows are conservative — the goal is "learn quickly, forget gracefully".
 */
export function applyEventPriorityMemory(
  index: PriorityMemoryIndex,
  args: { eventCategory: string; eventTypeKey: string; now?: Date },
): MemoryBoostResult {
  const now = args.now ?? new Date();
  const rows = index.rowsByKey.get(KEY(args.eventCategory, args.eventTypeKey)) ?? [];
  if (rows.length === 0) return { delta: 0, hardDemote: false, reasons: [] };

  let delta = 0;
  let hardDemote = false;
  const reasons: string[] = [];

  let priorityCount = 0;
  let notThisWeekCount = 0;
  let cancelledAsNoiseCount = 0;
  let cancelledKeepCount = 0;

  for (const r of rows) {
    const ageDays = (now.getTime() - new Date(r.occurred_at).getTime()) / (1000 * 60 * 60 * 24);

    if (r.signal === "never") {
      hardDemote = true;
      delta -= 40;
      continue;
    }
    if (r.signal === "cancelled_now" && ageDays <= 7) {
      delta -= 8;
      continue;
    }
    if (r.signal === "priority" && ageDays <= 60) {
      delta += 10;
      priorityCount++;
    } else if (r.signal === "cancelled_keep_surfacing" && ageDays <= 60) {
      delta += 5;
      cancelledKeepCount++;
    } else if (r.signal === "not_this_week" && ageDays <= 14) {
      delta -= 15;
      notThisWeekCount++;
    } else if (r.signal === "cancelled_as_noise" && ageDays <= 60) {
      delta -= 25;
      cancelledAsNoiseCount++;
    }
  }

  if (priorityCount > 0) reasons.push(`prior priority ×${priorityCount}`);
  if (cancelledKeepCount > 0) reasons.push(`previously paused but kept`);
  if (notThisWeekCount > 0) reasons.push(`deprioritised this week`);
  if (cancelledAsNoiseCount > 0) reasons.push(`historically low-signal`);
  if (hardDemote) reasons.push(`marked never-important`);

  // Clamp to keep ranking sane.
  if (delta > 30) delta = 30;
  if (delta < -50) delta = -50;

  return { delta, hardDemote, reasons };
}

/** Fetch + index memory rows for a user. Uses a service-role supabase client. */
export async function loadPriorityMemoryForUser(
  supabase: any,
  userId: string,
  lookbackDays = 90,
): Promise<PriorityMemoryIndex> {
  try {
    const since = new Date(Date.now() - lookbackDays * 86400_000).toISOString();
    const { data, error } = await supabase
      .from("event_priority_memory")
      .select("event_category, event_type_key, signal, occurred_at")
      .eq("user_id", userId)
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(500);
    if (error) {
      console.warn("[event-priority-memory] load failed", error.message);
      return indexPriorityMemory([]);
    }
    return indexPriorityMemory((data ?? []) as PriorityMemoryRow[]);
  } catch (e) {
    console.warn("[event-priority-memory] load threw", (e as Error).message);
    return indexPriorityMemory([]);
  }
}
