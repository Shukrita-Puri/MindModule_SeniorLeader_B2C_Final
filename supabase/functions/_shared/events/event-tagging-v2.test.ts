// v2 spec regression tests — Event Tagging A–H Implementation Spec v2.
// Covers Workstreams 1 (taxonomy) + 2 (enrich adapter, arc selector,
// beta-feedback override). No DB, no IO — pure classifier assertions.

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { enrichEvent, subcategoryFromSubtypeId } from "./enrich-event.ts";
import { classifyEvent } from "./event-classifier.ts";
import { classifyEventV2 } from "./classify-event-v2.ts";
import { EVENT_TYPES } from "./event-subtypes.ts";

function subtypeIdFromV1(title: string): string | null {
  return classifyEvent(title)?.id ?? null;
}

// ── Cross-layer invariants ─────────────────────────────────────────

Deno.test("v2 rows: every new subtype resolves to a known category (A–H)", () => {
  const newIds = [
    "gov.trustee",
    "inf.pitch_competitive",
    "vis.stakeholder_comm",
    "lead.hiring_interview",
    "str.learning",
    "str.community",
    "str.review",
    "str.compliance",
    "trv.accommodation",
    "trv.travel_day",
    "rhy.holiday",
    "rhy.wellness_fitness",
    "rhy.wellness_self_care",
    "rhy.wellness_health_check",
    "rhy.wellness_medical",
    "rhy.social",
    "rhy.family",
    "rhy.recreation",
  ];
  for (const id of newIds) {
    const row = EVENT_TYPES.find((e) => e.id === id);
    assert(row, `${id} missing from EVENT_TYPES`);
    assert(
      ["A", "B", "C", "D", "E", "F", "G", "H"].includes(row!.categoryId),
      `${id} bad categoryId`,
    );
  }
});

// ── Spec Part 8 — Event Classification test cases ──────────────────

Deno.test("spec: 'Mind Module - Beta test feedback' → E (deep_work), not D", () => {
  // v1 dictionary was routing this to lead.difficult_conversation via 'feedback'.
  const v1 = subtypeIdFromV1("Mind Module - Beta test feedback");
  // With the excludeKeywords fix, v1 no longer routes to lead.difficult_conversation
  // and lands on str.deep_work directly.
  assertEquals(v1, "str.deep_work");

  // v2 (organizer=true) confirms the same routing via the explicit override.
  const v2 = classifyEventV2({
    title: "Mind Module - Beta test feedback",
    isOrganizer: true,
  });
  assertEquals(v2.category, "E");
  assertEquals(v2.subtypeId, "str.deep_work");
});

Deno.test("spec: 'Coffee with Alex' → H (personal social), not H catchup", () => {
  const enriched = enrichEvent({ title: "Coffee with Alex" });
  assertEquals(enriched.categoryId, "H");
  assertEquals(enriched.subcategory, "social");
});

Deno.test("spec: 'Product Launch Webinar' passive attendee → E (learning)", () => {
  const enriched = enrichEvent({ title: "Growth Marketing Masterclass" });
  assertEquals(enriched.categoryId, "E");
  assertEquals(enriched.subcategory, "learning");
});

Deno.test("spec: founder education titles → E (learning), not B", () => {
  for (
    const title of [
      "Sales Assumptions Founders Make",
      "Do's and Don'ts of New Biz Presentations",
      "What Actually Closed Our $3M+ Rounds",
      "Cracking the US market + networking",
      "Intro Call > Isabel @ Karyon Partners",
    ]
  ) {
    const enriched = enrichEvent({ title });
    assertEquals(enriched.categoryId, "E", title);
    assertEquals(enriched.subcategory, "learning", title);
  }
});

Deno.test("spec: 'Thursday Connects' community group → E (community)", () => {
  const enriched = enrichEvent({ title: "Thursday Connects — August" });
  assertEquals(enriched.categoryId, "E");
  assertEquals(enriched.subcategory, "community");
});

Deno.test("spec: 'Banking on Breakfast' community group → E (community)", () => {
  const enriched = enrichEvent({ title: "Banking on Breakfast" });
  assertEquals(enriched.categoryId, "E");
  assertEquals(enriched.subcategory, "community");
});

Deno.test("spec: 'BP Review' → E (review), not A (budget_review)", () => {
  const enriched = enrichEvent({ title: "BP Review Q3" });
  assertEquals(enriched.categoryId, "E");
  assertEquals(enriched.subcategory, "review");
});

Deno.test("spec: 'Budget Review' → E (review), not A", () => {
  const enriched = enrichEvent({ title: "Budget Review" });
  assertEquals(enriched.categoryId, "E");
  assertEquals(enriched.subcategory, "review");
});

Deno.test("spec: 'School Board' → A (trustee), not corporate board_meeting", () => {
  const enriched = enrichEvent({ title: "School board governors meeting" });
  assertEquals(enriched.categoryId, "A");
  assertEquals(enriched.subcategory, "trustee");
});

Deno.test("spec: 'Pitch to L\\'Oreal' → B (pitch_competitive), not fundraising", () => {
  const enriched = enrichEvent({
    title: "Pitch to L'Oreal — RFP presentation",
  });
  assertEquals(enriched.categoryId, "B");
  assertEquals(enriched.subcategory, "pitch_competitive");
});

Deno.test("spec: 'Screening call — CFO candidate' → D (hiring_interview)", () => {
  const enriched = enrichEvent({ title: "Screening call — CFO candidate" });
  assertEquals(enriched.categoryId, "D");
  assertEquals(enriched.subcategory, "hiring_interview");
});

Deno.test("spec: 'Bank holiday' → H (holiday), not pto", () => {
  const enriched = enrichEvent({ title: "UK Bank Holiday" });
  assertEquals(enriched.categoryId, "H");
  assertEquals(enriched.subcategory, "holiday");
});

Deno.test("spec: 'Q2 results to leadership' → C (stakeholder_communication)", () => {
  const enriched = enrichEvent({ title: "Q2 results to leadership" });
  assertEquals(enriched.categoryId, "C");
  assertEquals(enriched.subcategory, "stakeholder_communication");
});

Deno.test("spec: client narrative intro → B (client_presentation)", () => {
  const enriched = enrichEvent({
    title: "Introduction to Mind Module - Narrative",
  });
  assertEquals(enriched.categoryId, "B");
  assertEquals(enriched.subcategory, "client_presentation");
});

// ── Spec Part 8 — Plan Logic Arcs ──────────────────────────────────

function isoRange(
  startISO: string,
  durationMin: number,
): { start_time: string; end_time: string } {
  const start = new Date(startISO);
  const end = new Date(start.getTime() + durationMin * 60_000);
  return { start_time: start.toISOString(), end_time: end.toISOString() };
}

Deno.test("arc: 12h flight → pre-during-post (full arc)", () => {
  const enriched = enrichEvent({
    title: "Flight LHR → SFO",
    ...isoRange("2026-08-01T10:00:00Z", 720),
  });
  assertEquals(enriched.subcategory, "flight");
  assertEquals(enriched.travelArc, "pre-during-post");
});

Deno.test("arc: 2h flight → pre-post", () => {
  const enriched = enrichEvent({
    title: "Flight LHR → BCN",
    ...isoRange("2026-08-01T10:00:00Z", 120),
  });
  assertEquals(enriched.subcategory, "flight");
  assertEquals(enriched.travelArc, "pre-post");
});

Deno.test("arc: long-haul explicit → pre-during-post regardless of duration", () => {
  const enriched = enrichEvent({ title: "Red-eye overnight flight" });
  assertEquals(enriched.subcategory, "flight");
  assertEquals(enriched.travelArc, "pre-during-post");
});

Deno.test("arc: non-flight event → travelArc is null", () => {
  const enriched = enrichEvent({ title: "Coffee with Alex" });
  assertEquals(enriched.travelArc, null);
});

Deno.test("arc: deep work block → subcategory 'deep_work', travelArc null", () => {
  const enriched = enrichEvent({ title: "Deep work — spec drafting" });
  assertEquals(enriched.categoryId, "E");
  assertEquals(enriched.subcategory, "deep_work");
  assertEquals(enriched.travelArc, null);
});

Deno.test("arc: passive learning webinar → travelArc null (Plan will skip arc)", () => {
  const enriched = enrichEvent({
    title: "Webinar — Assumptions of resilience",
  });
  assertEquals(enriched.subcategory, "learning");
  assertEquals(enriched.travelArc, null);
});

// ── Regression guardrails ──────────────────────────────────────────

Deno.test("guardrail: 'Board Meeting' still routes to gov.board_meeting", () => {
  const enriched = enrichEvent({ title: "Q3 Board Meeting" });
  assertEquals(enriched.subtype?.id, "gov.board_meeting");
});

Deno.test("guardrail: v2 additive rows do not shadow existing dictionary hits", () => {
  // pto keyword 'holiday' must still hit rhy.pto when not qualified as bank/public.
  const enriched = enrichEvent({ title: "Summer holiday — OOO" });
  assertEquals(enriched.categoryId, "H");
  assertEquals(enriched.subcategory, "pto");
});

Deno.test("subcategoryFromSubtypeId derives correctly", () => {
  assertEquals(subcategoryFromSubtypeId("str.deep_work"), "deep_work");
  assertEquals(subcategoryFromSubtypeId("trv.long_haul"), "flight");
  assertEquals(
    subcategoryFromSubtypeId("vis.stakeholder_comm"),
    "stakeholder_communication",
  );
  assertEquals(subcategoryFromSubtypeId(null), null);
  assertEquals(subcategoryFromSubtypeId("unqualified"), "unqualified");
});
