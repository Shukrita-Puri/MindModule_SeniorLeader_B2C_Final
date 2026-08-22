/**
 * Wearable signal diagnostics
 * ───────────────────────────
 * Pure helper that explains, after the engine has run, why each Apple
 * Health-derived block on the "When You Perform Best" card is or is not
 * available. Counts are computed from the same raw inputs the engine uses
 * (wearable rows, calendar events, briefs, minute-level HR samples) and a
 * reason string is emitted per block. Reasons are sentinel values — keep
 * them stable; consumers (DB query, UI hint, tests) match on them.
 *
 * No gates are loosened. This module never alters payloads — it only
 * observes and reports.
 */

export type GateReason =
  | "ok"
  // sleep_to_peak
  | "no_sleep_score_rows"
  | "insufficient_sleep_days"
  | "no_prs_baseline"
  | "insufficient_next_day_prs"
  // rhr_recovery_window
  | "no_rhr_rows"
  | "insufficient_rhr_days"
  | "no_recovered_days_after_filter"
  | "bucket_below_min_occurrences"
  | "no_positive_lift"
  // hr_event_lift / category_lift
  | "no_hr_samples"
  | "no_resting_baseline"
  | "no_event_day_overlap"
  | "all_subtypes_below_min_occurrences"
  | "all_categories_below_min_occurrences";

export interface WearableSignalCounts {
  sleepScoreDays: number;
  rhrDays: number;
  hrvDays: number;
  hrSamplesDays: number;
  rhrRecoveredDays: number;
  eventDaysWithHr: number;
  rhrWindowBucketCounts: { morning: number; afternoon: number; evening: number };
}

export interface WearableDiagnostics {
  windowDays: number;
  engineVersion: number;
  counts: WearableSignalCounts;
  gateReasons: {
    sleep_to_peak: GateReason;
    rhr_recovery_window: GateReason;
    hr_event_lift: GateReason;
    category_lift: GateReason;
  };
  stressLoadEvents?: Array<{
    date: string;
    day: string;
    event: string;
    meanHr: number;
    baselineUsed: number;
    baselineSource: "14d" | "30d" | "window";
    delta: number;
    longBlock: boolean;
    sampleCount: number;
  }>;
}

export interface DiagnosticsInput {
  wearable: Array<{
    summary_date?: string | null;
    sleep_score?: number | null;
    resting_heart_rate?: number | null;
    hrv?: number | null;
  }>;
  events: Array<{ start_time?: string | null }>;
  briefs: Array<{ local_date?: string | null; time_window?: string | null; score?: number | null }>;
  hrSamplesByDay: Map<string, unknown[]>;
  windowBaseline: number | null;
  prsBaseline: number | null;
  performanceLift: {
    hr_event_lift: unknown[];
    category_lift: unknown[];
    sleep_to_peak: unknown | null;
    rhr_recovery_window: unknown | null;
  };
  stressLoadEvents?: DiagnosticsInput["stressLoadEvents"];
}

// Re-export under the old name so existing imports don't break during migration.
export type DiagnosticsInputStressLoadEvent = NonNullable<DiagnosticsInput["stressLoadEvents"]>[number];

export interface DiagnosticsOptions {
  windowDays: number;
  engineVersion: number;
  minOccurrencesEmerging: number;
}

const ymd = (iso: string): string => new Date(iso).toISOString().slice(0, 10);

export function buildWearableDiagnostics(
  input: DiagnosticsInput,
  opts: DiagnosticsOptions,
): WearableDiagnostics {
  const { wearable, events, briefs, hrSamplesByDay, windowBaseline, prsBaseline, performanceLift, stressLoadEvents } = input;
  const MIN = opts.minOccurrencesEmerging;

  // ── Raw counts ───────────────────────────────────────────────────────
  const sleepScoreDays = wearable.filter(
    (w) => typeof w.sleep_score === "number" && (w.sleep_score as number) > 0,
  ).length;
  const rhrDays = wearable.filter(
    (w) => typeof w.resting_heart_rate === "number" && (w.resting_heart_rate as number) > 0,
  ).length;
  const hrvDays = wearable.filter(
    (w) => typeof w.hrv === "number" && (w.hrv as number) > 0,
  ).length;
  const hrSamplesDays = hrSamplesByDay.size;

  // ── Recovered-day count + per-window bucket counts (mirrors engine) ─
  let rhrRecoveredDays = 0;
  const rhrWindowBucketCounts = { morning: 0, afternoon: 0, evening: 0 };
  const rhrVals = wearable
    .filter((w) => typeof w.resting_heart_rate === "number" && (w.resting_heart_rate as number) > 0)
    .map((w) => ({ date: w.summary_date as string, rhr: w.resting_heart_rate as number }));
  if (rhrVals.length >= 7) {
    const onlyRhr = rhrVals.map((r) => r.rhr);
    const m = onlyRhr.reduce((a, b) => a + b, 0) / onlyRhr.length;
    const std = Math.sqrt(onlyRhr.map((v) => (v - m) ** 2).reduce((a, b) => a + b, 0) / onlyRhr.length);
    const threshold = m - std;
    const recovered = rhrVals.filter((r) => r.rhr <= threshold);
    rhrRecoveredDays = recovered.length;
    const recoveredDates = new Set(recovered.map((r) => r.date));
    briefs.forEach((b) => {
      if (!b.local_date || !recoveredDates.has(b.local_date)) return;
      if (typeof b.score !== "number") return;
      const tw = b.time_window;
      if (tw === "morning" || tw === "afternoon" || tw === "evening") {
        rhrWindowBucketCounts[tw] += 1;
      }
    });
  }

  // ── Event-day overlap with minute HR samples ─────────────────────────
  let eventDaysWithHr = 0;
  const seenEventDays = new Set<string>();
  for (const e of events) {
    if (!e.start_time) continue;
    const key = ymd(e.start_time);
    if (seenEventDays.has(key)) continue;
    seenEventDays.add(key);
    if (hrSamplesByDay.has(key)) eventDaysWithHr += 1;
  }

  // ── Gate-reason determination ────────────────────────────────────────
  const sleepReason: GateReason = (() => {
    if (sleepScoreDays === 0) return "no_sleep_score_rows";
    if (sleepScoreDays < 7) return "insufficient_sleep_days";
    if (prsBaseline === null) return "no_prs_baseline";
    if (performanceLift.sleep_to_peak) return "ok";
    return "insufficient_next_day_prs";
  })();

  const rhrReason: GateReason = (() => {
    if (rhrDays === 0) return "no_rhr_rows";
    if (rhrDays < 7) return "insufficient_rhr_days";
    if (prsBaseline === null) return "no_prs_baseline";
    if (rhrRecoveredDays === 0) return "no_recovered_days_after_filter";
    const anyBucketOk =
      rhrWindowBucketCounts.morning >= MIN ||
      rhrWindowBucketCounts.afternoon >= MIN ||
      rhrWindowBucketCounts.evening >= MIN;
    if (!anyBucketOk) return "bucket_below_min_occurrences";
    if (performanceLift.rhr_recovery_window) return "ok";
    return "no_positive_lift";
  })();

  const hrLiftReason: GateReason = (() => {
    if (hrSamplesDays === 0) return "no_hr_samples";
    if (windowBaseline === null) return "no_resting_baseline";
    if (prsBaseline === null) return "no_prs_baseline";
    if (eventDaysWithHr === 0) return "no_event_day_overlap";
    if (performanceLift.hr_event_lift.length > 0) return "ok";
    return "all_subtypes_below_min_occurrences";
  })();

  const categoryReason: GateReason = (() => {
    if (hrLiftReason !== "ok") return hrLiftReason;
    if (performanceLift.category_lift.length > 0) return "ok";
    return "all_categories_below_min_occurrences";
  })();

  return {
    windowDays: opts.windowDays,
    engineVersion: opts.engineVersion,
    counts: {
      sleepScoreDays,
      rhrDays,
      hrvDays,
      hrSamplesDays,
      rhrRecoveredDays,
      eventDaysWithHr,
      rhrWindowBucketCounts,
    },
    gateReasons: {
      sleep_to_peak: sleepReason,
      rhr_recovery_window: rhrReason,
      hr_event_lift: hrLiftReason,
      category_lift: categoryReason,
    },
    stressLoadEvents,
  };
}

/**
 * Human-readable mapping for UI hints. Keep these short and data-honest.
 */
export const GATE_REASON_COPY: Record<GateReason, string> = {
  ok: "",
  no_sleep_score_rows: "Awaiting sleep score data from Apple Health.",
  insufficient_sleep_days: "Need at least 7 nights of sleep score to compute.",
  no_prs_baseline: "Awaiting more check-ins to establish a baseline.",
  insufficient_next_day_prs: "Awaiting more morning briefs after high-sleep nights.",
  no_rhr_rows: "Awaiting resting heart rate data from Apple Health.",
  insufficient_rhr_days: "Need at least 7 days of resting heart rate.",
  no_recovered_days_after_filter: "No well-recovered days detected in this window.",
  bucket_below_min_occurrences: "Recovered days exist but not enough briefs in any single window yet.",
  no_positive_lift: "Recovered days did not show a measurable lift this window.",
  no_hr_samples: "Awaiting minute-level heart rate from Apple Watch.",
  no_resting_baseline: "Awaiting more resting heart rate readings.",
  no_event_day_overlap: "Heart-rate data and calendar events have not overlapped yet.",
  all_subtypes_below_min_occurrences: "Not enough events per type to compute lift.",
  all_categories_below_min_occurrences: "Not enough events per category to compute lift.",
};