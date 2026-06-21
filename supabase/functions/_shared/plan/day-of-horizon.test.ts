import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DAY_OF_HORIZON_MS,
  isWithinDayOfHorizon,
  gateDayOfAnchor,
} from "./day-of-horizon.ts";

const NOW = new Date("2026-06-20T20:00:00Z").getTime(); // Saturday evening

Deno.test("isWithinDayOfHorizon — event 3h away is within 24h", () => {
  const ev = { startTime: new Date(NOW + 3 * 3600_000).toISOString() };
  assertEquals(isWithinDayOfHorizon(ev, NOW), true);
});

Deno.test("isWithinDayOfHorizon — event 25h away is outside 24h", () => {
  const ev = { startTime: new Date(NOW + 25 * 3600_000).toISOString() };
  assertEquals(isWithinDayOfHorizon(ev, NOW), false);
});

Deno.test("isWithinDayOfHorizon — null event is outside", () => {
  assertEquals(isWithinDayOfHorizon(null, NOW), false);
});

Deno.test("gateDayOfAnchor — strips title+id when day-of and >24h", () => {
  const ev = { startTime: new Date(NOW + 36 * 3600_000).toISOString() };
  const slot = { eventId: "evt-1", eventTitle: "AI for Climate: Who Benefits" };
  gateDayOfAnchor(slot, ev, NOW, /* weekAheadActive */ false);
  assertEquals(slot.eventId, null);
  assertEquals(slot.eventTitle, null);
});

Deno.test("gateDayOfAnchor — keeps named anchor when week-ahead active", () => {
  const ev = { startTime: new Date(NOW + 5 * 24 * 3600_000).toISOString() };
  const slot = { eventId: "evt-2", eventTitle: "Board meeting" };
  gateDayOfAnchor(slot, ev, NOW, /* weekAheadActive */ true);
  assertEquals(slot.eventId, "evt-2");
  assertEquals(slot.eventTitle, "Board meeting");
});

Deno.test("gateDayOfAnchor — keeps named anchor when day-of and within 24h", () => {
  const ev = { startTime: new Date(NOW + 6 * 3600_000).toISOString() };
  const slot = { eventId: "evt-3", eventTitle: "Investor call" };
  gateDayOfAnchor(slot, ev, NOW, /* weekAheadActive */ false);
  assertEquals(slot.eventId, "evt-3");
  assertEquals(slot.eventTitle, "Investor call");
});

Deno.test("default horizon constant is 24h in ms", () => {
  assertEquals(DAY_OF_HORIZON_MS, 86_400_000);
});