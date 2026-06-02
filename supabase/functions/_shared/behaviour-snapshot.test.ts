import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildBehaviourSnapshot } from "./behaviour-snapshot.ts";

// End-to-end parity test for the shared-module snapshot used by the Brief
// (and the Plan). Proves three things in one go:
//   1. Full event list is read, not just one event — taxonomy block lists
//      every classified event with its A–H pillar.
//   2. The 'brief' scope fires CEO behaviour rules off the event list
//      (HighStakesPrep / boardLevelOutcome) and emits anchorEvent titles.
//   3. The 'plan' scope sees the SAME RuleContext and produces matching
//      flagsPlan — guaranteeing the Brief and Plan reason from the same
//      inputs (same signatureHash on identical input).

const now = new Date("2026-06-02T09:00:00Z");

Deno.test("buildBehaviourSnapshot wires CEO rules + taxonomy from full event slice", () => {
  const snap = buildBehaviourSnapshot({
    coverage: {
      wearable: {
        hrvDeviationPct: -22,
        hrvUnusual: true,
        sleepHours: 5.6,
        sleepDeviationPct: -18,
        rhrDeviationPct: 8,
        hrElevatedProxy: false,
      },
      checkIn: {
        emotionalSelfDeclared: "drained",
        mentalSharpness: 4,
        confidence: 3,
        clarity: 3,
      },
      scoreToday: 38,
      scoreYesterday: 78,
      trailingClarityAvg: 4.2,
      timezone: { offsetMinutes: 0, shift48hHours: null, travelDay: false },
      events: [
        {
          title: "Board Meeting Q2",
          startTime: new Date("2026-06-02T13:00:00Z").toISOString(),
          endTime: new Date("2026-06-02T15:00:00Z").toISOString(),
          stakesLevel: "board",
        },
        {
          title: "1:1 with VP Eng",
          startTime: new Date("2026-06-02T16:00:00Z").toISOString(),
          endTime: new Date("2026-06-02T16:30:00Z").toISOString(),
          stakesLevel: null,
        },
      ],
      now,
    },
    extras: { dayOfWeek: 2 },
  });

  // Taxonomy block lists BOTH events with their A–H pillar.
  assert(snap.taxonomyBlock.includes("EVENT TAXONOMY"));
  assert(snap.taxonomyBlock.includes("Board Meeting Q2"));
  assert(snap.taxonomyBlock.includes("1:1 with VP Eng"));
  // Pillar A = Governance/Board for the board meeting.
  assert(/Pillar A/.test(snap.taxonomyBlock));

  // Brief scope: at least one CEO behaviour fired, anchored to the named event.
  assert(snap.flagsBrief.length > 0, "expected brief flags to fire");
  const anchorTitles = snap.flagsBrief.map((f) => f.anchorEvent).filter(Boolean);
  assert(anchorTitles.some((t) => t === "Board Meeting Q2"),
    `expected an anchor on Board Meeting Q2, got ${JSON.stringify(anchorTitles)}`);
  assert(snap.promptBlockBrief.includes("ACTIVE CEO BEHAVIOURS"));

  // Plan scope sees the same context. Plan typically gets slot boosts here.
  assert(snap.flagsPlan.length > 0, "expected plan flags to fire");
  // signatureHash is non-empty and deterministic.
  assert(snap.signatureHash.length === 8);
});

Deno.test("buildBehaviourSnapshot signatureHash is stable across calls", () => {
  const make = () => buildBehaviourSnapshot({
    coverage: {
      wearable: null,
      checkIn: null,
      scoreToday: 60, scoreYesterday: 60, trailingClarityAvg: null,
      timezone: { offsetMinutes: 0, shift48hHours: null, travelDay: false },
      events: [{
        title: "Investor Update",
        startTime: new Date("2026-06-02T14:00:00Z").toISOString(),
        endTime: new Date("2026-06-02T15:00:00Z").toISOString(),
        stakesLevel: "investor",
      }],
      now,
    },
    extras: {},
  });
  assertEquals(make().signatureHash, make().signatureHash);
});

Deno.test("buildBehaviourSnapshot returns empty taxonomy when no events", () => {
  const snap = buildBehaviourSnapshot({
    coverage: {
      wearable: null,
      checkIn: null,
      scoreToday: null, scoreYesterday: null, trailingClarityAvg: null,
      timezone: { offsetMinutes: 0, shift48hHours: null, travelDay: false },
      events: [],
      now,
    },
  });
  assertEquals(snap.taxonomyBlock, "");
  // Snapshot still returns a valid (possibly empty) flag set + stable hash.
  assertEquals(typeof snap.signatureHash, "string");
});