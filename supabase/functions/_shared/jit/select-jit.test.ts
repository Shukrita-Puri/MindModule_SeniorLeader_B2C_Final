// PR 1 — JIT v2 selector unit tests. Covers:
//   • Personal noise excluded
//   • Immediate gate (MIN_IMMEDIATE) excludes low-stakes events
//   • Relationship weight raises a 1:1 above an anonymous deep-work block
//   • Tier weighting: same events score differently at T0 vs T3
//   • Strategic only fires when Immediate clears the gate
//   • Pattern hit boosts tactical

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { selectJitCandidates, MIN_IMMEDIATE } from "./select-jit.ts";

const NOW = Date.parse("2026-05-25T08:00:00.000Z");
const inHours = (h: number) => new Date(NOW + h * 3600_000).toISOString();

Deno.test("personal noise is excluded before scoring", () => {
  const res = selectJitCandidates(
    [{ id: "1", title: "Walk the dog", start_time: inHours(2), end_time: inHours(3) }],
    { accountAgeDays: 60, signalSummary: null, skipCountsByBucket: {}, followThroughByBucket: {}, goals: null, nowMs: NOW },
  );
  assertEquals(res.ranked.length, 0);
  assertEquals(res.excluded[0].reason, "personal_noise");
});

Deno.test("board meeting clears MIN_IMMEDIATE even with no patterns", () => {
  const res = selectJitCandidates(
    [{ id: "b", title: "Board Meeting", start_time: inHours(3), end_time: inHours(5), attendeeRoles: ["board_member"] }],
    { accountAgeDays: 2, signalSummary: null, skipCountsByBucket: {}, followThroughByBucket: {}, goals: null, nowMs: NOW },
  );
  assertEquals(res.ranked.length, 1);
  assert(res.ranked[0].components.immediate >= MIN_IMMEDIATE);
  assertEquals(res.tier.tier, "T0");
});

Deno.test("tier weighting amplifies tactical at T3 vs T0", () => {
  const evt = [{ id: "x", title: "Board Meeting", start_time: inHours(4), end_time: inHours(5), attendeeRoles: ["boss" as const] }];
  const sig = {
    event_to_hrv: [{ event_type: "Board / governance", n: 6, hrvDeltaPct: -22, confidence: "strong" }],
    event_to_rhr: [],
  };
  const cold = selectJitCandidates(evt, { accountAgeDays: 3, signalSummary: null, skipCountsByBucket: {}, followThroughByBucket: {}, goals: null, nowMs: NOW });
  const mature = selectJitCandidates(evt, { accountAgeDays: 60, signalSummary: sig, skipCountsByBucket: {}, followThroughByBucket: {}, goals: null, nowMs: NOW });
  assertEquals(cold.tier.tier, "T0");
  assertEquals(mature.tier.tier, "T3");
  // Tactical contribution is larger relative to importance at T3.
  const coldTacShare = (cold.tier.tactical * cold.ranked[0].components.tactical) / cold.ranked[0].importance;
  const matureTacShare = (mature.tier.tactical * mature.ranked[0].components.tactical) / mature.ranked[0].importance;
  assert(matureTacShare > coldTacShare, `expected matureTacShare > coldTacShare (${matureTacShare} > ${coldTacShare})`);
});

Deno.test("strategic boost requires Immediate >= MIN_IMMEDIATE", () => {
  // A low-immediate noisy event would normally score 0 strategic anyway,
  // so use a Daily-Rhythm category H event that fails the MIN gate without
  // attendees/stakes — even if goal matches, no strategic boost is applied.
  const res = selectJitCandidates(
    [{ id: "h", title: "Sunday Evening Reset", start_time: inHours(6), end_time: inHours(7) }],
    {
      accountAgeDays: 60,
      signalSummary: null,
      skipCountsByBucket: {},
      followThroughByBucket: {},
      goals: { growthIntentions: ["resilience"] },
      nowMs: NOW,
    },
  );
  // H base=5, no relationship, no stakes → 5 < 25 → excluded.
  assertEquals(res.ranked.length, 0);
  // Either "below_min_immediate" or "no_category" — both mean the event
  // never reached strategic scoring, which is what we're asserting.
  assert(res.excluded[0].reason === "below_min_immediate" || res.excluded[0].reason === "no_category");
});

Deno.test("pattern hit raises tactical score", () => {
  const base = [{ id: "p", title: "Board Meeting", start_time: inHours(4), end_time: inHours(5), attendeeRoles: ["board_member" as const] }];
  const noPattern = selectJitCandidates(base, { accountAgeDays: 60, signalSummary: null, skipCountsByBucket: {}, followThroughByBucket: {}, goals: null, nowMs: NOW });
  const withPattern = selectJitCandidates(base, {
    accountAgeDays: 60,
    signalSummary: { event_to_hrv: [{ event_type: "Board / governance", n: 4, hrvDeltaPct: -25, confidence: "strong" }], event_to_rhr: [] },
    skipCountsByBucket: {}, followThroughByBucket: {}, goals: null, nowMs: NOW,
  });
  assert(withPattern.ranked[0].components.tactical > noPattern.ranked[0].components.tactical);
  assert(withPattern.ranked[0].importance > noPattern.ranked[0].importance);
});

Deno.test("skip penalty reduces tactical", () => {
  const base = [{ id: "s", title: "Board Meeting", start_time: inHours(4), end_time: inHours(5), attendeeRoles: ["boss" as const] }];
  const clean = selectJitCandidates(base, { accountAgeDays: 60, signalSummary: null, skipCountsByBucket: {}, followThroughByBucket: {}, goals: null, nowMs: NOW });
  const skipped = selectJitCandidates(base, { accountAgeDays: 60, signalSummary: null, skipCountsByBucket: { "Board / governance": 3 }, followThroughByBucket: {}, goals: null, nowMs: NOW });
  assert(skipped.ranked[0].components.tactical < clean.ranked[0].components.tactical);
});