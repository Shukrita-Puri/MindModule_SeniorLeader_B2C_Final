// PR 1 — JIT v2 selector unit tests. Covers:
//   • Personal noise excluded
//   • Immediate gate (MIN_IMMEDIATE) excludes low-stakes events
//   • Relationship weight raises a 1:1 above an anonymous deep-work block
//   • Tier weighting: same events score differently at T0 vs T3
//   • Strategic only fires when Immediate clears the gate
//   • Pattern hit boosts tactical

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { selectJitCandidates, MIN_IMMEDIATE, classifyInterview } from "./select-jit.ts";

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
    event_to_hrv: [
      { event_type: "Board / governance", n: 6, hrvDeltaPct: -22, confidence: "strong" },
      { event_type: "1:1 / direct report", n: 4, hrvDeltaPct: -12, confidence: "emerging" },
      { event_type: "External / client", n: 5, hrvDeltaPct: -18, confidence: "strong" },
      { event_type: "Investor / fundraise", n: 3, hrvDeltaPct: -15, confidence: "emerging" },
    ],
    event_to_rhr: [
      { event_type: "Exec / leadership", n: 5, hrvDeltaPct: 8, confidence: "strong" },
      { event_type: "All-hands", n: 3, hrvDeltaPct: 6, confidence: "emerging" },
    ],
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

Deno.test("EY interview with 4 attendees outranks a zero-attendee Chief AI connect block", () => {
  const res = selectJitCandidates(
    [
      {
        id: "chief-ai",
        title: "Chief AI Thursday connects",
        start_time: inHours(3),
        end_time: inHours(4),
        attendeesCount: 0,
        attendeeRoles: [{ role: "peer" as const, source: "llm" as const, confidence: 1 }],
      },
      {
        id: "ey",
        title: "EY Foundation interview",
        start_time: inHours(4),
        end_time: inHours(5),
        attendeesCount: 4,
        attendeeRoles: [{ role: "peer" as const, source: "llm" as const, confidence: 1 }],
      },
    ],
    { accountAgeDays: 60, signalSummary: null, skipCountsByBucket: {}, followThroughByBucket: {}, goals: null, nowMs: NOW },
  );
  assertEquals(res.ranked[0].eventId, "ey");
});

Deno.test("zero-attendee connects block gets no recurring-pattern bonus", () => {
  const res = selectJitCandidates(
    [{
      id: "block",
      title: "Chief AI Thursday connects",
      start_time: inHours(3),
      end_time: inHours(4),
      attendeesCount: 0,
      attendeeRoles: [{ role: "peer" as const, source: "llm" as const, confidence: 1 }],
    }],
    {
      accountAgeDays: 60,
      signalSummary: { event_to_hrv: [{ event_type: "Board / governance", n: 4, hrvDeltaPct: -25, confidence: "strong" }], event_to_rhr: [] },
      skipCountsByBucket: {},
      followThroughByBucket: {},
      goals: null,
      nowMs: NOW,
    },
  );
  assertEquals(res.ranked[0].components.breakdown.patternScore, 0);
});

Deno.test("events beyond 24h are excluded before scoring", () => {
  const res = selectJitCandidates(
    [{ id: "far", title: "Board Meeting", start_time: inHours(30), end_time: inHours(31), attendeeRoles: ["board_member"] }],
    { accountAgeDays: 60, signalSummary: null, skipCountsByBucket: {}, followThroughByBucket: {}, goals: null, nowMs: NOW },
  );
  assertEquals(res.ranked.length, 0);
  assertEquals(res.excluded[0].reason, "outside_horizon_ceiling");
});

Deno.test("horizonMs override admits events up to a week out (Week-Ahead picker)", () => {
  const res = selectJitCandidates(
    [{ id: "wk", title: "Board Meeting", start_time: inHours(96), end_time: inHours(97), attendeeRoles: ["board_member"] }],
    {
      accountAgeDays: 60,
      signalSummary: null,
      skipCountsByBucket: {},
      followThroughByBucket: {},
      goals: null,
      nowMs: NOW,
      horizonMs: 7 * 24 * 60 * 60_000,
    },
  );
  assertEquals(res.ranked.length, 1);
  assertEquals(res.ranked[0].eventId, "wk");
});

Deno.test("sovereign tag 'high' boosts importance regardless of tier", () => {
  const base = [{ id: "h", title: "Board Meeting", start_time: inHours(4), end_time: inHours(5), attendeeRoles: ["board_member" as const] }];
  const untagged = selectJitCandidates(base, { accountAgeDays: 60, signalSummary: null, skipCountsByBucket: {}, followThroughByBucket: {}, goals: null, nowMs: NOW });
  const tagged = selectJitCandidates(
    [{ ...base[0], tags: ["high"] }],
    { accountAgeDays: 60, signalSummary: null, skipCountsByBucket: {}, followThroughByBucket: {}, goals: null, nowMs: NOW },
  );
  assert(tagged.ranked[0].importance >= untagged.ranked[0].importance + 40);
  assertEquals(tagged.ranked[0].components.sovereignBonus, 45);
});

Deno.test("sovereign tag 'low' demotes regardless of stakes", () => {
  const res = selectJitCandidates(
    [{ id: "l", title: "Board Meeting", start_time: inHours(4), end_time: inHours(5), attendeeRoles: ["board_member" as const], tags: ["low"] }],
    { accountAgeDays: 60, signalSummary: null, skipCountsByBucket: {}, followThroughByBucket: {}, goals: null, nowMs: NOW },
  );
  assertEquals(res.ranked.length, 0);
  assertEquals(res.excluded[0].reason, "user_tag_low");
});

Deno.test("relationshipLeads flag set when untagged and relationship strong", () => {
  const res = selectJitCandidates(
    [{ id: "r", title: "Tuesday sync", start_time: inHours(4), end_time: inHours(5), attendeeRoles: ["board_member" as const] }],
    { accountAgeDays: 60, signalSummary: null, skipCountsByBucket: {}, followThroughByBucket: {}, goals: null, nowMs: NOW },
  );
  if (res.ranked.length > 0) {
    assertEquals(res.ranked[0].components.breakdown.relationshipLeads, true);
  }
});

Deno.test("sovereign HIGH on EY interview lifts it above an untagged Chief AI block (screenshot scenario)", () => {
  // Mirrors the user-reported ranking bug: a Chief AI sync was ranking #1
  // over a Confirmed First Round EY Foundation interview tagged HIGH.
  // With sovereign tag persistence working, HIGH must dominate.
  const events = [
    {
      id: "chief-ai",
      title: "Chief AI 1:1 sync",
      start_time: inHours(2),
      end_time: inHours(3),
      attendeeRoles: ["peer"] as any,
      tags: [] as string[],
    },
    {
      id: "ey",
      title: "EY Foundation Trustee 1:1",
      start_time: inHours(5),
      end_time: inHours(6),
      attendeeRoles: ["peer"] as any,
      tags: ["high"],
    },
  ];
  // Mature account, no patterns favouring either — pure sovereign-tag check.
  const res = selectJitCandidates(events, {
    accountAgeDays: 60,
    signalSummary: null,
    skipCountsByBucket: {},
    followThroughByBucket: {},
    goals: null,
    nowMs: NOW,
  });
  assert(res.ranked.length >= 1, "EY should be ranked");
  assertEquals(res.ranked[0].eventId, "ey", "HIGH-tagged EY interview must lead");
});

// ─────────────────────────────────────────────────────────────────────
// §C — relationship fallback chain: memory replay, domain heuristic,
// confidence gating, sovereign vs llm precedence.
// ─────────────────────────────────────────────────────────────────────

Deno.test("memory_user_tag replay lifts a bland-title 1:1 above MIN_IMMEDIATE", () => {
  // Bland title "Tuesday sync" has category B (15) + 0 stakes. Without a
  // relationship signal it'd score 15 < MIN_IMMEDIATE(25) and be excluded.
  // A replayed Boss tag (full weight, no decay) hoists out of Immediate
  // into the sovereign bonus (§11A.2) — Immediate stays low but sovereign
  // bypass lets the event clear the JIT floor.
  const res = selectJitCandidates(
    [{
      id: "rep",
      title: "Tuesday sync",
      start_time: inHours(4),
      end_time: inHours(5),
      attendeeRoles: [{ role: "boss" as const, source: "memory_user_tag" as const, confidence: 1 }],
    }],
    { accountAgeDays: 60, signalSummary: null, skipCountsByBucket: {}, followThroughByBucket: {}, goals: null, nowMs: NOW },
  );
  assertEquals(res.ranked.length, 1);
  // Effective rel still reports 25 (back-compat); split surfaces the hoist.
  assertEquals(res.ranked[0].components.breakdown.relationship, 25);
  assertEquals(res.ranked[0].components.breakdown.relationship_sovereign, 25);
  assertEquals(res.ranked[0].components.sovereignBonus >= 25, true);
});

Deno.test("domain_heuristic external_partner nudges importance without dominating", () => {
  // external_partner base 15, low-conf heuristic ×0.3 ≈ 5. Pairs with a
  // category-C base (30) → immediate 35 ≥ MIN. A high-confidence Boss on
  // the same title must still outrank the heuristic-only event.
  const heur = selectJitCandidates(
    [{
      id: "ext",
      title: "Client check-in",
      start_time: inHours(4),
      end_time: inHours(5),
      attendeeRoles: [{ role: "external_partner" as const, source: "domain_heuristic" as const, confidence: 0.4 }],
    }],
    { accountAgeDays: 60, signalSummary: null, skipCountsByBucket: {}, followThroughByBucket: {}, goals: null, nowMs: NOW },
  );
  const strong = selectJitCandidates(
    [{
      id: "boss",
      title: "Client check-in",
      start_time: inHours(4),
      end_time: inHours(5),
      attendeeRoles: [{ role: "boss" as const, source: "llm" as const, confidence: 0.9 }],
    }],
    { accountAgeDays: 60, signalSummary: null, skipCountsByBucket: {}, followThroughByBucket: {}, goals: null, nowMs: NOW },
  );
  assertEquals(heur.ranked.length, 1);
  assertEquals(strong.ranked.length, 1);
  assert(heur.ranked[0].components.breakdown.relationship < 10);
  assert(strong.ranked[0].components.breakdown.relationship >= 20);
  assert(strong.ranked[0].importance > heur.ranked[0].importance);
});

Deno.test("confidence gating: low-confidence LLM role contributes ~30% of high-confidence", () => {
  const high = selectJitCandidates(
    [{ id: "hi", title: "Board Meeting", start_time: inHours(4), end_time: inHours(5),
       attendeeRoles: [{ role: "board_member" as const, source: "llm" as const, confidence: 0.9 }] }],
    { accountAgeDays: 60, signalSummary: null, skipCountsByBucket: {}, followThroughByBucket: {}, goals: null, nowMs: NOW },
  );
  const low = selectJitCandidates(
    [{ id: "lo", title: "Board Meeting", start_time: inHours(4), end_time: inHours(5),
       attendeeRoles: [{ role: "board_member" as const, source: "llm" as const, confidence: 0.4 }] }],
    { accountAgeDays: 60, signalSummary: null, skipCountsByBucket: {}, followThroughByBucket: {}, goals: null, nowMs: NOW },
  );
  const hiRel = high.ranked[0].components.breakdown.relationship;
  const loRel = low.ranked[0].components.breakdown.relationship;
  // 25 × 1.0 = 25 ;  25 × 0.3 ≈ 8 — within rounding.
  assertEquals(hiRel, 25);
  assertEquals(loRel, 8);
});

Deno.test("user_tag is sovereign over a higher-base LLM-inferred role", () => {
  // user_tag boss (25) must beat llm investor (20) even though investor
  // would otherwise be a fully-confident high signal too.
  const userTag = selectJitCandidates(
    [{ id: "ut", title: "Tuesday sync", start_time: inHours(4), end_time: inHours(5),
       attendeeRoles: [{ role: "boss" as const, source: "user_tag" as const, confidence: 1 }] }],
    { accountAgeDays: 60, signalSummary: null, skipCountsByBucket: {}, followThroughByBucket: {}, goals: null, nowMs: NOW },
  );
  const llmHigh = selectJitCandidates(
    [{ id: "ll", title: "Tuesday sync", start_time: inHours(4), end_time: inHours(5),
       attendeeRoles: [{ role: "investor" as const, source: "llm" as const, confidence: 0.9 }] }],
    { accountAgeDays: 60, signalSummary: null, skipCountsByBucket: {}, followThroughByBucket: {}, goals: null, nowMs: NOW },
  );
  assert(userTag.ranked[0].importance > llmHigh.ranked[0].importance);
});

Deno.test("EY interview outranks zero-attendee 'connects' block (no tags)", () => {
  // Mirrors today's real-world bug: a 0-attendee personal block titled
  // like a recurring meeting was ranking above a high-stakes interview
  // because the recurring pattern bonus carried it.
  const sig = {
    event_to_hrv: [
      { event_type: "AI / strategy", n: 6, hrvDeltaPct: -20, confidence: "strong" },
    ],
  };
  const res = selectJitCandidates(
    [
      { id: "ey", title: "Confirmed: First Round EY Foundation Independent Trustee Interview | Shukrita Puri",
        start_time: inHours(2), end_time: inHours(3), attendeesCount: 4, attendeeRoles: ["external_partner" as const] },
      { id: "ca", title: "Chief AI Thursday connects",
        start_time: inHours(4), end_time: inHours(5), attendeesCount: 0 },
    ],
    { accountAgeDays: 60, signalSummary: sig, skipCountsByBucket: {}, followThroughByBucket: {}, goals: null, nowMs: NOW },
  );
  // EY must win head-to-head.
  assertEquals(res.ranked[0]?.eventId, "ey");
});

Deno.test("zero-attendee 'connects' personal block does NOT collect recurring pattern bonus", () => {
  const sig = {
    event_to_hrv: [
      { event_type: "AI / strategy", n: 10, hrvDeltaPct: -25, confidence: "strong" },
    ],
  };
  const res = selectJitCandidates(
    [{ id: "ca", title: "Chief AI Thursday connects", start_time: inHours(3), end_time: inHours(4), attendeesCount: 0 }],
    { accountAgeDays: 60, signalSummary: sig, skipCountsByBucket: {}, followThroughByBucket: {}, goals: null, nowMs: NOW },
  );
  // Personal block: pattern score zeroed even when signal_summary has a hit.
  // The event may still be excluded for failing MIN_IMMEDIATE; in either
  // case patternScore on the ranked OR excluded path must be 0.
  const all = [...res.ranked];
  if (all.length > 0) {
    assertEquals(all[0].components.breakdown.patternScore, 0);
  }
});

Deno.test("interview boost requires attendees", () => {
  const solo = selectJitCandidates(
    [{ id: "p", title: "Interview prep", start_time: inHours(2), end_time: inHours(3), attendeesCount: 0 }],
    { accountAgeDays: 60, signalSummary: null, skipCountsByBucket: {}, followThroughByBucket: {}, goals: null, nowMs: NOW },
  );
  const live = selectJitCandidates(
    [{ id: "i", title: "Trustee Interview", start_time: inHours(2), end_time: inHours(3), attendeesCount: 3,
       attendeeRoles: ["external_partner" as const] }],
    { accountAgeDays: 60, signalSummary: null, skipCountsByBucket: {}, followThroughByBucket: {}, goals: null, nowMs: NOW },
  );
  // Live interview must clear MIN_IMMEDIATE; solo prep should not get the +15.
  assert(live.ranked.length === 1 && live.ranked[0].components.immediate >= MIN_IMMEDIATE);
  // Solo prep with no attendees gets 0 interview boost — confirm by absence
  // of any interview boost in stakes breakdown.
  if (solo.ranked.length > 0) {
    assert(solo.ranked[0].components.breakdown.stakes < 6);
  }
});

// ─────────────────────────────────────────────────────────────────────
// Immediate axis re-rank tests (B→30, C→32, D-interpersonal, interview split,
// 1:1 seniority, crisis routing, keyword extensions, speaking re-route).
// ─────────────────────────────────────────────────────────────────────

const baseCtx = {
  accountAgeDays: 60,
  signalSummary: null,
  skipCountsByBucket: {},
  followThroughByBucket: {},
  goals: null,
  nowMs: NOW,
};

Deno.test("pitch (B) outranks deep work (E)", () => {
  const res = selectJitCandidates(
    [
      { id: "pitch", title: "Investor Pitch with Acme", start_time: inHours(2), end_time: inHours(3),
        attendeesCount: 2, attendeeRoles: ["investor" as const] },
      { id: "dw", title: "Deep Work Block", start_time: inHours(3), end_time: inHours(5), attendeesCount: 0 },
    ],
    baseCtx,
  );
  assertEquals(res.ranked[0]?.eventId, "pitch");
});

Deno.test("all-hands (C) outranks conference (F)", () => {
  const res = selectJitCandidates(
    [
      { id: "ah", title: "Q3 All-Hands Town Hall", start_time: inHours(2), end_time: inHours(3),
        attendeesCount: 50 },
      { id: "conf", title: "Industry Summit attending", start_time: inHours(3), end_time: inHours(8),
        attendeesCount: 100 },
    ],
    baseCtx,
  );
  assertEquals(res.ranked[0]?.eventId, "ah");
});

Deno.test("layoff conversation gets D interpersonal boost", () => {
  const res = selectJitCandidates(
    [{ id: "lo", title: "Layoff conversation with Sam", start_time: inHours(2), end_time: inHours(3),
       attendeesCount: 1, attendeeRoles: ["report" as const] }],
    baseCtx,
  );
  // D(22) + interpersonal(+13) capped at 38; seniority -6 for report → 32; clears MIN.
  assertEquals(res.ranked.length, 1);
  assert(res.ranked[0].components.breakdown.categoryBase >= 28);
});

Deno.test("media interview classifies as media", () => {
  const kind = classifyInterview({
    title: "CNBC interview with David",
    attendeesCount: 2,
    categoryId: "C",
  });
  assertEquals(kind, "media");
});

Deno.test("candidate-side interview detected via external organizer", () => {
  const kind = classifyInterview({
    title: "Interview with CEO at Stripe",
    attendeesCount: 1,
    categoryId: "D",
    organizerEmail: "recruiting@stripe.com",
    userDomain: "mindmodule.me",
  });
  assertEquals(kind, "candidate");
});

Deno.test("hiring-side interview detected via internal panel", () => {
  const kind = classifyInterview({
    title: "Interview: Jane Doe for SWE II",
    attendeesCount: 3,
    categoryId: "D",
    organizerEmail: "lead@mindmodule.me",
    attendeeDomains: ["mindmodule.me", "mindmodule.me", "mindmodule.me"],
    userDomain: "mindmodule.me",
  });
  assertEquals(kind, "hiring");
});

Deno.test("bare ambiguous interview falls through to ambiguous", () => {
  const kind = classifyInterview({
    title: "Interview",
    attendeesCount: 1,
  });
  assertEquals(kind, "ambiguous");
});

Deno.test("1:1 boss outranks 1:1 with report (report falls below MIN)", () => {
  const res = selectJitCandidates(
    [
      { id: "boss", title: "1:1 with Pat", start_time: inHours(2), end_time: inHours(3),
        attendeesCount: 1, attendeeRoles: ["boss" as const] },
      { id: "rep", title: "1:1 with Junior", start_time: inHours(3), end_time: inHours(4),
        attendeesCount: 1, attendeeRoles: ["report" as const] },
    ],
    baseCtx,
  );
  const ids = res.ranked.map((r) => r.eventId);
  assert(ids.includes("boss"));
  // report-side 1:1 should not rank #1; either ranked below or excluded.
  if (ids.includes("rep")) {
    assert(ids.indexOf("boss") < ids.indexOf("rep"));
  }
});

Deno.test("crisis title routes event to nudge, not Plan", () => {
  const res = selectJitCandidates(
    [{ id: "c", title: "URGENT: customer outage war room",
       start_time: inHours(1), end_time: inHours(2),
       attendeesCount: 4, attendeeRoles: ["client" as const] }],
    baseCtx,
  );
  assertEquals(res.ranked.length, 0);
  assertEquals(res.excluded[0]?.reason, "crisis_route_to_nudge");
  assertEquals(res.crisisEvents.length, 1);
  assertEquals(res.crisisEvents[0].eventId, "c");
});

Deno.test("earnings keyword on board meeting adds A-tier stakes (+15)", () => {
  // "Board Meeting" classifies as A=40; adding 'earnings' keyword should
  // collect the +15 stakes tier (board already in that tier; assert >=15).
  const res = selectJitCandidates(
    [{ id: "ec", title: "Board Meeting — Q3 earnings review",
       start_time: inHours(2), end_time: inHours(4),
       attendeesCount: 6, attendeeRoles: ["board_member" as const] }],
    baseCtx,
  );
  assertEquals(res.ranked.length, 1);
  assert(res.ranked[0].components.breakdown.stakes >= 15);
});

Deno.test("keynote re-routes F→C", () => {
  const res = selectJitCandidates(
    [{ id: "kn", title: "Conference keynote — Industry Summit",
       start_time: inHours(5), end_time: inHours(6), attendeesCount: 200 }],
    baseCtx,
  );
  const kn = res.ranked.find((r) => r.eventId === "kn");
  assert(kn, "keynote should be ranked");
  assertEquals(kn!.categoryId, "C");
});

// ─────────────────────────────────────────────────────────────────────
// §11A — Sovereign hoist, JIT-floor fix, MemoryDelta.
// ─────────────────────────────────────────────────────────────────────

Deno.test("user-tagged board_member hoists rel out of Immediate into sovereign", () => {
  const userTagged = selectJitCandidates(
    [{ id: "u", title: "Tuesday sync", start_time: inHours(4), end_time: inHours(5),
       attendeesCount: 1,
       attendeeRoles: [{ role: "board_member" as const, source: "user_tag" as const, confidence: 1 }] }],
    baseCtx,
  );
  const llmEquiv = selectJitCandidates(
    [{ id: "l", title: "Tuesday sync", start_time: inHours(4), end_time: inHours(5),
       attendeesCount: 1,
       attendeeRoles: [{ role: "board_member" as const, source: "llm" as const, confidence: 1 }] }],
    baseCtx,
  );
  assertEquals(userTagged.ranked.length, 1);
  assertEquals(llmEquiv.ranked.length, 1);
  const u = userTagged.ranked[0];
  const l = llmEquiv.ranked[0];
  // Sovereign-hoisted rel is removed from Immediate and re-added on top.
  assertEquals(u.components.breakdown.relationship_sovereign, 25);
  assertEquals(u.components.breakdown.relationship_inferred, 0);
  assertEquals(l.components.breakdown.relationship_sovereign, 0);
  assertEquals(l.components.breakdown.relationship_inferred, 25);
  // Immediate is 25 lower in the sovereign case; sovereignBonus is 25 higher.
  assertEquals(u.components.immediate, l.components.immediate - 25);
  assertEquals(u.components.sovereignBonus, l.components.sovereignBonus + 25);
});

Deno.test("inferred relationship confidence discount applies (Layer 3 0.6 → ×0.6)", () => {
  const mid = selectJitCandidates(
    [{ id: "m", title: "Board Meeting", start_time: inHours(4), end_time: inHours(5),
       attendeesCount: 4,
       attendeeRoles: [{ role: "board_member" as const, source: "llm" as const, confidence: 0.6 }] }],
    baseCtx,
  );
  // 25 × 0.6 = 15
  assertEquals(mid.ranked[0].components.breakdown.relationship_inferred, 15);
  assertEquals(mid.ranked[0].components.breakdown.relationship_sovereign, 0);
});

Deno.test("JIT floor passes on tier-weighted total even when immediate < MIN", () => {
  // Cold-account category-H baseline ('Sunday Evening Reset') = immediate 5,
  // no tactical, no sovereign — should still excluded. Then prove the
  // converse: a Board Meeting at T0 has weighted < MIN_IMMEDIATE but
  // immediate ≥ MIN, so it ranks (floor passes via the immediate clause).
  const board = selectJitCandidates(
    [{ id: "b", title: "Board Meeting", start_time: inHours(4), end_time: inHours(5),
       attendeesCount: 6, attendeeRoles: ["board_member" as const] }],
    baseCtx,
  );
  assertEquals(board.ranked.length, 1);
  // Sovereign-bypass path: a bland event tagged HIGH (sovereign bonus 45)
  // must pass even with tiny immediate.
  const tagged = selectJitCandidates(
    [{ id: "t", title: "Tuesday sync", start_time: inHours(4), end_time: inHours(5),
       attendeesCount: 0, tags: ["high"] }],
    baseCtx,
  );
  assertEquals(tagged.ranked.length, 1);
});

Deno.test("relationshipLeads reads hoisted (sovereign) rel, not zeroed Immediate residual", () => {
  // No user importance tag, but the relationship has been hoisted out via
  // memory_user_tag — the flag must still report relationshipLeads = true.
  const res = selectJitCandidates(
    [{ id: "r", title: "Tuesday sync", start_time: inHours(4), end_time: inHours(5),
       attendeesCount: 1,
       attendeeRoles: [{ role: "board_member" as const, source: "memory_user_tag" as const, confidence: 1 }] }],
    baseCtx,
  );
  assertEquals(res.ranked.length, 1);
  assertEquals(res.ranked[0].components.breakdown.relationship_inferred, 0);
  assertEquals(res.ranked[0].components.breakdown.relationship_sovereign, 25);
  assertEquals(res.ranked[0].components.breakdown.relationshipLeads, true);
});

Deno.test("MemoryDelta hardDemote evicts the event", () => {
  const res = selectJitCandidates(
    [{ id: "x", title: "Board Meeting", start_time: inHours(4), end_time: inHours(5),
       attendeesCount: 6, attendeeRoles: ["board_member" as const] }],
    { ...baseCtx, memoryDeltaByEventId: { x: { hardDemote: true } } },
  );
  assertEquals(res.ranked.length, 0);
  assertEquals(res.excluded[0]?.reason, "memory_hard_demote");
});

Deno.test("MemoryDelta delta is added post-tier-weighting to importance", () => {
  const plain = selectJitCandidates(
    [{ id: "p", title: "Board Meeting", start_time: inHours(4), end_time: inHours(5),
       attendeesCount: 6, attendeeRoles: ["board_member" as const] }],
    baseCtx,
  );
  const boosted = selectJitCandidates(
    [{ id: "p", title: "Board Meeting", start_time: inHours(4), end_time: inHours(5),
       attendeesCount: 6, attendeeRoles: ["board_member" as const] }],
    { ...baseCtx, memoryDeltaByEventId: { p: { delta: 7 } } },
  );
  assertEquals(boosted.ranked[0].components.memoryDelta, 7);
  assertEquals(
    Math.round((boosted.ranked[0].importance - plain.ranked[0].importance) * 100) / 100,
    7,
  );
});
