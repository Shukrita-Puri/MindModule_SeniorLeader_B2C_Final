import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildWhyEvidence, composeEvidenceWhyLine } from "./why-signals.ts";

const EMPTY_IMMEDIATE = {
  hrvDeltaPct: null,
  sleepScore: null,
  restingHR: null,
  restingHRBaseline: null,
  backToBackCount: null,
  clarity: null,
  bodyState: null,
  travelDebtActive: null,
};

const base = (over: Record<string, unknown> = {}) => ({
  anchor: {
    eventTitle: null,
    categoryId: null,
    patternBucket: null,
    phase: null,
  },
  timeOfDay: "morning" as const,
  signalSummary: null,
  immediate: { ...EMPTY_IMMEDIATE },
  strategic: null,
  behavioural: null,
  ...over,
});

Deno.test("quiet day after a high-stakes run is justified by the run, not the calendar", () => {
  const bundle = buildWhyEvidence(base({
    load: {
      highStakesDaysLast7: 3,
      priorHighStakesRunDays: 3,
      meetingsToday: 1,
      nextHighStakes: null,
      dayShapeId: null,
    },
  }) as any);
  assert(bundle.top);
  assertStringIncludes(bundle.top!.phrase, "3 high-stakes days back-to-back");
  assertEquals(bundle.coldStart, false);
  assert(
    !composeEvidenceWhyLine(bundle, { anchorTitle: null, timeOfDay: "morning" })
      .startsWith("Early days"),
  );
});

Deno.test("a high-stakes week alone grounds the line when there is no run", () => {
  const bundle = buildWhyEvidence(base({
    load: {
      highStakesDaysLast7: 4,
      priorHighStakesRunDays: 1,
      meetingsToday: 0,
      nextHighStakes: null,
      dayShapeId: null,
    },
  }) as any);
  assertStringIncludes(bundle.top!.phrase, "of your last seven days");
});

Deno.test("upcoming high-stakes event is named with an honest horizon", () => {
  const bundle = buildWhyEvidence(base({
    load: {
      highStakesDaysLast7: 0,
      priorHighStakesRunDays: 0,
      meetingsToday: 2,
      nextHighStakes: { title: "Mind Module introductions", hoursUntil: 5 },
      dayShapeId: null,
    },
  }) as any);
  assertStringIncludes(bundle.top!.phrase, "Mind Module introductions");
  assertStringIncludes(bundle.top!.phrase, "later today");
});

Deno.test("no load context at all still degrades to the previous behaviour", () => {
  const bundle = buildWhyEvidence(base() as any);
  assertEquals(bundle.top, null);
  assertEquals(
    composeEvidenceWhyLine(bundle, { anchorTitle: null, timeOfDay: "morning" }),
    "Early days — this is the base your harder weeks run on.",
  );
});

Deno.test("HRV present but flat yields an honest baseline reading instead of nothing", () => {
  const bundle = buildWhyEvidence(base({
    immediate: { ...EMPTY_IMMEDIATE, hrvDeltaPct: -2 },
  }) as any);
  assertStringIncludes(bundle.top!.phrase, "at your own baseline");
});

Deno.test("sleep stays optional — a null sleep score never blocks evidence", () => {
  const bundle = buildWhyEvidence(base({
    immediate: { ...EMPTY_IMMEDIATE, hrvDeltaPct: -14, sleepScore: null },
  }) as any);
  assertStringIncludes(bundle.top!.phrase, "below your own baseline");
});
