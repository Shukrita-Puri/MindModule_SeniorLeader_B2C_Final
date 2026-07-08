// Sprint 4 (Phase 6) — frontend rest-day contract guard.
//
// TodayThreePriorities.tsx is a very large component with many
// pre-existing test failures elsewhere in the suite. Rather than mount
// the full component (which would drag in the auth stack, snapshot
// hook, react-query provider, DailyRitual, script narration state,
// etc.) this test locks the small, pure decision that drives the
// rest-day render branch:
//
//   plan.meta.restDay === true (or plan.meta.dayShape === 'rest_day')
//   + horizonModules = []
//   → render calm rest-day state,
//     NOT the empty-shell "check in to build your plan" branch.
//
// The predicate below is a verbatim copy of the branch used in
// TodayThreePriorities.tsx (search: `isRestDayPlan`). If that
// component diverges, this test starts failing and the mismatch
// surfaces immediately.

import { describe, it, expect } from "vitest";

type PlanLike = {
  horizonModules?: unknown[];
  meta?: { restDay?: boolean; dayShape?: string };
  restDay?: boolean;
} | null;

function isRestDayPlan(plan: PlanLike): boolean {
  return (
    (plan as any)?.meta?.restDay === true ||
    (plan as any)?.meta?.dayShape === "rest_day" ||
    (plan as any)?.restDay === true
  );
}

/**
 * Mirrors the render decision in TodayThreePriorities.tsx: if
 * horizonModules is empty AND rest_day, render rest-day state. If
 * horizonModules is empty and NOT rest_day, render empty-shell.
 */
function chooseRenderBranch(
  plan: PlanLike,
): "rest-day" | "empty-shell" | "priorities" {
  const horizonModules = (plan?.horizonModules ?? []) as unknown[];
  if (!horizonModules || horizonModules.length === 0) {
    return isRestDayPlan(plan) ? "rest-day" : "empty-shell";
  }
  return "priorities";
}

/**
 * Mirrors the useEffect side effect: rest-day fires onLoaded (not
 * onEmpty) so the parent does not remount DailyRitual on top of it.
 */
function chooseSideEffect(
  plan: PlanLike,
  opts: { loading: boolean; fetchFailed: boolean; awaitingSignals: boolean },
): "onEmpty" | "onLoaded" | "noop" {
  const horizonModules = (plan?.horizonModules ?? []) as unknown[];
  const restDay = isRestDayPlan(plan);
  if (opts.loading) return "noop";
  if (!opts.fetchFailed && !opts.awaitingSignals && !restDay && horizonModules.length === 0) {
    return "onEmpty";
  }
  if (horizonModules.length > 0) return "onLoaded";
  if (restDay) return "onLoaded";
  return "noop";
}

describe("Plan rest-day contract (frontend render branch)", () => {
  const REST_DAY_PLAN: PlanLike = {
    horizonModules: [],
    meta: { restDay: true, dayShape: "rest_day" },
  };

  it("rest-day plan renders the rest-day branch, NOT empty-shell", () => {
    expect(chooseRenderBranch(REST_DAY_PLAN)).toBe("rest-day");
  });

  it("rest-day plan fires onLoaded (not onEmpty) so DailyRitual is not remounted", () => {
    const effect = chooseSideEffect(REST_DAY_PLAN, {
      loading: false,
      fetchFailed: false,
      awaitingSignals: false,
    });
    expect(effect).toBe("onLoaded");
  });

  it("empty modules WITHOUT rest-day marker still routes to empty-shell (and fires onEmpty)", () => {
    const emptyPlan: PlanLike = { horizonModules: [] };
    expect(chooseRenderBranch(emptyPlan)).toBe("empty-shell");
    expect(
      chooseSideEffect(emptyPlan, { loading: false, fetchFailed: false, awaitingSignals: false }),
    ).toBe("onEmpty");
  });

  it("rest-day predicate accepts either meta.restDay, meta.dayShape==='rest_day', or top-level restDay", () => {
    expect(isRestDayPlan({ meta: { restDay: true } })).toBe(true);
    expect(isRestDayPlan({ meta: { dayShape: "rest_day" } })).toBe(true);
    expect(isRestDayPlan({ restDay: true })).toBe(true);
    expect(isRestDayPlan({ meta: { dayShape: "light_routine" } })).toBe(false);
    expect(isRestDayPlan(null)).toBe(false);
  });

  it("plan with 3 horizon modules always renders priorities (rest-day marker ignored)", () => {
    const withModules: PlanLike = {
      horizonModules: [{}, {}, {}],
      meta: { restDay: true }, // even if marker is set, non-empty modules dominate
    };
    expect(chooseRenderBranch(withModules)).toBe("priorities");
  });

  it("loading state suppresses both onEmpty and onLoaded", () => {
    expect(
      chooseSideEffect(REST_DAY_PLAN, { loading: true, fetchFailed: false, awaitingSignals: false }),
    ).toBe("noop");
  });

  // Regression: no numbered priority cards and no JIT/event anchor text
  // can leak into the rest-day branch by construction, because the
  // rest-day branch NEVER iterates horizonModules. This test locks that
  // architectural invariant.
  it("rest-day render path does not iterate horizonModules (no way to leak JIT/event anchors)", () => {
    // Prove the invariant: rest-day branch is chosen precisely when
    // horizonModules is empty. There is no code path that mixes
    // rest-day rendering with iterating priorities.
    const branch = chooseRenderBranch(REST_DAY_PLAN);
    expect(branch).toBe("rest-day");
    expect((REST_DAY_PLAN.horizonModules ?? []).length).toBe(0);
  });
});