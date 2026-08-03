# Change 3 — Wire tz-to-country into Plan, Nudges and the frontend country chain

Six wiring edits so every feature resolves Home Country the same way: `profiles.country` → `profiles.home_country` → `tzToCountry(home_timezone)` → null.

## Backend

1. `supabase/functions/smart-nudges/index.ts` (~1857)
   - Import `tzToCountry` from `../_shared/plan/tz-to-country.ts`.
   - Select `country, home_country, home_timezone` and apply the fallback chain to `userHomeCountry`.

2. `supabase/functions/evaluate-week-ahead-mode/index.ts` (~65)
   - Same import and same fallback chain for `homeCountry`.
   - Catch block returns `{ weekAheadDecision: null, error: "internal_error" }` with status 200, so a server error lets the client fall back to its local heuristic instead of being told "not week-ahead".

3. `supabase/functions/generate-mastery-plan/index.ts`
   - Add `homeCountry: opts?.userLocale?.homeCountry ?? null` to the `evaluateWeekAheadMode` calls at ~8221 and ~9454.

## Frontend

4. `src/utils/planLocaleContext.ts` (~87)
   - Select `home_country` alongside `country`; `userHomeCountry` falls back `country → home_country → device base`.

5. `src/pages/ExecutiveHome.tsx` (line 71) and `src/pages/PlanPage.tsx` (line 41)
   - Pass Home Country as the second argument to `useWeekAheadMode`.
   - Note: neither page currently holds a `planLocale` value — verified, there is no locale state on either page. Instead of a bespoke fetch in each page, add a small `usePlanLocaleContext()` hook wrapping the existing TTL-cached `getPlanLocaleContext`, and use it on both pages. No extra network traffic thanks to the existing cache.

6. `src/hooks/useWeekAheadServerDecision.ts`
   - Extract the fetch into a `runFetch` callback.
   - Add a second effect listening to window `focus` and document `visibilitychange` → visible; call `runFetch()` only when `new Date().toLocaleDateString('en-CA')` differs from the date recorded at the last fetch. Event-driven only, no polling.

## Verification

- Run `tsgo`; zero TypeScript errors required.
- Report pass status per item (all six).

Includes redeploying the three edge functions. No schema changes.