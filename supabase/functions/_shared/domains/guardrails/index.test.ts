// [KIND: test] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Test suite for Layer 5 Guardrails Domain.
// Scenarios: GR-01, GR-01b, GR-01c, GR-02, GR-04, GR-07, GR-08, GR-14, GR-15, GR-16, GR-19.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateGuardrails } from "./index.ts";
import type { CandidatePayload, GuardrailContext } from "./types.ts";

Deno.test("Guardrails: GR-01 - 21:15 no wearable defers to morning (quiet_hours)", () => {
  const candidate: CandidatePayload = {
    id: "cand-1",
    surface: "nudge",
    kind: "push",
    pushKind: "jit",
    title: "Prep",
    body: "Prep for tomorrow's board",
  };
  const context: GuardrailContext = {
    nowLocalHour: 21,
    nowLocalMinute: 15,
    nowUtc: new Date("2026-10-23T21:15:00Z"),
    countablePushesTodayCount: 0,
    gateIsOpen: true,
  };

  const verdict = evaluateGuardrails(candidate, context);
  assertEquals(verdict.verdict, "defer");
  assertEquals(verdict.reasonCode, "quiet_hours");
});

Deno.test("Guardrails: GR-01b - 22:05 with 22:30 wearable bedtime defers (bedtime - 30m)", () => {
  const candidate: CandidatePayload = {
    id: "cand-2",
    surface: "nudge",
    kind: "push",
    pushKind: "jit",
    title: "Prep",
    body: "Evening prep",
  };
  const context: GuardrailContext = {
    nowLocalHour: 22,
    nowLocalMinute: 5,
    nowUtc: new Date("2026-10-23T22:05:00Z"),
    wearableBedtime: "22:30",
    countablePushesTodayCount: 1,
    gateIsOpen: true,
  };

  const verdict = evaluateGuardrails(candidate, context);
  assertEquals(verdict.verdict, "defer");
  assertEquals(verdict.reasonCode, "quiet_hours");
});

Deno.test("Guardrails: GR-01c - 06:40 no wearable allows (send window open)", () => {
  const candidate: CandidatePayload = {
    id: "cand-3",
    surface: "nudge",
    kind: "push",
    pushKind: "jit",
    title: "Breakfast prep",
    body: "Breakfast with investor at 07:30",
  };
  const context: GuardrailContext = {
    nowLocalHour: 6,
    nowLocalMinute: 40,
    nowUtc: new Date("2026-10-23T06:40:00Z"),
    countablePushesTodayCount: 0,
    gateIsOpen: true,
  };

  const verdict = evaluateGuardrails(candidate, context);
  assertEquals(verdict.verdict, "allow");
  assertEquals(verdict.reasonCode, "ok");
});

Deno.test("Guardrails: GR-02 & GR-19 - Daily cap suppresses 4th push (daily_cap)", () => {
  const candidate: CandidatePayload = {
    id: "cand-4",
    surface: "nudge",
    kind: "push",
    pushKind: "jit",
    body: "Quick recalibration",
  };
  const context: GuardrailContext = {
    nowLocalHour: 15,
    nowLocalMinute: 0,
    nowUtc: new Date("2026-10-23T15:00:00Z"),
    countablePushesTodayCount: 3, // already at 3
    gateIsOpen: true,
  };

  const verdict = evaluateGuardrails(candidate, context);
  assertEquals(verdict.verdict, "suppress");
  assertEquals(verdict.reasonCode, "daily_cap");
});

Deno.test("Guardrails: GR-04 - Post-demanding gap defers non-recovery candidates (protected_slot)", () => {
  const candidate: CandidatePayload = {
    id: "cand-5",
    surface: "nudge",
    kind: "push",
    pushKind: "jit",
    body: "Review tomorrow's plan",
    isRecoveryOffer: false,
  };
  const context: GuardrailContext = {
    nowLocalHour: 14,
    nowLocalMinute: 15,
    nowUtc: new Date("2026-10-23T14:15:00Z"),
    inPostDemandingGap: true,
    countablePushesTodayCount: 1,
    gateIsOpen: true,
  };

  const verdict = evaluateGuardrails(candidate, context);
  assertEquals(verdict.verdict, "defer");
  assertEquals(verdict.reasonCode, "protected_slot");
});

Deno.test("Guardrails: GR-07 - Crisis episode suppresses non-crisis cards (crisis_mode)", () => {
  const candidate: CandidatePayload = {
    id: "cand-6",
    surface: "home",
    kind: "in_app_card",
    title: "Weekly Streak",
    body: "You've completed 4 days of check-ins",
    isCrisisContent: false,
  };
  const context: GuardrailContext = {
    nowLocalHour: 10,
    nowLocalMinute: 0,
    nowUtc: new Date("2026-10-23T10:00:00Z"),
    isCrisisEpisode: true,
    countablePushesTodayCount: 0,
    gateIsOpen: true,
  };

  const verdict = evaluateGuardrails(candidate, context);
  assertEquals(verdict.verdict, "suppress");
  assertEquals(verdict.reasonCode, "crisis_mode");
});

Deno.test("Guardrails: GR-08 & GR-09 - Sensitive meeting modifies title to time-only", () => {
  const candidate: CandidatePayload = {
    id: "cand-7",
    surface: "nudge",
    kind: "push",
    meetingTime: "15:00",
    isSensitiveMeeting: true,
    body: "HRV −22% before your session with Dr Patel",
  };
  const context: GuardrailContext = {
    nowLocalHour: 14,
    nowLocalMinute: 30,
    nowUtc: new Date("2026-10-23T14:30:00Z"),
    countablePushesTodayCount: 1,
    gateIsOpen: true,
  };

  const verdict = evaluateGuardrails(candidate, context);
  assertEquals(verdict.verdict, "modify");
  assertEquals(verdict.reasonCode, "time_only");
  assertEquals(verdict.modifiedText?.includes("3pm"), true);
  assertEquals(verdict.modifiedText?.includes("Dr Patel"), false);
});

Deno.test("Guardrails: GR-14 - 10-minute gap in chain suppresses (back_to_back)", () => {
  const candidate: CandidatePayload = {
    id: "cand-8",
    surface: "nudge",
    kind: "push",
    body: "Take a deep breath",
  };
  const context: GuardrailContext = {
    nowLocalHour: 11,
    nowLocalMinute: 50,
    nowUtc: new Date("2026-10-23T11:50:00Z"),
    gapMinutesRemaining: 10,
    countablePushesTodayCount: 1,
    gateIsOpen: true,
  };

  const verdict = evaluateGuardrails(candidate, context);
  assertEquals(verdict.verdict, "suppress");
  assertEquals(verdict.reasonCode, "back_to_back");
});

Deno.test("Guardrails: GR-16 - Plan prep completed earlier suppresses JIT nudge (already_done)", () => {
  const candidate: CandidatePayload = {
    id: "cand-9",
    surface: "nudge",
    kind: "push",
    anchorEventId: "board-meeting-evt-123",
    body: "Before your 2pm board meeting",
  };
  const context: GuardrailContext = {
    nowLocalHour: 13,
    nowLocalMinute: 15,
    nowUtc: new Date("2026-10-23T13:15:00Z"),
    completedSlotAnchorIdsToday: ["board-meeting-evt-123"],
    countablePushesTodayCount: 1,
    gateIsOpen: true,
  };

  const verdict = evaluateGuardrails(candidate, context);
  assertEquals(verdict.verdict, "suppress");
  assertEquals(verdict.reasonCode, "already_done");
});
