import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  applyEventPriorityMemory,
  indexPriorityMemory,
  normalizeEventTitleMemoryKey,
  TITLE_SPECIFIC_MEMORY_CATEGORY,
} from "./event-priority-memory.ts";

const now = new Date("2026-06-07T12:00:00Z");
const daysAgo = (n: number) =>
  new Date(now.getTime() - n * 86400_000).toISOString();

Deno.test("priority signals boost", () => {
  const idx = indexPriorityMemory([
    { event_category: "exec", event_type_key: "board", signal: "priority", occurred_at: daysAgo(5) },
    { event_category: "exec", event_type_key: "board", signal: "priority", occurred_at: daysAgo(20) },
  ]);
  const r = applyEventPriorityMemory(idx, { eventCategory: "exec", eventTypeKey: "board", now });
  assertEquals(r.delta, 20);
  assertEquals(r.hardDemote, false);
  assertEquals(r.priorityCount, 2);
  assertEquals(r.hasPriorDayPriority, true);
});

// ── hasPriorDayPriority: "prior" means UTC calendar date < today ──────
// A single tap made on today's calendar date is a PRESENT signal and must
// not be labeled as "prior" — even though it contributes +10 to delta.

Deno.test("hasPriorDayPriority: single priority row from today → false", () => {
  const today = new Date("2026-06-07T09:00:00Z");
  const idx = indexPriorityMemory([
    { event_category: "exec", event_type_key: "board", signal: "priority",
      occurred_at: new Date("2026-06-07T04:00:00Z").toISOString() },
  ]);
  const r = applyEventPriorityMemory(idx, { eventCategory: "exec", eventTypeKey: "board", now: today });
  assertEquals(r.delta, 10);
  assertEquals(r.priorityCount, 1);
  assertEquals(r.hasPriorDayPriority, false);
});

Deno.test("hasPriorDayPriority: single priority row from yesterday → true", () => {
  const today = new Date("2026-06-07T09:00:00Z");
  const idx = indexPriorityMemory([
    { event_category: "exec", event_type_key: "board", signal: "priority",
      occurred_at: new Date("2026-06-06T23:30:00Z").toISOString() },
  ]);
  const r = applyEventPriorityMemory(idx, { eventCategory: "exec", eventTypeKey: "board", now: today });
  assertEquals(r.hasPriorDayPriority, true);
});

Deno.test("hasPriorDayPriority: mix of today + yesterday → true", () => {
  const today = new Date("2026-06-07T09:00:00Z");
  const idx = indexPriorityMemory([
    { event_category: "exec", event_type_key: "board", signal: "priority",
      occurred_at: new Date("2026-06-07T08:00:00Z").toISOString() },
    { event_category: "exec", event_type_key: "board", signal: "priority",
      occurred_at: new Date("2026-06-06T10:00:00Z").toISOString() },
  ]);
  const r = applyEventPriorityMemory(idx, { eventCategory: "exec", eventTypeKey: "board", now: today });
  assertEquals(r.priorityCount, 2);
  assertEquals(r.hasPriorDayPriority, true);
});

Deno.test("hasPriorDayPriority: no rows → false with priorityCount 0", () => {
  const idx = indexPriorityMemory([]);
  const r = applyEventPriorityMemory(idx, { eventCategory: "exec", eventTypeKey: "board", now });
  assertEquals(r.priorityCount, 0);
  assertEquals(r.hasPriorDayPriority, false);
});

Deno.test("hasPriorDayPriority: rows older than 60d don't count (delta=0)", () => {
  const idx = indexPriorityMemory([
    { event_category: "exec", event_type_key: "board", signal: "priority", occurred_at: daysAgo(90) },
  ]);
  const r = applyEventPriorityMemory(idx, { eventCategory: "exec", eventTypeKey: "board", now });
  assertEquals(r.delta, 0);
  assertEquals(r.priorityCount, 0);
  assertEquals(r.hasPriorDayPriority, false);
});

Deno.test("never hard demotes", () => {
  const idx = indexPriorityMemory([
    { event_category: "exec", event_type_key: "town", signal: "never", occurred_at: daysAgo(2) },
  ]);
  const r = applyEventPriorityMemory(idx, { eventCategory: "exec", eventTypeKey: "town", now });
  assertEquals(r.hardDemote, true);
});

Deno.test("not_this_week decays after 14d", () => {
  const idx = indexPriorityMemory([
    { event_category: "exec", event_type_key: "sync", signal: "not_this_week", occurred_at: daysAgo(30) },
  ]);
  const r = applyEventPriorityMemory(idx, { eventCategory: "exec", eventTypeKey: "sync", now });
  assertEquals(r.delta, 0);
});

Deno.test("delta clamps to [-50, +30]", () => {
  const idx = indexPriorityMemory(
    Array.from({ length: 10 }, () => ({
      event_category: "exec",
      event_type_key: "board",
      signal: "priority" as const,
      occurred_at: daysAgo(1),
    })),
  );
  const r = applyEventPriorityMemory(idx, { eventCategory: "exec", eventTypeKey: "board", now });
  assertEquals(r.delta, 30);
});

Deno.test("post_plan_feedback priority signal is read identically", () => {
  // The memory loader stores only (category, type_key, signal, occurred_at).
  // Source is intentionally dropped — every priority signal regardless of
  // origin (week_ahead_picker, priority_tag, post_plan_feedback) contributes
  // +10 within the 60-day window.
  const idx = indexPriorityMemory([
    { event_category: "exec", event_type_key: "board", signal: "priority", occurred_at: daysAgo(3) },
  ]);
  const r = applyEventPriorityMemory(idx, { eventCategory: "exec", eventTypeKey: "board", now });
  assertEquals(r.delta, 10);
  assertEquals(r.hardDemote, false);
  assertEquals(r.reasons.includes("prior priority ×1"), true);
});

Deno.test("title-specific never signal hard-demotes exact title key", () => {
  const titleKey = normalizeEventTitleMemoryKey("Chief AI Thursday — Prep/Readout!");
  assertEquals(titleKey, "chief_ai_thursday_prep_readout");
  const idx = indexPriorityMemory([
    {
      event_category: TITLE_SPECIFIC_MEMORY_CATEGORY,
      event_type_key: titleKey,
      signal: "never",
      occurred_at: daysAgo(1),
    },
  ]);
  const r = applyEventPriorityMemory(idx, {
    eventCategory: TITLE_SPECIFIC_MEMORY_CATEGORY,
    eventTypeKey: normalizeEventTitleMemoryKey("Chief AI Thursday Prep Readout"),
    now,
  });
  assertEquals(r.hardDemote, true);
});
