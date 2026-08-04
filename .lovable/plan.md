# Repair Home-Country Persistence and Lookup

## Confirmed cause

The live `public.profiles` schema contains `country` and `home_timezone`, but not `home_country`. `home_country` belongs to `onboarding_v8_responses` and is already backfilled into `profiles.country` by the country/travel migration.

Four current profile operations violate that contract:

- `complete-onboarding` writes both `country` and nonexistent `home_country`; the resulting profile update fails atomically, including the onboarding completion timestamp and personalization fields.
- `smart-nudges`, `evaluate-week-ahead-mode`, and `planLocaleContext` select nonexistent `home_country`; each entire query fails rather than returning the valid `country` and `home_timezone` fields.

This explains both Project monitoring findings. The earlier pure-logic tests passed because they did not execute these database projections.

## Implementation

1. **Restore the canonical profile contract**
   - Keep `profiles.country` as the sole persisted home-country field.
   - Remove `updateData.home_country` from onboarding completion while retaining the write to `updateData.country`.
   - Do not add a duplicate `profiles.home_country` column.

2. **Repair all affected lookups**
   - Change the three profile projections to request only `country` and the relevant timezone fields.
   - Resolve home country as `country ?? tzToCountry(home_timezone) ?? null` in backend paths.
   - In the client locale resolver, use `country`, then a timezone-derived country, then device region; retain the existing travel/current-timezone precedence.
   - Inspect and handle query errors explicitly so a future schema mismatch is observable rather than silently cached as device locale.

3. **Regression coverage**
   - Add database-client unit tests proving profile queries do not request `home_country`.
   - Add onboarding coverage proving a selected onboarding `home_country` is mapped to `profiles.country` and completion remains atomic.
   - Extend locale tests for Gulf/Israel Saturday planning and timezone fallback when `country` is null.
   - Run the existing country/weekend/planning and relocation suites.

4. **Release and end-to-end verification**
   - Claim the two exact Project monitoring findings before implementation.
   - Deploy `complete-onboarding`, `evaluate-week-ahead-mode`, and `smart-nudges` after tests pass.
   - Verify the live schema and execute read-path checks for a populated `country` and a null-country/timezone-fallback case.
   - Confirm Saturday Week Ahead behavior for Gulf/Israel, weekend classification in Smart Nudges, and successful onboarding completion persistence.
   - Resolve both Project monitoring findings only after those checks pass.

## No schema migration

No migration is needed: adding `profiles.home_country` would create two competing sources of truth. `onboarding_v8_responses.home_country` remains the onboarding input; `profiles.country` remains the canonical downstream value.