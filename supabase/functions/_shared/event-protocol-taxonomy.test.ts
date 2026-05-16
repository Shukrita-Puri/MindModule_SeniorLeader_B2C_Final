import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyEvent,
  comboFor,
  PRACTICE_TYPE_TO_COMBO,
  PROTOCOL_COMBOS,
  protocolsForEvent,
} from "./event-protocol-taxonomy.ts";

Deno.test("every legacy practiceType round-trips to a valid ProtocolCombo", () => {
  for (const pt of Object.keys(PRACTICE_TYPE_TO_COMBO) as Array<
    keyof typeof PRACTICE_TYPE_TO_COMBO
  >) {
    const combo = comboFor(pt);
    assert(combo, `comboFor(${pt}) returned null`);
    assertEquals(combo.protocol, PRACTICE_TYPE_TO_COMBO[pt].protocol);
    assertEquals(combo.mode, PRACTICE_TYPE_TO_COMBO[pt].mode);
  }
});

Deno.test("PROTOCOL_COMBOS has all six combinations", () => {
  assertEquals(Object.keys(PROTOCOL_COMBOS).length, 6);
});

Deno.test("classifyEvent maps canonical titles to categories", () => {
  assertEquals(classifyEvent("Q2 Board Review"), "A");
  assertEquals(classifyEvent("1:1 with Sara"), "B");
  assertEquals(classifyEvent("Term sheet negotiation"), "C");
  assertEquals(classifyEvent("Keynote at Money2020"), "D");
  assertEquals(classifyEvent("Deep work — strategy doc"), "E");
  assertEquals(classifyEvent("Flight LHR→JFK"), "F");
  assertEquals(classifyEvent("Weekly team meeting"), "G");
  assertEquals(classifyEvent("Lunch"), "H");
});

Deno.test("classifyEvent honours stakesLevel override", () => {
  assertEquals(classifyEvent("Coffee", "board"), "A");
});

Deno.test("classifyEvent returns null on unknown title", () => {
  assertEquals(classifyEvent("Random stuff"), null);
});

Deno.test("protocolsForEvent resolves PRE combo for Board", () => {
  const pre = protocolsForEvent("Q2 Board Review", "pre");
  assertEquals(pre?.protocol, "somatic");
  assertEquals(pre?.mode, "flow");
});

Deno.test("protocolsForEvent returns null for unknown title", () => {
  assertEquals(protocolsForEvent("Random stuff", "pre"), null);
});