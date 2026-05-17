import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { EVENT_CATEGORIES } from "./event-categories.ts";
import { EVENT_TYPES } from "./event-subtypes.ts";
import { EVENT_PHASE_MAP } from "./event-phase-map.ts";
import { PROTOCOL_COMBOS } from "../protocols/protocol-combos.ts";

Deno.test("every subtype categoryId resolves to a known EVENT_CATEGORY", () => {
  for (const et of EVENT_TYPES) {
    assert(EVENT_CATEGORIES[et.categoryId], `${et.id} → unknown category ${et.categoryId}`);
    assert(et.frameworkPillar === et.categoryId, `${et.id} frameworkPillar drift`);
  }
});

Deno.test("every EVENT_PHASE_MAP id matches a category, combo resolves", () => {
  for (const [catId, phases] of Object.entries(EVENT_PHASE_MAP)) {
    assert(EVENT_CATEGORIES[catId as keyof typeof EVENT_CATEGORIES], `phase map id ${catId} not in categories`);
    for (const [phase, ph] of Object.entries(phases)) {
      assert(PROTOCOL_COMBOS[ph.combo], `${catId}.${phase} combo ${ph.combo} unknown`);
    }
  }
});

Deno.test("every subtype's bucket equals its category name (§3 inventory alignment)", () => {
  for (const et of EVENT_TYPES) {
    const cat = EVENT_CATEGORIES[et.categoryId];
    assert(cat, `${et.id} unknown categoryId`);
    assert(
      et.bucket === cat.name,
      `${et.id} bucket "${et.bucket}" ≠ category.name "${cat.name}" — §3 drift`,
    );
  }
});

Deno.test("every category exposes a non-empty §3 triggers inventory", () => {
  for (const cat of Object.values(EVENT_CATEGORIES)) {
    assert(cat.triggers.length >= 6, `${cat.id} triggers list too short`);
  }
});
