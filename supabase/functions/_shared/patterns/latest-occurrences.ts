/**
 * latest-occurrences.ts — supplies rule 2 ("up to date") of the shared pattern
 * gate with real data.
 *
 * The gate refuses a pattern whose `lastSeen` is older than the leader's most
 * recent PAST occurrence of that same event type: if a board meeting happened
 * after the engine last computed, the stored board pattern is out of date and
 * must not be quoted. There is no calendar window, no staleness ceiling and no
 * day limit — the judgement is purely "does the pattern include the latest
 * occurrence".
 *
 * Read-only. Uses the single A–H resolver. Any failure returns an empty map, so
 * the gate simply falls back to its other five rules and never throws.
 */

import { resolveEvent } from "../events/resolve-event-category.ts";

const WINDOW_DAYS = 365;

/** Map of pattern key ("A" or "A:board_meeting") → latest past occurrence date. */
export async function loadLatestOccurrenceKeys(
  supabase: {
    from: (t: string) => any;
  },
  userId: string,
  nowMs: number = Date.now(),
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const startIso = new Date(nowMs - WINDOW_DAYS * 86_400_000).toISOString();
    const nowIso = new Date(nowMs).toISOString();
    const { data } = await supabase
      .from("calendar_events")
      .select(
        "title, start_time, end_time, is_all_day, event_category, event_subcategory, category_resolved_by, category_confidence, attendees_count",
      )
      .eq("user_id", userId)
      .gte("start_time", startIso)
      .lt("start_time", nowIso);

    for (const row of ((data ?? []) as Array<Record<string, unknown>>)) {
      const startRaw = row?.start_time;
      const startMs = typeof startRaw === "string" ? Date.parse(startRaw) : NaN;
      if (!Number.isFinite(startMs)) continue;
      const date = new Date(startMs).toISOString().slice(0, 10);
      let categoryId: string | null = null;
      let subcategory: string | null = null;
      try {
        const r = resolveEvent(row);
        categoryId = r.categoryId ?? null;
        subcategory = r.subcategory ?? null;
      } catch {
        continue;
      }
      if (!categoryId) continue;
      for (
        const key of subcategory
          ? [categoryId, `${categoryId}:${subcategory}`]
          : [categoryId]
      ) {
        const prev = out.get(key);
        if (!prev || prev < date) out.set(key, date);
      }
    }
  } catch {
    return new Map();
  }
  return out;
}
