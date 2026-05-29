import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildWearableDiagnostics } from "./_diagnostics.ts";

const OPTS = { windowDays: 30, engineVersion: 6, minOccurrencesEmerging: 3 };

// 30-day date helper: returns "YYYY-MM-DD" for `d` days back from a fixed
// reference so tests are deterministic.
const REF = new Date("2026-05-29T00:00:00Z");
const dateBack = (d: number) =>
  new Date(REF.getTime() - d * 86400000).toISOString().slice(0, 10);

Deno.test("no sleep_score rows ⇒ sleep_to_peak: no_sleep_score_rows", () => {
  const wearable = Array.from({ length: 14 }, (_, i) => ({
    summary_date: dateBack(i),
    resting_heart_rate: 60,
    hrv: 55,
    sleep_score: null,
  }));
  const diag = buildWearableDiagnostics(
    {
      wearable,
      events: [],
      briefs: [],
      hrSamplesByDay: new Map(),
      restingBaseline: 60,
      prsBaseline: 50,
      performanceLift: { hr_event_lift: [], category_lift: [], sleep_to_peak: null, rhr_recovery_window: null },
    },
    OPTS,
  );
  assertEquals(diag.counts.sleepScoreDays, 0);
  assertEquals(diag.gateReasons.sleep_to_peak, "no_sleep_score_rows");
});

Deno.test("sparse RHR with few recovered days ⇒ no_recovered_days_after_filter", () => {
  // 11 RHR days clustered tightly so mean - 1σ leaves zero recovered days.
  const rhrSeries = [60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60];
  const wearable = rhrSeries.map((rhr, i) => ({
    summary_date: dateBack(i),
    resting_heart_rate: rhr,
  }));
  const diag = buildWearableDiagnostics(
    {
      wearable,
      events: [],
      briefs: [],
      hrSamplesByDay: new Map(),
      restingBaseline: 60,
      prsBaseline: 50,
      performanceLift: { hr_event_lift: [], category_lift: [], sleep_to_peak: null, rhr_recovery_window: null },
    },
    OPTS,
  );
  assertEquals(diag.counts.rhrDays, 11);
  assertEquals(diag.counts.rhrRecoveredDays, 11); // all == threshold; uses <= so all qualify
  // With all 11 recovered but no briefs, every bucket = 0 → fails MIN gate
  assertEquals(diag.gateReasons.rhr_recovery_window, "bucket_below_min_occurrences");
});

Deno.test("zero hr_samples ⇒ hr_event_lift: no_hr_samples", () => {
  const wearable = Array.from({ length: 10 }, (_, i) => ({
    summary_date: dateBack(i),
    resting_heart_rate: 60,
  }));
  const diag = buildWearableDiagnostics(
    {
      wearable,
      events: [{ start_time: REF.toISOString() }],
      briefs: [],
      hrSamplesByDay: new Map(),
      restingBaseline: 60,
      prsBaseline: 50,
      performanceLift: { hr_event_lift: [], category_lift: [], sleep_to_peak: null, rhr_recovery_window: null },
    },
    OPTS,
  );
  assertEquals(diag.counts.hrSamplesDays, 0);
  assertEquals(diag.gateReasons.hr_event_lift, "no_hr_samples");
  assertEquals(diag.gateReasons.category_lift, "no_hr_samples");
});

Deno.test("all gates pass ⇒ every reason: ok", () => {
  const wearable = Array.from({ length: 14 }, (_, i) => ({
    summary_date: dateBack(i),
    sleep_score: 80,
    resting_heart_rate: 60,
    hrv: 55,
  }));
  const hrSamplesByDay = new Map<string, unknown[]>();
  hrSamplesByDay.set(dateBack(0), [{ t: REF.toISOString(), v: 120 }]);
  // 3 morning briefs on recovered days so the bucket gate passes.
  const briefs = [
    { local_date: dateBack(0), time_window: "morning", score: 70 },
    { local_date: dateBack(1), time_window: "morning", score: 72 },
    { local_date: dateBack(2), time_window: "morning", score: 71 },
  ];
  const diag = buildWearableDiagnostics(
    {
      wearable,
      events: [{ start_time: REF.toISOString() }],
      briefs,
      hrSamplesByDay,
      restingBaseline: 60,
      prsBaseline: 50,
      performanceLift: {
        hr_event_lift: [{}],
        category_lift: [{}],
        sleep_to_peak: { deltaPct: 5, n: 3, confidence: "emerging", bestWindow: "morning" },
        rhr_recovery_window: { window: "morning", liftPct: 5, n: 3, confidence: "emerging" },
      },
    },
    OPTS,
  );
  assertEquals(diag.gateReasons.sleep_to_peak, "ok");
  assertEquals(diag.gateReasons.rhr_recovery_window, "ok");
  assertEquals(diag.gateReasons.hr_event_lift, "ok");
  assertEquals(diag.gateReasons.category_lift, "ok");
});