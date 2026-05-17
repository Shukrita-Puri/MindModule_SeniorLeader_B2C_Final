import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  comboFor,
  PRACTICE_TYPE_TO_COMBO,
  PROTOCOL_COMBOS,
} from "./protocol-combos.ts";

Deno.test("PROTOCOL_COMBOS has all six combinations", () => {
  assertEquals(Object.keys(PROTOCOL_COMBOS).length, 6);
});

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