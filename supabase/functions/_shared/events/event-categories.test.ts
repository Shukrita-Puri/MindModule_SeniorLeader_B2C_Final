import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyEvent, EVENT_CATEGORIES } from "./event-categories.ts";

Deno.test("classifyEvent maps canonical titles to categories", () => {
  assertEquals(classifyEvent("Q2 Board Review"), "A");
  assertEquals(classifyEvent("1:1 with Sara"), "B");
  assertEquals(classifyEvent("Term sheet negotiation"), "C");
  assertEquals(classifyEvent("Keynote at Money2020"), "D");
  assertEquals(classifyEvent("Deep work block"), "E");
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

Deno.test("EVENT_CATEGORIES covers all eight pillars A–H", () => {
  assertEquals(Object.keys(EVENT_CATEGORIES).sort().join(""), "ABCDEFGH");
});