// Brief↔Plan parity: travelDay & longHaulFlight must self-derive from the
// calendar so pre-flight days (still in home TZ) fire travel rules in Brief.
// Regression guard for the issue where Plan anchored on long-haul travel but
// Brief omitted it entirely.
import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { buildSignalMatrix } from "../brief-signal-coverage.ts";
import { evaluateForScope } from "../behaviour-wiring.ts";

function inHours(now: Date, h: number): string {
  return new Date(now.getTime() + h * 3_600_000).toISOString();
}

Deno.test("travelDay self-derives from a travel-titled event today", () => {
  const now = new Date("2026-06-06T03:30:00Z");
  const events = [
    {
      title: "Flight LHR → JFK",
      startTime: inHours(now, 3),
      endTime: inHours(now, 11), // 8h long-haul
    },
    {
      title: "Pitch Deck - Review (Amazon)",
      startTime: inHours(now, 1.5),
      endTime: inHours(now, 2.5),
    },
  ];
  const matrix = buildSignalMatrix({
    wearable: null,
    checkIn: {},
    scoreToday: null,
    scoreYesterday: null,
    trailingClarityAvg: null,
    // caller (Brief) reports user still in home TZ — pre-flight.
    timezone: { offsetMinutes: 0, shift48hHours: null, travelDay: false },
    events,
    now,
  });

  // travelDay must derive from the calendar shape, not just the TZ delta.
  assertEquals(matrix.travelDay, true, "travelDay must be true on departure day");
  // longHaulFlight must derive from event duration when caller didn't provide it.
  assert(matrix.longHaulFlight, "longHaulFlight should be populated");
  assertEquals(matrix.longHaulFlight!.durationHours, 8);
});

Deno.test("travelPreFlightMandatory fires on a pre-flight day (Brief scope)", () => {
  const now = new Date("2026-06-06T03:30:00Z");
  const result = evaluateForScope(
    {
      wearable: null,
      checkIn: {},
      scoreToday: null,
      scoreYesterday: null,
      trailingClarityAvg: null,
      timezone: { offsetMinutes: 0, shift48hHours: null, travelDay: false },
      events: [
        {
          title: "Flight LHR → JFK",
          startTime: inHours(now, 3),
          endTime: inHours(now, 11),
        },
      ],
      now,
    },
    "brief",
    { dayOfWeek: now.getDay() },
  );
  assert(result, "evaluateForScope returned null");
  const rules = result!.flags.map((f) => f.rule);
  assert(
    rules.includes("travelPreFlightMandatory"),
    `expected travelPreFlightMandatory to fire, got: ${rules.join(",") || "none"}`,
  );
});

Deno.test("no travel event → travelDay stays false, no long-haul derivation", () => {
  const now = new Date("2026-06-06T03:30:00Z");
  const matrix = buildSignalMatrix({
    wearable: null,
    checkIn: {},
    scoreToday: null,
    scoreYesterday: null,
    trailingClarityAvg: null,
    timezone: { offsetMinutes: 0, shift48hHours: null, travelDay: false },
    events: [
      {
        title: "Pitch Deck - Review (Amazon)",
        startTime: inHours(now, 2),
        endTime: inHours(now, 3),
      },
    ],
    now,
  });
  assertEquals(matrix.travelDay, false);
  assertEquals(matrix.longHaulFlight ?? null, null);
});

Deno.test("short-haul travel event → travelDay true, longHaulFlight null", () => {
  const now = new Date("2026-06-06T03:30:00Z");
  const matrix = buildSignalMatrix({
    wearable: null,
    checkIn: {},
    scoreToday: null,
    scoreYesterday: null,
    trailingClarityAvg: null,
    timezone: { offsetMinutes: 0, shift48hHours: null, travelDay: false },
    events: [
      {
        title: "Flight LHR → CDG",
        startTime: inHours(now, 3),
        endTime: inHours(now, 4.5), // 1.5h short-haul
      },
    ],
    now,
  });
  assertEquals(matrix.travelDay, true);
  assertEquals(matrix.longHaulFlight ?? null, null);
});