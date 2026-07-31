Replace the entire contents of two files with the exact sources provided by the user, and verify with the existing Deno test suite. No other files will be changed, and no imports will be added or removed.

Files to update:
1. `supabase/functions/_shared/brief/deterministic-brief.ts` — deterministic Brief copy update (evidence wording, holding→steady mapping, depleted directive, multi-high-stakes read length, and evening close).
2. `supabase/functions/_shared/brief/deterministic-brief.test.ts` — updated assertion for the changed directive string plus four new regression tests covering the validator-rejection fixes.

Steps:
1. Overwrite `supabase/functions/_shared/brief/deterministic-brief.ts` with the supplied source verbatim.
2. Overwrite `supabase/functions/_shared/brief/deterministic-brief.test.ts` with the supplied source verbatim.
3. Read back both files to confirm they match the provided sources exactly.
4. Run the deterministic-brief Deno tests to confirm all assertions pass and there are no regressions.

No other edge-function or frontend changes are in scope.