import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { PROTOCOL_COMBOS } from "../protocols/protocol-combos.ts";
import {
  EVENT_PHASE_MAP,
  phaseForEvent,
  protocolsForEvent,
} from "./event-phase-map.ts";

Deno.test("protocolsForEvent resolves PRE combo for Board", () => {
  const pre = protocolsForEvent("Q2 Board Review", "pre");
  assertEquals(pre?.protocol, "somatic");
  assertEquals(pre?.mode, "flow");
});

Deno.test("protocolsForEvent returns null for unknown title", () => {
  assertEquals(protocolsForEvent("Random stuff", "pre"), null);
});

Deno.test("every phase combo resolves to a known ProtocolCombo", () => {
  for (const cat of Object.values(EVENT_PHASE_MAP)) {
    for (const ph of Object.values(cat)) {
      assert(PROTOCOL_COMBOS[ph.combo], `unknown combo: ${ph.combo}`);
    }
  }
});

Deno.test("every phase carries goal + at least one prevents/builds bullet", () => {
  for (const cat of Object.values(EVENT_PHASE_MAP)) {
    for (const ph of Object.values(cat)) {
      assert(ph.goal.length > 0, "missing goal");
      assert(ph.preventsBuilds.length > 0, "missing preventsBuilds");
    }
  }
});

Deno.test("phaseForEvent returns enriched record with resolvedCombo", () => {
  const post = phaseForEvent("Keynote at Money2020", "post");
  assert(post);
  assertEquals(post.combo, "somatic.pause");
  assertEquals(post.resolvedCombo.protocol, "somatic");
  assertEquals(post.resolvedCombo.mode, "pause");
  assert(post.preventsBuilds.length > 0);
});