# Travel-day: end-to-end tests, deterministic fallback, richer provenance

The shared hydrator (`_shared/travel/hydrate-travel-day.ts`) already feeds Brief, Mastery Plan and Smart Nudges. Three gaps remain: nothing proves the verdict actually changes Brief/Plan output, the "no GPS, no timezone" path is only implicitly deterministic, and the provenance log records the verdict but not the inputs that produced it.

## 1. End-to-end tests that prove the verdict changes output

Two new test files, driving the real exported builders (no mocks of the decision logic):

- `supabase/functions/_shared/travel/travel-day-brief-e2e.test.ts`
  - Build the same `buildBehaviourSnapshot` coverage input twice — identical wearable/check-in/events, `timezone.travelDay` false vs true (the value the hydrator now ORs in) — and assert the travel-only difference: travel CEO behaviours fire, and `buildDeterministicBriefFallback` emits travel framing in the travel case and none in the control case.
  - A domestic case: no flight-titled event, same timezone, distance 120 km — `deriveTravelDay` returns true and the resulting Brief still carries travel framing, which is the regression this workstream exists to prevent.

- `supabase/functions/generate-mastery-plan/travel-day-plan-e2e.test.ts`
  - `deriveStructuralDayFlags` with the same event list, `travelDaySignal` false vs true, asserting `hasTravelDay` flips and the week-ahead-mode evaluation follows.
  - `generatePlanBrief` control vs travel to assert the plan copy differs on the travel path only.

Both files chain from `deriveTravelDay` output (not hardcoded booleans) so the tests break if the hydrator's semantics drift.

## 2. Deterministic fallback when distance or timezone is missing

Make the current implicit behaviour explicit and total, in `hydrate-travel-day.ts`:

- Add an `evidence` field to `TravelDayHydration`: `"timezone" | "distance" | "state" | "none"` — one named rung of a fixed ladder: timezone change, then a fresh distance fix, then the persisted state machine, then `false`.
- Treat a non-finite / non-numeric `distance_from_home_km` exactly like a missing one (defer to state) rather than reading as 0 km.
- Treat a missing or malformed current timezone as "no timezone evidence" — never as a change.
- `hydration_failed` and `no_row` keep failing open to `travelDay: false`, `evidence: "none"`, so allocation is unaffected: `hasTravelDay` falls back to the existing calendar-category-G detection and slot allocation runs exactly as it does today.

No consumer signature changes; `evidence` is additive.

## 3. Structured logs recording inputs and verdict

Extend the single `[travel-state][consumer]` line emitted by `hydrateTravelDay` to carry the inputs alongside the verdict:

```text
[travel-state][consumer] {
  fn, userIdHash,
  inputs: { distanceKm, state, homeTz, currentTz, timezoneChanged,
            lastLocationAt, lastStateChangeAt, locationAgeHours, stateAgeHours },
  verdict: { travelDay, reason, evidence, freshness, used }
}
```

- `userIdHash` is a short non-reversible hash, not the raw id; no coordinates are logged (distance only).
- Smart Nudges calls the pure `deriveTravelDay`, so it gets a matching `logTravelDayProvenance(result, { fn })` helper exported from the same module — one log shape across all three surfaces.

## Verification

- `deno test` on the travel folder, the two new e2e files, and the existing Smart Nudges suite (73) — all green.
- `deno check` on the hydrator plus `compute-outer-readiness`, `generate-mastery-plan`, `smart-nudges`.
- Deploy the three functions and confirm one `[travel-state][consumer]` line per surface with matching `verdict.travelDay` and `verdict.evidence` for the same user.

## Not in scope

No copy changes, no schema changes, no change to the 50 km threshold or the travel state machine.
