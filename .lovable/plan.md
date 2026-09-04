# Travel-day launch hardening: evidence ladder, deterministic fallback, provenance

Backend only — shared edge modules, edge functions and Deno tests. No UI, no copy rewrites, no schema changes. Scoped to what must be true for travel days to behave correctly at launch.

## Reuse, don't recreate

The uploaded reference files (`derive-travel-day.ts`, `types.ts`, `brief-builders.ts`, `plan-builders.ts`) describe the right contract but assume modules and a table (`user_travel_state`) this project does not have. Everything already exists and is wired:

| Concern | Existing module (extend in place) |
|---|---|
| Pure verdict + DB hydration | `_shared/travel/hydrate-travel-day.ts` (`deriveTravelDay`, `hydrateTravelDay`) |
| Distance/state SSOT + 50 km threshold | `_shared/travel/travel-day.ts` |
| Staleness windows | `_shared/travel/freshness.ts` |
| Brief behaviour + framing | `_shared/behaviour-snapshot.ts`, `_shared/brief/deterministic-brief.ts`, `_shared/brief-signal-coverage.ts` |
| Plan structural flags + copy | `generate-mastery-plan/index.ts` (`deriveStructuralDayFlags`, `generatePlanBrief`) |
| User-id redaction for logs | `_shared/identity/redact-user-id.ts` |

No new `types.ts`, no `derive-travel-day.ts`, no builder stubs, no duplicate SSOT. The only new files are two test files.

## 1. Deterministic fallback (launch-critical)

In `_shared/travel/hydrate-travel-day.ts`:

- Sanitise inputs before deciding: `distance_from_home_km` that is non-numeric, NaN, Infinity or negative becomes `null` (never read as 0 km, which would silently mean "at home"); a missing or malformed timezone (validated with `Intl.DateTimeFormat`) can never yield `timezoneChanged: true`.
- Make the ladder explicit and total: timezone change → fresh distance > 50 km → persisted state machine → false. Add an additive `evidence: "timezone" | "distance" | "state" | "none"` field; no consumer signature changes.
- `no_row` and `hydration_failed` both fail open to `{ travelDay: false, evidence: "none" }` with distinct `reason` strings. Consumers are unaffected: Plan's `hasTravelDay` falls back to its existing calendar-category-G detection and slot allocation is unchanged.
- Keep the project's existing thresholds (`TRAVEL_DAY_THRESHOLD_KM`, `LOCATION_FRESH_HOURS`, `STATE_CHANGE_FRESH_DAYS`) — the reference's 6 h / 24 h numbers are not adopted.

## 2. Provenance logging (launch-critical for production debugging)

- Extend the single `[travel-state][consumer]` line to carry inputs and verdict:
  `{ fn, userIdHash, inputs: { distanceKm, state, homeTz, currentTz, timezoneChanged, lastLocationAt, lastStateChangeAt, locationAgeHours, stateAgeHours }, verdict: { travelDay, reason, evidence, freshness, used } }`
- `userIdHash` uses the existing `redactUserId` helper. Distance only — no coordinates, ever.
- Export `logTravelDayProvenance(result, inputs, { fn, userId })` so Smart Nudges (which calls the pure path on an already-fetched row) emits the identical shape. One line per surface per run.

## 3. Tests that prove the verdict changes output

- `supabase/functions/_shared/travel/travel-day-brief-e2e.test.ts` — real `buildBehaviourSnapshot` + `buildDeterministicBriefFallback`, identical fixtures, travel false vs true; travel behaviours and travel framing appear only on the travel path. Includes the domestic regression guard: no flight-titled event, unchanged timezone, fresh 120 km fix → `evidence: "distance"` → travel framing still fires.
- `supabase/functions/generate-mastery-plan/travel-day-plan-e2e.test.ts` — real `deriveStructuralDayFlags` + `generatePlanBrief`; `hasTravelDay` flips on each evidence rung independently, week-ahead mode follows, plan copy differs only on travel.
- Both chain from `deriveTravelDay` output rather than hardcoded booleans, so hydrator drift breaks them.
- Extend `hydrate-travel-day.test.ts` with the sanitisation, fail-open and single-log-line cases.

## Verification

- `deno test` on `_shared/travel/`, the two new files, and the existing Smart Nudges suite — all green.
- `deno check` on the hydrator plus `compute-outer-readiness`, `generate-mastery-plan`, `smart-nudges`.
- Deploy the three functions; confirm one `[travel-state][consumer]` line per surface with matching `verdict.travelDay` / `verdict.evidence` for the same user.

## Explicitly not in scope

UI or frontend changes, new copy, schema or table changes, threshold changes, and any rework of the travel state machine or `persist-travel-location` / `travel-state-sync` producers.
