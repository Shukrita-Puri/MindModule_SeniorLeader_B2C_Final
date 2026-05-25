import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CATEGORY_MAX_SLOTS } from "./event-phase-map.ts";

// CATEGORY_MAX_SLOTS is the single source of truth for slot fan-out.
// Any change to these numbers must be paired with intentional review of
// the §4 per-category Pre/During/Post contract.
Deno.test("CATEGORY_MAX_SLOTS — single-slot categories", () => {
  assertEquals(CATEGORY_MAX_SLOTS.B, 1);
  assertEquals(CATEGORY_MAX_SLOTS.C, 1);
  assertEquals(CATEGORY_MAX_SLOTS.E, 1);
  assertEquals(CATEGORY_MAX_SLOTS.H, 1);
});

Deno.test("CATEGORY_MAX_SLOTS — two-slot categories (pre+post)", () => {
  assertEquals(CATEGORY_MAX_SLOTS.A, 2);
  assertEquals(CATEGORY_MAX_SLOTS.D, 2);
});

Deno.test("CATEGORY_MAX_SLOTS — multi-phase categories (travel / multi-day)", () => {
  assertEquals(CATEGORY_MAX_SLOTS.F, 3);
  assertEquals(CATEGORY_MAX_SLOTS.G, 3);
});

// Mirrors the canAnchorAgain helper inside generate-mastery-plan/index.ts.
// Re-implemented here so the rule itself is unit-tested without pulling in
// the full plan resolver.
function canAnchorAgain(slotAnchors: Array<{ eventId: string | null }>, eventId: string, cat: keyof typeof CATEGORY_MAX_SLOTS): boolean {
  const cap = CATEGORY_MAX_SLOTS[cat] ?? 1;
  const used = slotAnchors.filter(a => a.eventId === eventId).length;
  return used < cap;
}

Deno.test("canAnchorAgain — C event blocks second slot reuse", () => {
  const anchors = [{ eventId: "coca-cola" }];
  assertEquals(canAnchorAgain(anchors, "coca-cola", "C"), false);
});

Deno.test("canAnchorAgain — G long-haul allows 3 slots", () => {
  const anchors: Array<{ eventId: string | null }> = [];
  assertEquals(canAnchorAgain(anchors, "flight-1", "G"), true);
  anchors.push({ eventId: "flight-1" });
  assertEquals(canAnchorAgain(anchors, "flight-1", "G"), true);
  anchors.push({ eventId: "flight-1" });
  assertEquals(canAnchorAgain(anchors, "flight-1", "G"), true);
  anchors.push({ eventId: "flight-1" });
  assertEquals(canAnchorAgain(anchors, "flight-1", "G"), false);
});

Deno.test("canAnchorAgain — A high-stakes allows pre+post (2 slots)", () => {
  const anchors: Array<{ eventId: string | null }> = [{ eventId: "board" }];
  assertEquals(canAnchorAgain(anchors, "board", "A"), true);
  anchors.push({ eventId: "board" });
  assertEquals(canAnchorAgain(anchors, "board", "A"), false);
});

Deno.test("canAnchorAgain — null-anchor slots don't count against any event", () => {
  const anchors: Array<{ eventId: string | null }> = [
    { eventId: "coca-cola" },
    { eventId: null },
    { eventId: null },
  ];
  assertEquals(canAnchorAgain(anchors, "coca-cola", "C"), false);
  assertEquals(canAnchorAgain(anchors, "other-event", "C"), true);
});