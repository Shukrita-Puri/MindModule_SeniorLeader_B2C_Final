# Wire GPS/timezone travel-day into Brief and Mastery Plan

Smart Nudges already derives a truthful "is today a travel day?" verdict from GPS displacement (>50 km from home), timezone change, and the persisted travel state machine. Brief and Plan do not: they only compare home vs current timezone, so a domestic trip (or an international trip where the phone timezone hasn't flipped yet) reads as a normal day. This plan gives all three surfaces the same verdict.

## What changes

1. **One shared travel-day hydrator.** New helper `supabase/functions/_shared/travel/hydrate-travel-day.ts` that:
   - reads the user's `travel_state` row (state, distance_from_home_km, last_state_change_at, last_location_at),
   - applies the existing freshness guard (`_shared/travel/freshness.ts`),
   - calls the existing SSOT `isTravelDayFromDistance` / `travelDayReason` (`_shared/travel/travel-day.ts`) with distance, state, timezone-changed, and staleness,
   - returns `{ travelDay, reason, distanceKm, state, freshness, used }`,
   - never throws (fail-open to `travelDay: false`, reason `hydration_failed`).

   This is exactly the logic Smart Nudges runs inline today; Smart Nudges is refactored to call the helper so there is one implementation.

2. **Brief (`compute-outer-readiness`).** Replace the inline `travel_state` fetch with the helper, and set the behaviour-snapshot coverage field
   `timezone.travelDay = tzChanged || hydrated.travelDay`
   instead of `tzChanged` alone. Calendar-title self-derivation in `brief-signal-coverage.ts` continues to OR on top, so travel rules (pre-flight, landing offload, post-trip re-entry) now fire on a domestic away-day too.

3. **Mastery Plan (`generate-mastery-plan`).**
   - Same substitution in the local fallback snapshot rebuild (`_fbTravelState` block), so `timezone.travelDay` reflects distance.
   - Thread the hydrated verdict into the allocator's `hasTravelDay` (currently calendar-title only), which also feeds `evaluateWeekAheadMode({ travelDay })`, so an away day without a flight-titled event is recognised.
   - The main path keeps inheriting the Brief's persisted snapshot, so it stays in parity automatically.

4. **Provenance.** Both functions log a single structured line — `[travel-state][consumer] { fn, travelDay, reason, distanceKm, state, freshness }` — matching the Smart Nudges trace fields so travel behaviour is debuggable across all three surfaces.

## Not in scope

No copy changes, no new travel scenarios, no schema changes, no changes to the travel state machine or `persist-travel-location`. Existing calendar-title travel detection stays as-is; the GPS verdict only ever adds evidence, never removes it.

## Verification

- `deno check` on the three edited functions plus the new shared module.
- Existing Deno tests for travel/smart-nudges (`travel-day`, nudge suites) must stay green; add unit tests for the new hydrator covering: fresh distance >50 km, stale fix defers to state, timezone change alone, missing row.
- Deploy `compute-outer-readiness`, `generate-mastery-plan`, `smart-nudges` and confirm the provenance log shows a matching `travelDay`/`reason` for the same user across all three.
