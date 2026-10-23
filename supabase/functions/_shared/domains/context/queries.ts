// [KIND: queries] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Batched read query helper for the Context Assembler.
// Source: Part 2 Layer 2 (Section 1.1, Section 5).

import type { RawDatabaseContextBundle } from "./types.ts";
import type { WindowName } from "../window-mode/types.ts";

export interface SupabaseClientLike {
  from(table: string): {
    select(columns?: string): {
      eq(column: string, value: unknown): any;
      order?(column: string, options?: { ascending: boolean }): any;
      limit?(count: number): any;
      maybeSingle?(): Promise<{ data: any; error: any }>;
    };
  };
}

/**
 * Executes a single batched database read for all context raw inputs.
 * The context assembler is the ONLY reader of the database for the Context Bundle.
 */
export async function fetchContextRawData(
  supabase: SupabaseClientLike,
  userId: string,
  localDate: string,
  windowName: WindowName
): Promise<RawDatabaseContextBundle> {
  // Execute parallel queries in a single batched Promise.all
  const [
    profileRes,
    eventsRes,
    wearableRes,
    checkInsRes,
    snapshotRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle?.() ?? Promise.resolve({ data: null, error: null }),

    supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", userId),

    supabase
      .from("wearable_data")
      .select("*")
      .eq("user_id", userId)
      .order?.("created_at", { ascending: false })
      ?.limit?.(1)
      ?.maybeSingle?.() ?? Promise.resolve({ data: null, error: null }),

    supabase
      .from("daily_checkins")
      .select("*")
      .eq("user_id", userId),

    supabase
      .from("daily_context_snapshot")
      .select("*")
      .eq("user_id", userId)
      .eq("local_date", localDate)
      .maybeSingle?.() ?? Promise.resolve({ data: null, error: null }),
  ]);

  return {
    userId,
    localDate,
    windowName,
    profile: profileRes.data,
    calendarEvents: eventsRes.data ?? [],
    wearableReadings: wearableRes.data,
    checkIns: checkInsRes.data ?? [],
    previousWindowSnapshot: snapshotRes.data,
    hasWearable: wearableRes.data != null,
    hasCalendar: (eventsRes.data?.length ?? 0) > 0,
  };
}
