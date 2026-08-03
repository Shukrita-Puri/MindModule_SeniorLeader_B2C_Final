# Country, travel country & relocation detection

## Storage check (done)

No existing table or column covers this. Verified against the live database:

- `profiles` has `country`, `current_timezone`, `home_timezone` — but **no `home_country`** column. `home_country` exists only on `onboarding_v8_responses`.
- `travel_state` has `last_known_timezone` / `last_timezone_change_at` — no country column.
- No relocation columns exist anywhere.

So `travel_state` (the existing live state machine) is the right home for current country — no new table. Only columns get added.

One correction to the requested SQL: the backfill reads `profiles.home_country`, which does not exist, so that statement would fail. All 37 profiles currently have `country` NULL. The backfill will instead source from `onboarding_v8_responses.home_country`, which is where onboarding actually writes it.

## 1. Migration `supabase/migrations/<ts>_country_travel_relocation.sql`

- Backfill `profiles.country` from the user's `onboarding_v8_responses.home_country` where `country` is null or empty.
- `travel_state`: add `current_country text`.
- `profiles`: add `possible_relocation_detected boolean default false`, `relocation_candidate_tz text`, `relocation_first_detected_at timestamptz`.

All adds use `IF NOT EXISTS`. No new table, so no new GRANT/RLS block — existing policies on both tables continue to apply.

## 2. `supabase/functions/persist-travel-location/index.ts`

- Import `tzToCountry` from `../_shared/plan/tz-to-country.ts`.
- In the `travel_state` upsert, add:
  `current_country: (newState === 'arrived' || newState === 'en_route') ? tzToCountry(tz) : null`

This records where the user physically is; home country and planning day remain driven by `profiles.country` per D1.

## 3. `supabase/functions/_shared/brief/deterministic-brief.ts`

In `closeFor()` (line 265), change the close line to `"and let this window close so the week starts clean."`

## Verification

- `tsgo` — confirm zero TypeScript errors.
- Existing Deno/vitest suites for brief and travel remain green.
- Deploy `persist-travel-location` (and any function bundling the brief module).
