# Week-Ahead Plan Surface — Correctness and Resilience Fixes

Intended behaviour is unchanged and confirmed: Week-Ahead is active for the **whole** planning day (Sunday, or Saturday for SA/KW/QA/BH/OM/IL), there is no morning/evening split in the surface, and the Week-Ahead nudge stays evening-only.

## What is wrong today

1. **Home Country is dropped at three of four call sites.** `generate-mastery-plan/index.ts:8221` and `:9456` call `evaluateWeekAheadMode` without `homeCountry`; `PlanPage.tsx:41` and `ExecutiveHome.tsx:71` call `useWeekAheadMode(serverDecision)` without a country for the local fallback. All four silently default to Sunday, so Gulf/Israel users get Sunday from the plan generator and the client fallback while `evaluate-week-ahead-mode` (which does read `profiles.country`) says Saturday.
2. **The evaluator fails authoritative-negative.** Its catch block returns HTTP 200 with `active: false`, and `useWeekAheadMode` treats any boolean `active` from the server as final — so one transient error hides Week-Ahead for the rest of the session.
3. **The decision is fetched once and never revalidated.** `useWeekAheadServerDecision` runs a single `useEffect` keyed only on `manualOverride`: no refetch on focus, on reconnect, or at local midnight. That is why a manual browser refresh was needed to reach Week-Ahead on Sunday.
4. **`profiles.country` is NULL for this account** (`home_timezone: Europe/London`), so Sunday is correct by default rather than because the country is known.

## Changes

### 1. Thread Home Country everywhere
- `generate-mastery-plan/index.ts:8221` — pass `homeCountry` from the locale context already in scope (`opts?.userLocale?.homeCountry`).
- `generate-mastery-plan/index.ts:9456` — pass the resolved profile country for that request; read it alongside the existing profile lookup if it is not already in scope.
- `ExecutiveHome.tsx` and `PlanPage.tsx` — pass the user's country as the second argument to `useWeekAheadMode` so the local fallback matches the server. Reuse profile data already loaded on those pages rather than adding a new fetch.

### 2. Make the evaluator fail-open
- In `evaluate-week-ahead-mode`, the catch block returns `{ weekAheadDecision: null, error: "internal_error" }` instead of `active: false`.
- `useWeekAheadServerDecision` already ignores a decision without a boolean `active`, so the hook stays `null` and `useWeekAheadMode` falls through to the country-aware local heuristic.

### 3. Keep the decision fresh without a manual refresh
- Refetch on window focus and on `visibilitychange` → visible.
- Refetch when the user's local calendar date changes: capture the local `YYYY-MM-DD` at fetch time and re-evaluate when it differs (a low-frequency interval check is sufficient).
- Include the local date in the effect key so a day rollover in an open tab re-evaluates. No tight polling.

### 4. Country data note (no schema change)
`profiles.country` being NULL still falls back to Sunday, which is correct for unknown countries, so no migration is included. Any remaining onboarding country-capture gap is tracked separately.

### 5. Tests
Extend `src/hooks/__tests__/useWeekAheadMode.test.tsx` and add coverage for:
- GB / unknown country: Sunday 08:00 → active `weekly_planning`; Saturday → inactive.
- SA and IL: Saturday → active; Sunday → inactive, with client fallback and server agreeing.
- Server returns no decision (error path) → hook falls back to the local heuristic and Week-Ahead still shows on the planning day.
- Server returns an explicit `active: false` → respected; only the error path is fail-open.
- Plan generator: `evaluateWeekAheadMode` receives `homeCountry` and returns Saturday planning for an IL locale.

## Out of scope
Brief/wearable behaviour, notification cadence and timing, `list-week-ahead-priorities` ranking, and any change to the all-day planning-window policy.