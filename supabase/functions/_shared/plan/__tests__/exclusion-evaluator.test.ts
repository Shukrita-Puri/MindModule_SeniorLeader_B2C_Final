// Deno test — 20 regression scenarios for the Week Ahead → Plan exclusion SSOT.
// Run with: deno test --allow-net supabase/functions/_shared/plan/__tests__/exclusion-evaluator.test.ts

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  evaluateEventPriorityExclusion,
  computeExclusionRevision,
  type MemoryRow,
  type ExclusionCandidate,
} from "../exclusion-evaluator.ts";
import { TITLE_SPECIFIC_MEMORY_CATEGORY } from "../event-priority-memory.ts";

const TZ = "America/Los_Angeles";

// Fixed reference dates (all local-day boundaries in TZ):
// Sunday 2026-07-19 (write day) → target week Mon 2026-07-20 .. Sun 2026-07-26.
const SUNDAY_ISO = "2026-07-19T22:00:00.000Z"; // ~Sun afternoon LA
const TUE_2026_07_21 = "2026-07-21";
const TUE_2026_07_28 = "2026-07-28"; // following week

function baseRow(overrides: Partial<MemoryRow>): MemoryRow {
  return {
    id: overrides.id ?? "row-" + Math.random().toString(36).slice(2, 9),
    event_category: overrides.event_category ?? "other",
    event_type_key: overrides.event_type_key ?? "1_day_liquid",
    signal: overrides.signal ?? "not_this_week",
    source: overrides.source ?? "week_ahead_picker",
    occurred_at: overrides.occurred_at ?? SUNDAY_ISO,
    scope: overrides.scope ?? null,
    effective_week_start: overrides.effective_week_start ?? null,
    effective_week_end: overrides.effective_week_end ?? null,
    timezone: overrides.timezone ?? null,
    resolved_event_id: overrides.resolved_event_id ?? null,
    identity_confidence: overrides.identity_confidence ?? null,
    meta: overrides.meta ?? {},
    event_id: overrides.event_id ?? null,
  };
}

function cand(overrides: Partial<ExclusionCandidate>): ExclusionCandidate {
  return {
    eventId: overrides.eventId ?? null,
    title: overrides.title ?? "1 day liquid fast",
    startTimeISO: overrides.startTimeISO ?? "2026-07-21T15:00:00.000Z",
    category: overrides.category ?? "other",
    typeKey: overrides.typeKey ?? "1_day_liquid",
  };
}

// ── Scenario 1: one-off exclusion honoured. ──
Deno.test("S1 target-week category exclusion drops the event in that week", () => {
  const row = baseRow({
    event_type_key: "1_day_liquid",
    scope: "target_week",
    effective_week_start: "2026-07-20",
    effective_week_end: "2026-07-26",
  });
  const r = evaluateEventPriorityExclusion({
    memoryRows: [row], candidate: cand({}), targetDate: TUE_2026_07_21, timezone: TZ,
  });
  assertEquals(r.excluded, true);
  assertEquals(r.scope, "category_week");
});

// ── Scenario 2: occurrence-specific with resolved_event_id ──
Deno.test("S2 occurrence-scoped exclusion targets a specific calendar UUID only", () => {
  const row = baseRow({
    resolved_event_id: "evt-A",
    scope: "target_week",
    effective_week_start: "2026-07-20",
    effective_week_end: "2026-07-26",
    event_type_key: "1on1", event_category: "meeting",
  });
  const excluded = evaluateEventPriorityExclusion({
    memoryRows: [row], candidate: cand({ eventId: "evt-A", typeKey: "1on1", category: "meeting" }),
    targetDate: TUE_2026_07_21, timezone: TZ,
  });
  const other = evaluateEventPriorityExclusion({
    memoryRows: [row], candidate: cand({ eventId: "evt-B", typeKey: "1on1", category: "meeting" }),
    targetDate: TUE_2026_07_21, timezone: TZ,
  });
  assertEquals(excluded.excluded, true);
  assertEquals(excluded.scope, "occurrence");
  // A different UUID with the same key falls through to category-week check;
  // since this row has resolved_event_id set, category-week does not match.
  assertEquals(other.excluded, false);
});

// ── Scenario 3: calendar resync new event still excluded via category ──
Deno.test("S3 category-week exclusion still applies after calendar resync", () => {
  const row = baseRow({
    event_category: "meeting", event_type_key: "status_update",
    scope: "target_week", effective_week_start: "2026-07-20", effective_week_end: "2026-07-26",
  });
  const r = evaluateEventPriorityExclusion({
    memoryRows: [row], candidate: cand({ category: "meeting", typeKey: "status_update" }),
    targetDate: TUE_2026_07_21, timezone: TZ,
  });
  assertEquals(r.excluded, true);
});

// ── Scenario 4: week-ahead regeneration filters this week ──
Deno.test("S4 within-week filter honoured; before-week candidate not filtered", () => {
  const row = baseRow({
    scope: "target_week", effective_week_start: "2026-07-20", effective_week_end: "2026-07-26",
  });
  const inWeek = evaluateEventPriorityExclusion({
    memoryRows: [row], candidate: cand({}), targetDate: TUE_2026_07_21, timezone: TZ,
  });
  const beforeWeek = evaluateEventPriorityExclusion({
    memoryRows: [row], candidate: cand({}), targetDate: "2026-07-19", timezone: TZ,
  });
  assertEquals(inWeek.excluded, true);
  assertEquals(beforeWeek.excluded, false);
});

// ── Scenario 5: manual refresh path — signature changes when rev changes ──
Deno.test("S5 exclusion revision hash changes when a new signal is added", async () => {
  const r1 = baseRow({ scope: "target_week", effective_week_start: "2026-07-20", effective_week_end: "2026-07-26" });
  const beforeHash = await computeExclusionRevision([r1], TUE_2026_07_21, TZ);
  const r2 = baseRow({ id: "row-b", event_type_key: "board_prep", scope: "target_week", effective_week_start: "2026-07-20", effective_week_end: "2026-07-26" });
  const afterHash = await computeExclusionRevision([r1, r2], TUE_2026_07_21, TZ);
  if (beforeHash === afterHash) throw new Error("revision hash did not change on new signal");
});

// ── Scenario 6: forced LLM fallback — helper's contract is prompt-independent ──
Deno.test("S6 evaluator returns the reason enum needed by prompt guards", () => {
  const row = baseRow({
    scope: "target_week", effective_week_start: "2026-07-20", effective_week_end: "2026-07-26",
  });
  const r = evaluateEventPriorityExclusion({
    memoryRows: [row], candidate: cand({}), targetDate: TUE_2026_07_21, timezone: TZ,
  });
  assertEquals(r.reason, "user_deprioritised_target_week");
});

// ── Scenario 7: restore supersedes exclusion in-window ──
Deno.test("S7 category priority restore later than the not_this_week clears exclusion", () => {
  const exclusion = baseRow({
    id: "row-a",
    scope: "target_week", effective_week_start: "2026-07-20", effective_week_end: "2026-07-26",
    occurred_at: "2026-07-19T22:00:00.000Z",
  });
  const restore = baseRow({
    id: "row-b", signal: "priority", source: "priority_tag",
    occurred_at: "2026-07-20T09:00:00.000Z",
  });
  const r = evaluateEventPriorityExclusion({
    memoryRows: [exclusion, restore], candidate: cand({}), targetDate: TUE_2026_07_21, timezone: TZ,
  });
  assertEquals(r.excluded, false);
});

// ── Scenario 8: timezone/week boundary — Sunday LA still resolves next week ──
Deno.test("S8 legacy Sunday week_ahead_picker row applies to the following Mon–Sun", () => {
  const legacy = baseRow({
    id: "legacy-a",
    scope: null, effective_week_start: null, effective_week_end: null,
    occurred_at: SUNDAY_ISO,
  });
  const inWeek = evaluateEventPriorityExclusion({
    memoryRows: [legacy], candidate: cand({}), targetDate: TUE_2026_07_21, timezone: TZ,
  });
  assertEquals(inWeek.excluded, true);
  assertEquals(inWeek.effectiveWeekStart, "2026-07-20");
  assertEquals(inWeek.effectiveWeekEnd, "2026-07-26");
});

// ── Scenario 9: older-snapshot-cannot-overwrite (revision changes deterministically) ──
Deno.test("S9 hash is stable for identical inputs across runs", async () => {
  const rows = [baseRow({
    id: "row-a", scope: "target_week", effective_week_start: "2026-07-20", effective_week_end: "2026-07-26",
  })];
  const h1 = await computeExclusionRevision(rows, TUE_2026_07_21, TZ);
  const h2 = await computeExclusionRevision(rows, TUE_2026_07_21, TZ);
  assertEquals(h1, h2);
});

// ── Scenario 10: unrelated events keep working ──
Deno.test("S10 unrelated (category, type_key) candidate is not excluded", () => {
  const row = baseRow({
    event_category: "meeting", event_type_key: "board_prep",
    scope: "target_week", effective_week_start: "2026-07-20", effective_week_end: "2026-07-26",
  });
  const r = evaluateEventPriorityExclusion({
    memoryRows: [row], candidate: cand({ category: "other", typeKey: "1_day_liquid" }),
    targetDate: TUE_2026_07_21, timezone: TZ,
  });
  assertEquals(r.excluded, false);
});

// ── Scenario 11: Sunday not_this_week excludes upcoming Mon–Sun ──
Deno.test("S11 Sunday-written signal excludes Tue in upcoming week (repro of shukrita bug)", () => {
  const row = baseRow({
    scope: "target_week", effective_week_start: "2026-07-20", effective_week_end: "2026-07-26",
    occurred_at: SUNDAY_ISO,
  });
  const r = evaluateEventPriorityExclusion({
    memoryRows: [row], candidate: cand({}), targetDate: TUE_2026_07_21, timezone: TZ,
  });
  assertEquals(r.excluded, true);
});

// ── Scenario 12: does not spill into the next week ──
Deno.test("S12 same signal does NOT exclude the same event in the following week", () => {
  const row = baseRow({
    scope: "target_week", effective_week_start: "2026-07-20", effective_week_end: "2026-07-26",
  });
  const r = evaluateEventPriorityExclusion({
    memoryRows: [row], candidate: cand({}), targetDate: TUE_2026_07_28, timezone: TZ,
  });
  assertEquals(r.excluded, false);
});

// ── Scenario 13: midweek write uses explicit target week ──
Deno.test("S13 midweek write with explicit target week beats occurred_at heuristic", () => {
  // Row written on Wed 2026-07-22 but explicitly targets NEXT week.
  const row = baseRow({
    scope: "target_week",
    effective_week_start: "2026-07-27",
    effective_week_end: "2026-08-02",
    occurred_at: "2026-07-22T18:00:00.000Z",
  });
  const inNextWeek = evaluateEventPriorityExclusion({
    memoryRows: [row], candidate: cand({}), targetDate: "2026-07-29", timezone: TZ,
  });
  const inCurrentWeek = evaluateEventPriorityExclusion({
    memoryRows: [row], candidate: cand({}), targetDate: "2026-07-22", timezone: TZ,
  });
  assertEquals(inNextWeek.excluded, true);
  assertEquals(inCurrentWeek.excluded, false); // explicit scope wins
});

// ── Scenario 14: identity resolution by start+duration (evaluator side check) ──
Deno.test("S14 occurrence exclusion does not affect a same-title different-UUID event", () => {
  const row = baseRow({
    resolved_event_id: "evt-morning",
    scope: "target_week", effective_week_start: "2026-07-20", effective_week_end: "2026-07-26",
    event_type_key: "1on1", event_category: "meeting",
  });
  const rMorning = evaluateEventPriorityExclusion({
    memoryRows: [row], candidate: cand({ eventId: "evt-morning", typeKey: "1on1", category: "meeting" }),
    targetDate: TUE_2026_07_21, timezone: TZ,
  });
  const rAfternoon = evaluateEventPriorityExclusion({
    memoryRows: [row], candidate: cand({ eventId: "evt-afternoon", typeKey: "1on1", category: "meeting" }),
    targetDate: TUE_2026_07_21, timezone: TZ,
  });
  assertEquals(rMorning.excluded, true);
  assertEquals(rAfternoon.excluded, false);
});

// ── Scenario 15: ambiguous canonical → identity_confidence should be recorded, not an arbitrary UUID ──
Deno.test("S15 ambiguous identity: memory row without resolved_event_id still excludes at category level", () => {
  const row = baseRow({
    identity_confidence: "ambiguous",
    scope: "target_week", effective_week_start: "2026-07-20", effective_week_end: "2026-07-26",
    meta: { resolutionDiagnostic: "multiple_matches" },
  });
  const r = evaluateEventPriorityExclusion({
    memoryRows: [row], candidate: cand({}), targetDate: TUE_2026_07_21, timezone: TZ,
  });
  assertEquals(r.excluded, true);
  assertEquals(r.scope, "category_week");
});

// ── Scenario 16: occurrence restore does NOT clear permanent ──
Deno.test("S16 occurrence priority does not clear a permanent (never) row", () => {
  const never = baseRow({
    id: "row-never", signal: "never", scope: "permanent",
    event_category: "meeting", event_type_key: "1on1",
  });
  const restore = baseRow({
    id: "row-restore", signal: "priority", source: "priority_tag",
    resolved_event_id: "evt-A", occurred_at: "2026-07-20T09:00:00.000Z",
    event_category: "meeting", event_type_key: "1on1",
  });
  const r = evaluateEventPriorityExclusion({
    memoryRows: [never, restore],
    candidate: cand({ eventId: "evt-A", category: "meeting", typeKey: "1on1" }),
    targetDate: TUE_2026_07_21, timezone: TZ,
  });
  assertEquals(r.excluded, true);
  assertEquals(r.scope, "permanent");
});

// ── Scenario 17: category restore does not accidentally restore an unrelated occurrence ──
Deno.test("S17 category-level priority does not clear an unrelated occurrence exclusion", () => {
  const excludeA = baseRow({
    id: "row-a", resolved_event_id: "evt-A",
    scope: "target_week", effective_week_start: "2026-07-20", effective_week_end: "2026-07-26",
    event_category: "meeting", event_type_key: "1on1",
  });
  const restoreOther = baseRow({
    id: "row-r", signal: "priority", source: "priority_tag",
    event_category: "meeting", event_type_key: "board_prep",
    occurred_at: "2026-07-20T09:00:00.000Z",
  });
  const r = evaluateEventPriorityExclusion({
    memoryRows: [excludeA, restoreOther],
    candidate: cand({ eventId: "evt-A", category: "meeting", typeKey: "1on1" }),
    targetDate: TUE_2026_07_21, timezone: TZ,
  });
  assertEquals(r.excluded, true);
});

// ── Scenario 18: revision hash isolates per-user rows (isolation test) ──
Deno.test("S18 revision hash differs when a user has a different memory set", async () => {
  const userA = [baseRow({ id: "a1", scope: "target_week", effective_week_start: "2026-07-20", effective_week_end: "2026-07-26" })];
  const userB = [baseRow({ id: "b1", event_type_key: "board_prep", scope: "target_week", effective_week_start: "2026-07-20", effective_week_end: "2026-07-26" })];
  const hA = await computeExclusionRevision(userA, TUE_2026_07_21, TZ);
  const hB = await computeExclusionRevision(userB, TUE_2026_07_21, TZ);
  if (hA === hB) throw new Error("hashes must differ across users' memory rows");
});

// ── Scenario 19: LLM/deterministic guard: consumers use evaluator's excluded=true ──
Deno.test("S19 evaluator returns matchedIdentity for downstream reason emission", () => {
  const row = baseRow({
    resolved_event_id: "evt-A",
    scope: "target_week", effective_week_start: "2026-07-20", effective_week_end: "2026-07-26",
  });
  const r = evaluateEventPriorityExclusion({
    memoryRows: [row], candidate: cand({ eventId: "evt-A" }), targetDate: TUE_2026_07_21, timezone: TZ,
  });
  assertEquals(r.matchedIdentity, "resolved_event");
});

// ── Scenario 20: end-to-end repro of shukrita@mindmodule.me ──
Deno.test("S20 shukrita repro — Sunday 2026-07-19 write excludes Tuesday 2026-07-21", () => {
  // Reproduce the exact DB state described in the audit.
  const row = baseRow({
    id: "actual-row",
    event_category: "other",
    event_type_key: "1_day_liquid",
    signal: "not_this_week",
    source: "week_ahead_picker",
    scope: "target_week",
    effective_week_start: "2026-07-20",
    effective_week_end: "2026-07-26",
    occurred_at: "2026-07-19T15:00:00.000Z",
    timezone: TZ,
    meta: { clientCanonicalId: "canonical:1 day liquid fast|1784674800000|144" },
  });
  const r = evaluateEventPriorityExclusion({
    memoryRows: [row],
    candidate: cand({
      category: "other", typeKey: "1_day_liquid",
      title: "1 day liquid fast", startTimeISO: "2026-07-21T15:00:00.000Z",
    }),
    targetDate: "2026-07-21",
    timezone: TZ,
  });
  assertEquals(r.excluded, true);
  assertEquals(r.reason, "user_deprioritised_target_week");
});

// Sanity: title-specific `never` also fires.
Deno.test("Sextra title-specific never applies to matching title", () => {
  const row = baseRow({
    signal: "never", scope: "permanent",
    event_category: TITLE_SPECIFIC_MEMORY_CATEGORY, event_type_key: "1_day_liquid_fast",
  });
  const r = evaluateEventPriorityExclusion({
    memoryRows: [row], candidate: cand({}), targetDate: TUE_2026_07_21, timezone: TZ,
  });
  assertEquals(r.excluded, true);
});