// Guards the Load Shape EventSubcategory union against drift from the
// canonical A–H subtype table. Every subcategory string here must be
// reachable from resolveEvent()/enrichEvent() output — otherwise the
// classifier could be fed a value the resolver never produces.

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { EVENT_TYPES } from "../events/event-subtypes.ts";
import { subcategoryFromSubtypeId } from "../events/enrich-event.ts";

// Mirror of the EventSubcategory union in ./types.ts (compile-time union
// members cannot be enumerated at runtime, so this list is asserted
// against the subtype table below and against types.ts textually).
const SUBCATEGORIES = [
  "A",
  "A.trustee",
  "A.strategy",
  "B",
  "B.client_presentation",
  "B.pitch_competitive",
  "C",
  "C.speaking",
  "C.stakeholder_communication",
  "C.media",
  "C.roundtable",
  "C.town_hall",
  "D",
  "D.difficult_conversation",
  "D.hiring_interview",
  "D.crisis_decision",
  "E.routine_sync",
  "E.deep_work",
  "E.learning",
  "E.community",
  "E.review",
  "E.compliance",
  "F",
  "F.workshop",
  "F.event",
  "G.flight",
  "G.accommodation",
  "G.travel_day",
  "H.wellness_fitness",
  "H.wellness_self_care",
  "H.wellness_health_check",
  "H.wellness_medical",
  "H.social",
  "H.family",
  "H.holiday",
  "H.pto",
  "H.recreation",
];

Deno.test("the subcategory list matches the EventSubcategory union in types.ts", async () => {
  const src = await Deno.readTextFile(new URL("./types.ts", import.meta.url));
  const block = src.slice(
    src.indexOf("export type EventSubcategory ="),
    src.indexOf('| "H.recreation";') + 20,
  );
  const declared = [...block.matchAll(/\|\s*"([^"]+)"/g)].map((m) => m[1]);
  assert(declared.length === SUBCATEGORIES.length, `types.ts declares ${declared.length} subcategories, list has ${SUBCATEGORIES.length}`);
  for (const s of SUBCATEGORIES) {
    assert(declared.includes(s), `types.ts is missing subcategory "${s}"`);
  }
});

Deno.test("every subcategory is reachable from the canonical subtype table", () => {
  const reachable = new Set<string>();
  for (const t of EVENT_TYPES) {
    const sub = subcategoryFromSubtypeId(t.id);
    if (sub) reachable.add(`${t.categoryId}.${sub}`);
    reachable.add(t.categoryId);
  }
  const missing = SUBCATEGORIES.filter((s) => !reachable.has(s));
  assert(
    missing.length === 0,
    `subcategories not produced by any subtype: ${missing.join(", ")}`,
  );
});
