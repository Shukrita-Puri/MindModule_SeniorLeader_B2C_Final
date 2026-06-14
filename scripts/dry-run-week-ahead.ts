/**
 * scripts/dry-run-week-ahead.ts — historical dry-run for the
 * Week-Ahead Picker Invite predicate.
 *
 * Walks back N weeks for a sample of users, reconstructs the inputs
 * (PTO / holiday / tomorrow / 14-day consecutive-off-days) from
 * primary_calendar_events as they would have appeared on each
 * candidate evening (Sun + any weekday following a PTO/holiday block),
 * runs `evaluateWeekAheadMode` + `shouldFireWeekAheadPickerInvite`,
 * and prints what would have fired — without touching APNs or
 * notification_log.
 *
 * Run with:
 *   deno run --allow-env --allow-net \
 *     --env-file=.env scripts/dry-run-week-ahead.ts \
 *     --weeks=6 --sample=25
 *
 * Output: one CSV line per (user, candidate_evening) with
 * fire/decision/reason/inputs. Pipe to a file for review.
 *
 * SAFETY: read-only. No mutations, no pushes, no notification_log
 * inserts. Suitable to run against production data.
 *
 * TIMEZONE NOTE: All date arithmetic is done in user-local time using
 * `profiles.timezone_offset`. The 14-day consecutive-off-day walk-back
 * uses local midnight per user. DST transitions inside the lookback
 * window are tolerated because the consecutive-off-day check is at
 * day-granularity, not minute-granularity.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  evaluateWeekAheadMode,
} from "../supabase/functions/_shared/plan/week-ahead-mode.ts";
import {
  shouldFireWeekAheadPickerInvite,
} from "../supabase/functions/_shared/plan/week-ahead-nudge.ts";
import {
  detectDayKindFromEvents,
} from "../supabase/functions/_shared/executive-state-taxonomy.ts";

const args = new Map(
  Deno.args
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v] = a.slice(2).split("=");
      return [k, v ?? "true"] as [string, string];
    }),
);
const WEEKS = Number(args.get("weeks") ?? "6");
const SAMPLE = Number(args.get("sample") ?? "25");

const url = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL");
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  Deno.exit(1);
}
const supabase = createClient(url, key);

console.log(`# dry-run weeks=${WEEKS} sample=${SAMPLE}`);
console.log(
  "user_id,candidate_date,dow,local_hour,fire,decision_reason,wam_active,wam_reason,pto_today,pto_tomorrow,holiday_today,tomorrow_workday,consecutive_off_before,travel_day",
);

// 1) Pick a sample of users that have any calendar data in the window.
const since = new Date(Date.now() - WEEKS * 7 * 24 * 3600 * 1000).toISOString();
const { data: profiles } = await supabase
  .from("profiles")
  .select("id, timezone_offset")
  .limit(SAMPLE);

for (const p of (profiles ?? [])) {
  const tzOffset = (p as { timezone_offset?: number }).timezone_offset ?? 0;
  const userId = (p as { id: string }).id;

  // Pull this user's events for the entire window once.
  const { data: events } = await supabase
    .from("primary_calendar_events")
    .select("title, start_time, end_time")
    .eq("user_id", userId)
    .gte("start_time", since)
    .order("start_time", { ascending: true });

  if (!events || events.length === 0) continue;

  // Bucket events by user-local date.
  const byDate = new Map<
    string,
    Array<{ title: string | null; start_time: string; end_time: string }>
  >();
  for (const e of events) {
    const local = new Date(
      new Date((e as { start_time: string }).start_time).getTime() +
        tzOffset * 60000,
    );
    const d = local.toISOString().slice(0, 10);
    const arr = byDate.get(d) || [];
    arr.push(e as { title: string | null; start_time: string; end_time: string });
    byDate.set(d, arr);
  }

  // Walk each day in the window. Candidate evenings = any day where
  // (a) dow=Sun, or (b) day has PTO/holiday markers, or (c) the day
  // before tomorrow's workday and ≥2 consecutive off-days lead in.
  for (let dOffset = WEEKS * 7; dOffset >= 1; dOffset--) {
    const candidate = new Date(Date.now() - dOffset * 24 * 3600 * 1000);
    const localCandidate = new Date(candidate.getTime() + tzOffset * 60000);
    const candidateStr = localCandidate.toISOString().slice(0, 10);
    const dow = localCandidate.getDay();
    const localHour = 17; // simulate 17:00 local (mid-window)

    const todayEvents = byDate.get(candidateStr) || [];
    const tomorrowDate = new Date(localCandidate);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = tomorrowDate.toISOString().slice(0, 10);
    const tomorrowEvents = byDate.get(tomorrowStr) || [];

    const today = detectDayKindFromEvents(todayEvents);
    const tomorrow = detectDayKindFromEvents(tomorrowEvents);
    const ptoTodayAllDay = today.kind === "ooo";
    const holidayTodayAllDay = today.kind === "away-day";
    const ptoTomorrowAllDay = tomorrow.kind === "ooo";
    const holidayTomorrowAllDay = tomorrow.kind === "away-day";
    const tomorrowDow = (dow + 1) % 7;
    const tomorrowIsWeekend = tomorrowDow === 0 || tomorrowDow === 6;
    const tomorrowIsWorkday =
      !ptoTomorrowAllDay && !holidayTomorrowAllDay && !tomorrowIsWeekend;

    // 14-day consecutive off-days walk-back (user-local).
    let consecutiveOffDaysBefore = 0;
    const cursor = new Date(localCandidate);
    for (let i = 0; i < 14; i++) {
      cursor.setDate(cursor.getDate() - 1);
      const dStr = cursor.toISOString().slice(0, 10);
      const cDow = cursor.getDay();
      const cEvents = byDate.get(dStr) || [];
      const kind = detectDayKindFromEvents(cEvents).kind;
      const isWeekend = cDow === 0 || cDow === 6;
      const offDay = kind === "ooo" || kind === "away-day" || isWeekend ||
        cEvents.length === 0;
      if (offDay) consecutiveOffDaysBefore++;
      else break;
    }
    const travelDay = today.kind === "travel-day";

    const wam = evaluateWeekAheadMode({
      dayOfWeek: dow,
      localHour,
      travelDay,
      fullWorkingWeekend: false,
      ptoTodayAllDay,
      ptoTomorrowAllDay,
      holidayAllDayEventToday: holidayTodayAllDay,
      tomorrowIsWorkday,
      consecutiveOffDaysBefore,
    });
    const decision = shouldFireWeekAheadPickerInvite({
      dayOfWeek: dow,
      localHour,
      weekAheadDecision: wam,
    });

    // Only print interesting rows: would-fire OR has any PTO/holiday/
    // long-weekend signal worth eyeballing.
    const interesting =
      decision.fire ||
      ptoTodayAllDay ||
      holidayTodayAllDay ||
      consecutiveOffDaysBefore >= 2;
    if (!interesting) continue;

    console.log(
      [
        userId,
        candidateStr,
        dow,
        localHour,
        decision.fire,
        decision.reason,
        wam.active,
        wam.reason ?? "",
        ptoTodayAllDay,
        ptoTomorrowAllDay,
        holidayTodayAllDay,
        tomorrowIsWorkday,
        consecutiveOffDaysBefore,
        travelDay,
      ].join(","),
    );
  }
}

console.log("# done");