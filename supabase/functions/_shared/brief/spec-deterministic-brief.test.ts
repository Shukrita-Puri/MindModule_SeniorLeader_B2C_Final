import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  __specDeterministicInternals,
  buildSpecDeterministicBrief,
  type SpecDeterministicParams,
} from "./spec-deterministic-brief.ts";

function baseParams(): SpecDeterministicParams {
  return {
    bandValence: "mid",
    timeOfDay: "morning",
    hasWearable: false,
    hrvDeviation: null,
    sleepDuration: null,
    sleepDeviation: null,
    sleepHardFloor: false,
    rhrDeviation: null,
    calendarLoad: null,
    todayHighStakes: [],
    nextHighStakesEvent: null,
    hasBackToBack: false,
    avgScore7d: null,
    scoreTrajectory7d: null,
    hrvEventCorrelation: null,
    checkInOutcome: null,
    clarityLevel: null,
    confidenceLevel: null,
    behaviourFlags: null,
    tomorrowLoad: null,
    tomorrowHighStakesTitles: [],
  };
}

Deno.test("spec deterministic — top signal prefers anchored CEO behaviour + HRV correlation", () => {
  const params = baseParams();
  params.behaviourFlags = [{ anchorEvent: "Board Meeting" }];
  params.todayHighStakes = ["Board Meeting"];
  params.hrvEventCorrelation = "HRV drops avg 18% before board meetings, 5 occurrences";
  assertEquals(__specDeterministicInternals.pickTopSignal(params), "hr_event_correlation");
});

Deno.test("spec deterministic — HRV correlation alone does not outrank a quiet day", () => {
  const params = baseParams();
  params.hrvEventCorrelation = "HRV drops avg 18% before board meetings, 5 occurrences";
  assertEquals(__specDeterministicInternals.pickTopSignal(params), "baseline_quiet");
});

Deno.test("spec deterministic — evening tomorrow-heavy signal reads from tomorrow block", () => {
  const params = baseParams();
  params.timeOfDay = "evening";
  params.tomorrowLoad = "high";
  params.tomorrowHighStakesTitles = ["Board Meeting"];
  const built = buildSpecDeterministicBrief(params)!;
  assertEquals(built.topSignal, "tomorrow_heavy");
  assertStringIncludes(built.body, "Tomorrow");
});
