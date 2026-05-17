// End-to-end validation for the Conference / Summit cluster (v2).
// Exercises: brief-signal-coverage.ts (signal builder) → behaviour-evaluator
// (rule fan-out) → expected flag set per surface (brief / plan / nudge).

import { assertEquals, assert, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSignalMatrix, type SignalCoverageInput } from "./brief-signal-coverage.ts";
import { evaluate } from "./behaviour-evaluator.ts";
import type { RuleContext, SignalMatrix } from "./brief-context.ts";

function at(h: number, m = 0, d = "2026-05-18"): Date {
  return new Date(`${d}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
}

function baseInput(over: Partial<SignalCoverageInput> = {}): SignalCoverageInput {
  return {
    wearable: null,
    checkIn: null,
    scoreToday: null,
    scoreYesterday: null,
    timezone: { offsetMinutes: 0, shift48hHours: 0 },
    events: [],
    now: at(9),
    ...over,
  };
}

function makeCtx(input: SignalCoverageInput, signalsOver: Partial<SignalMatrix> = {}, localHour?: number): RuleContext {
  const signals = { ...buildSignalMatrix(input), ...signalsOver };
  return {
    signals,
    upcomingEvents: input.events
      .map((e) => ({
        title: e.title,
        minutesUntil: Math.round(
          ((typeof e.startTime === "string" ? new Date(e.startTime).getTime() : e.startTime.getTime()) - input.now.getTime()) / 60000,
        ),
        stakesLevel: e.stakesLevel ?? null,
      }))
      .filter((e) => e.minutesUntil >= 0),
    localHour: localHour ?? input.now.getUTCHours(),
  };
}

function rules(flags: { rule: string }[]): string[] {
  return flags.map((f) => f.rule);
}

// ─── 1. Day 1 attend-only summit (full-day wrapper, no speaking) ─────────────

Deno.test("E2E · Day-1 attend-only summit: low-severity attend rule on all surfaces", () => {
  const input = baseInput({
    events: [{
      title: "TechCrunch Conference 2026",
      startTime: at(8),
      endTime: at(18),
      isAllDay: true,
    }],
    now: at(9),
  });
  const ctx = makeCtx(input);
  assertEquals(ctx.signals.conferenceDayNumber, 1);
  assert(ctx.signals.hasFullDayConferenceWrapper);

  const briefFlags = evaluate(ctx, { scope: "brief" });
  const planFlags  = evaluate(ctx, { scope: "plan"  });
  const nudgeFlags = evaluate(ctx, { scope: "nudge" });

  for (const f of [briefFlags, planFlags, nudgeFlags]) {
    const attend = f.find((x) => x.rule === "conferenceDayAttend");
    assert(attend, "conferenceDayAttend should fire on all surfaces");
    assertEquals(attend!.severity, "low");
  }
  assertFalse(briefFlags.some((f) => f.rule === "conferenceDayWithSpeaking"));
  assertFalse(briefFlags.some((f) => f.rule === "dropInSpeakingHighStakes"));
});

// ─── 2. Day 2 attend+speaking: high severity, speaking wins, mid-session nudge-only ──

Deno.test("E2E · Day-2 attend+speaking with mid-session gap: speaking rule wins, reset is nudge-only", () => {
  const input = baseInput({
    events: [
      { title: "Web Summit 2026", startTime: at(8), endTime: at(18), isAllDay: true },
      { title: "Panel: AI Leadership", startTime: at(10), endTime: at(11) },
      { title: "Fireside chat with founder", startTime: at(14), endTime: at(15) },
    ],
    trailingEvents: [{
      title: "Web Summit 2026", startTime: at(8, 0, "2026-05-17"), endTime: at(18, 0, "2026-05-17"),
      isAllDay: true, daysAgo: 1,
    }],
    now: at(9),
  });
  const ctx = makeCtx(input);
  assertEquals(ctx.signals.conferenceDayNumber, 2);
  assertEquals(ctx.signals.speakingBlocksToday!.length, 2);
  assertEquals(ctx.signals.firstSessionGapMinutesToday, 180);

  const brief = evaluate(ctx, { scope: "brief" });
  const plan  = evaluate(ctx, { scope: "plan"  });
  const nudge = evaluate(ctx, { scope: "nudge" });

  // speaking suppresses attend
  assert(brief.find((f) => f.rule === "conferenceDayWithSpeaking" && f.severity === "high"));
  assertFalse(brief.some((f) => f.rule === "conferenceDayAttend"));
  // mid-session reset is NUDGE-only
  assertFalse(brief.some((f) => f.rule === "conferenceMidSessionReset"));
  assertFalse(plan.some((f) => f.rule === "conferenceMidSessionReset"));
  assert(nudge.find((f) => f.rule === "conferenceMidSessionReset"));
  // ordering: high comes first
  assertEquals(brief[0].severity, "high");
});

// ─── 3. Drop-in speaking, no wrapper ───────────────────────────────────────────

Deno.test("E2E · Drop-in keynote with no conference wrapper: high-stakes proximity rule fires alone", () => {
  const input = baseInput({
    events: [
      { title: "Standup", startTime: at(9), endTime: at(9, 30) },
      { title: "Keynote at Founders Forum", startTime: at(14), endTime: at(14, 45) },
    ],
    now: at(9),
  });
  const ctx = makeCtx(input);
  assertFalse(ctx.signals.hasFullDayConferenceWrapper === true);
  assertEquals(ctx.signals.speakingBlocksToday!.length, 1);

  const all = evaluate(ctx);
  const ruleSet = new Set(rules(all));
  assert(ruleSet.has("dropInSpeakingHighStakes"));
  assertFalse(ruleSet.has("conferenceDayAttend"));
  assertFalse(ruleSet.has("conferenceDayWithSpeaking"));
});

// ─── 4. Travel-bridged night before summit ─────────────────────────────────────

Deno.test("E2E · Travel today + summit tomorrow: nightBeforeSummit escalates to high in evening", () => {
  const input = baseInput({
    events: [{ title: "Flight to Lisbon", startTime: at(14), endTime: at(18) }],
    tomorrowEvents: [{
      title: "Web Summit 2026 — Day 1",
      startTime: at(9, 0, "2026-05-19"),
      endTime: at(18, 0, "2026-05-19"),
      isAllDay: true,
    }],
    timezone: { offsetMinutes: 0, shift48hHours: 0, travelDay: true },
    now: at(19),
  });
  const ctx = makeCtx(input, {}, /*localHour*/ 19);
  assert(ctx.signals.conferenceStartsTomorrow);
  assertEquals(ctx.signals.travelDay, true);

  const flags = evaluate(ctx, { scope: "brief" });
  const night = flags.find((f) => f.rule === "conferenceNightBeforeSummit");
  assert(night, "should fire");
  assertEquals(night!.severity, "high");
  assert(night!.copyHint.includes("offload travel"));
  assert(night!.copyHint.includes("open-brief"));
});

// ─── 5. Post-conference re-entry with dense week ahead ─────────────────────────

Deno.test("E2E · Day after 3-day summit + dense next 3 days: postConferenceReentry high", () => {
  // Today: no conference wrapper. Trailing: 3 consecutive days of conference.
  const input = baseInput({
    events: [{ title: "1:1 with COO", startTime: at(10), endTime: at(10, 30) }],
    trailingEvents: [
      { title: "CEO Summit Day 3", startTime: at(8, 0, "2026-05-17"), endTime: at(18, 0, "2026-05-17"), isAllDay: true, daysAgo: 1 },
      { title: "CEO Summit Day 2", startTime: at(8, 0, "2026-05-16"), endTime: at(18, 0, "2026-05-16"), isAllDay: true, daysAgo: 2 },
      { title: "CEO Summit Day 1", startTime: at(8, 0, "2026-05-15"), endTime: at(18, 0, "2026-05-15"), isAllDay: true, daysAgo: 3 },
    ],
    nextThreeDaysEvents: Array.from({ length: 12 }, (_, i) => ({
      title: `meeting ${i}`, startTime: at(9 + (i % 8), 0, "2026-05-19"),
    })),
    now: at(9),
  });
  const ctx = makeCtx(input);
  assertEquals(ctx.signals.conferenceDayNumberYesterday, 3);
  assertEquals(ctx.signals.nextThreeDaysMeetingCount, 12);
  assertEquals(ctx.signals.conferenceDaysInTrailing4, 3);
  assertEquals(ctx.signals.trailingConferenceLoad, "high");

  const flags = evaluate(ctx, { scope: "plan" });
  const reentry = flags.find((f) => f.rule === "postConferenceReentry");
  const carry   = flags.find((f) => f.rule === "conferenceCarryFatigue");
  assert(reentry); assertEquals(reentry!.severity, "high");
  assert(carry);   assertEquals(carry!.severity, "high");
});

// ─── 6. Negative — quiet day with nothing conference-shaped ───────────────────

Deno.test("E2E · Quiet day with no conference signals: zero conference flags on every surface", () => {
  const input = baseInput({
    events: [{ title: "1:1 with PM", startTime: at(11), endTime: at(11, 30) }],
    now: at(9),
  });
  const ctx = makeCtx(input);
  for (const scope of ["brief", "plan", "nudge"] as const) {
    const flags = evaluate(ctx, { scope });
    const conferenceFlags = flags.filter((f) => f.rule.toLowerCase().includes("conference") || f.rule === "dropInSpeakingHighStakes");
    assertEquals(conferenceFlags.length, 0, `${scope} should have no conference flags`);
  }
});

// ─── 7. Hand-off contract end-to-end ──────────────────────────────────────────

Deno.test("E2E · Hand-off marker present on every nudge-scope conference flag (except mid-session)", () => {
  // Cover all rule paths with one combined fixture: today is Day-2 with speaking + mid-session gap.
  const input = baseInput({
    events: [
      { title: "AI Conference 2026", startTime: at(8), endTime: at(18), isAllDay: true },
      { title: "Panel: Scaling AI", startTime: at(10), endTime: at(11) },
      { title: "Fireside", startTime: at(15), endTime: at(16) },
    ],
    trailingEvents: [{
      title: "AI Conference 2026", startTime: at(8, 0, "2026-05-17"), endTime: at(18, 0, "2026-05-17"),
      isAllDay: true, daysAgo: 1,
    }],
    now: at(9),
  });
  const ctx = makeCtx(input);
  const nudgeFlags = evaluate(ctx, { scope: "nudge" })
    .filter((f) => f.rule.startsWith("conference") || f.rule === "dropInSpeakingHighStakes");

  for (const f of nudgeFlags) {
    if (f.rule === "conferenceMidSessionReset") {
      assert(f.copyHint.includes("inline-somatic"), `${f.rule} should be inline-somatic`);
      assertFalse(f.copyHint.includes("open-brief") || f.copyHint.includes("open-plan"));
    } else if (f.rule === "conferenceDepletion") {
      // legacy escalator — no enforced hand-off marker
    } else {
      assert(
        f.copyHint.includes("open-brief") || f.copyHint.includes("open-plan"),
        `${f.rule} missing hand-off marker: ${f.copyHint}`,
      );
    }
  }
});