# Travel-day: e2e tests, deterministic fallback, provenance logging

Backend only — edge functions, shared modules and tests. No UI, no component or styling changes, no schema changes.

The uploaded reference implementation (`derive-travel-day.ts`, `types.ts`, `brief-builders.ts`, `plan-builders.ts`) describes the right *contract*, but it assumes module and table names this project does not have: the real code lives in `_shared/travel/hydrate-travel-day.ts` (which already contains both the pure `deriveTravelDay` and the DB `hydrateTravelDay`), `_shared/travel/travel-day.ts`, `_shared/travel/freshness.ts`, the real table `travel_state`, and real builders `buildBehaviourSnapshot` (`_shared/behaviour-snapshot.ts`), `buildDeterministicBriefFallback` (`_shared/brief/deterministic-brief.ts`), `deriveStructuralDayFlags` / `generatePlanBrief` (`generate-mastery-plan/index.ts`). We extend those existing, already-wired modules in place — no new `types.ts`, no `derive-travel-day.ts`, no `brief-builders.ts` / `plan-builders.ts` stubs, no duplicate SSOT. The only new files are the two e2e test files.

## 1. Deterministic evidence ladder + fallback (`_shared/travel/hydrate-travel-day.ts`)

- Add an additive `evidence: "timezone" | "distance" | "state" | "none"` field to `TravelDayHydration`. No consumer signature changes.
- Make the ladder explicit and total, in fixed priority: timezone change → fresh distance > 50 km → persisted state machine → false.
- Sanitise before deciding: non-finite, non-numeric or negative `distance_from_home_km` is normalised to `null` (never read as 0 km); a missing or malformed timezone (validated with `Intl.DateTimeFormat`) can never produce `timezoneChanged: true`.
- `no_row` and `hydration_failed` both fail open to `{ travelDay: false, evidence: "none" }` with distinct `reason` values so logs stay actionable. Allocation is unaffected: Plan's `hasTravelDay` falls back to its existing calendar-category-G detection.
- Keep the existing thresholds and `freshness.ts` windows — the reference's 6 h / 24 h numbers do not replace the project's `LOCATION_FRESH_HOURS` / `STATE_CHANGE_FRESH_DAYS`.

## 2. Structured provenance log

- Extend the single `[travel-state][consumer]` line to carry inputs *and* verdict:
  `{ fn, userIdHash, inputs: { distanceKm, state, homeTz, currentTz, timezoneChanged, lastLocationAt, lastStateChangeAt, locationAgeHours, stateAgeHours }, verdict: { travelDay, reason, evidence, freshness, used } }`
- `userIdHash` uses the project's existing `_shared/identity/redact-user-id.ts` rather than a new djb2 helper. No coordinates are ever logged — distance only.
- Export `logTravelDayProvenance(result, inputs, { fn, userId })` so Smart Nudges (which calls the pure `deriveTravelDay` on an already-fetched row) emits the identical shape.

## 3. End-to-end tests that prove the verdict changes output

- `supabase/functions/_shared/travel/travel-day-brief-e2e.test.ts` — drives the real `buildBehaviourSnapshot` and `buildDeterministicBriefFallback` with identical wearable/check-in/event fixtures, `travelDay` false vs true, asserting travel behaviours and travel framing appear only on the travel path. Includes the domestic regression: no flight-titled event, unchanged timezone, 120 km fresh fix → `evidence: "distance"` → travel framing still fires.
- `supabase/functions/generate-mastery-plan/travel-day-plan-e2e.test.ts` — drives the real `deriveStructuralDayFlags` (`travelDaySignal`) and `generatePlanBrief`, asserting `hasTravelDay` flips on each evidence rung independently, week-ahead mode follows, and plan copy differs only on the travel path.
- Both files chain from `deriveTravelDay` output, never hardcoded booleans, so hydrator drift breaks them.
- Extend `hydrate-travel-day.test.ts` with the sanitisation, fallback and provenance cases (NaN/Infinity/negative distance, malformed tz, missing row, DB throw, one log line per call).

## Verification

- `deno test` on `_shared/travel/`, the two new e2e files, and the existing Smart Nudges suite — all green.
- `deno check` on the hydrator plus `compute-outer-readiness`, `generate-mastery-plan`, `smart-nudges`.
- Deploy the three functions and confirm one `[travel-state][consumer]` line per surface with matching `verdict.travelDay` / `verdict.evidence` for the same user.

## Not in scope

No UI or frontend changes. No copy rewrites, no schema or table changes, no change to the 50 km threshold or the travel state machine.
