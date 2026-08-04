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

## Verification

- Run `tsgo` over the changed files; require zero TypeScript errors.
- Redeploy `complete-onboarding`, `evaluate-week-ahead-mode`, `smart-nudges`.
- Re-confirm the live `profiles` schema has no `home_country`.
- Resolve the two Project monitoring findings after deployment succeeds.
- Report the exact lines changed per file.

## No schema migration

No migration and no new column: adding `profiles.home_country` would create two competing sources of truth. `onboarding_v8_responses.home_country` remains the onboarding input; `profiles.country` remains the canonical downstream value.