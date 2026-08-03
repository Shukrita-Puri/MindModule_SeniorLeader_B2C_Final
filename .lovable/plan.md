# Change 1 — Shared timezone → country module

Scope: only Change 1 from the uploaded plan. No behaviour change beyond the map covering more timezones.

## Storage check (done)
No timezone/country lookup table exists in the database. The only country data is `profiles.country` and `onboarding_v8_responses.home_country` (there is no `profiles.home_country` column). An IANA-timezone map is static reference data with no per-user state, so a code module is the right home — a new table would add a query to every readiness run for data that never changes per user.

The map is currently declared inline in one place only: `compute-outer-readiness/index.ts` lines 4614–4632 (17 entries, no Gulf/Israel zones). Nothing else in the repo has a copy.

## New file: `supabase/functions/_shared/plan/tz-to-country.ts`
- `TZ_TO_COUNTRY` — the expanded map exactly as specified (UK, US, Gulf, Israel, Europe, Asia-Pacific, Oceania, Africa, Americas).
- `tzToCountry(tz)` — returns the ISO-2 code or `null` for unknown/empty input.
- `tzOffsetDiffHours(tz1, tz2, atMs)` — absolute offset difference in hours via `Intl` `shortOffset`, as specified.

Placed alongside the existing `_shared/plan/user-locale.ts` so planning-locale helpers stay together.

## Update: `supabase/functions/compute-outer-readiness/index.ts`
- Delete the inline `const tzToCountry: Record<string, string> = { ... }` block (4614–4632).
- Add `import { tzToCountry } from "../_shared/plan/tz-to-country.ts";` with the other shared imports.
- Convert the two existing lookups from index access to the function call:
  - `tzToCountry[userTz] || null` → `tzToCountry(userTz)`
  - `tzToCountry[effectiveHomeTz] || null` → `tzToCountry(effectiveHomeTz)`
- Everything else in that block (current-tz-first precedence, holiday lookup, `localeWeekendHomeCountry`) stays exactly as-is. Change 2 of the uploaded plan reworks that precedence and is not part of this step.

## Effect
Gulf and Israel timezones now resolve to a country instead of `null`, so `localeWeekendHomeCountry` is populated for those users. No other logic moves.

## Verification
- Deno unit test for the new module: known zone → code, Gulf zones → SA/KW/QA/BH/OM/IL, unknown/null → `null`, and an offset-diff sanity case (`Europe/London` vs `Asia/Dubai`).
- Typecheck plus the existing readiness test suite to confirm no regression.
- Deploy `compute-outer-readiness`.

## Out of scope
Changes 2–11 (home-vs-current weekend precedence, migrations, travel `current_country`, relocation detection, nudge fallbacks, brief copy) — each lands separately.
