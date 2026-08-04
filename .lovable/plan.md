# Repair Home-Country Persistence and Lookup

## Confirmed cause

The live `public.profiles` schema contains `country` and `home_timezone`, but not `home_country`. `home_country` belongs to `onboarding_v8_responses` and is already backfilled into `profiles.country` by the country/travel migration.

Four current profile operations violate that contract:

- `complete-onboarding` writes both `country` and nonexistent `home_country`; the resulting profile update fails atomically, including the onboarding completion timestamp and personalization fields.
- `smart-nudges`, `evaluate-week-ahead-mode`, and `planLocaleContext` select nonexistent `home_country`; each entire query fails rather than returning the valid `country` and `home_timezone` fields.

This explains both Project monitoring findings. The earlier pure-logic tests passed because they did not execute these database projections.

## Implementation — four surgical removals

1. **`supabase/functions/complete-onboarding/index.ts` (~line 182)** — delete
   `updateData.home_country = homeCountry;`. Keep `updateData.country = homeCountry;`.
   This is the critical fix: the invalid column currently fails the whole profile
   update, so `country` and the other completion fields never persist.

2. **`supabase/functions/evaluate-week-ahead-mode/index.ts` (~line 65)** — select
   `"country, home_timezone"`, drop `home_country` from the row type, and resolve
   `homeCountry = row?.country ?? tzToCountry(row?.home_timezone ?? null) ?? null`.

3. **`supabase/functions/smart-nudges/index.ts` (~line 1861)** — select
   `"country, home_timezone"`, drop `home_country` from the row type, and resolve
   `userHomeCountry = pRow?.country ?? tzToCountry(pRow?.home_timezone ?? null) ?? null`.

4. **`src/utils/planLocaleContext.ts` (~line 87)** — select
   `'home_timezone, current_timezone, country'` and resolve
   `userHomeCountry: (p.country as string | null) ?? base.userHomeCountry`
   (`base.userHomeCountry` is `deviceRegion()`, the correct final fallback).

## Explicitly untouched

- `onboarding_v8_responses.home_country` — real column, written by onboarding UI,
  read by `complete-onboarding` and `leader-profile-loader.ts`.
- `sync-profile`, `set-home-location` — already use `profiles.country` only.
- `compute-outer-readiness` — uses the onboarding-sourced leader profile plus
  `tzToCountry(effectiveHomeTz)`.

## Observability additions

- `planLocaleContext.ts`: log in the catch —
  `console.warn('[planLocaleContext] profile query failed, using device fallback', err)` before returning `base`.
- `evaluate-week-ahead-mode` and `smart-nudges`: replace the silent
  `/* best-effort */` catches with `console.warn` so future schema mismatches
  surface in edge function logs.

## Regression tests

1. Contract test (pattern of `snapshotContractGuards.test.ts`): assert none of the
   four profile selects contain the string `home_country`.
2. `complete-onboarding` test: `onboarding_v8_responses.home_country = 'SA'` maps to
   `profiles.country = 'SA'`, and the update payload contains no `home_country` key.
3. Extend `country-weekend-planning.test.ts`: `country = null` with
   `home_timezone = 'Asia/Riyadh'` resolves via `tzToCountry` to `'SA'`, and
   `planningDayOfWeek('SA')` returns `6`.

## Verification

- Run `tsgo` over the changed files; require zero TypeScript errors.
- Run the new and existing country/weekend/planning and relocation suites.
- Redeploy `complete-onboarding`, `evaluate-week-ahead-mode`, `smart-nudges`.
- Re-confirm the live `profiles` schema has no `home_country`.
- End-to-end read-path checks after deploy:
  - `shukrita@mindmodule.me` → expect `country = 'GB'`.
  - `joydeepcha75@gmail.com` → expect `country = 'US'` from `home_timezone = America/New_York`;
    if still null, note that the self-healing backfill runs on his next login.
- Resolve the two Project monitoring findings after deployment succeeds.
- Report exact lines changed per file, test results, and both read-path checks.

## No schema migration

No migration and no new column: adding `profiles.home_country` would create two competing sources of truth. `onboarding_v8_responses.home_country` remains the onboarding input; `profiles.country` remains the canonical downstream value.