## Part 1 — Travel Load & Post-Landing Delivery Split

Consolidated spec implemented across the shared CEO-behaviour layer, signal coverage, smart-nudges delivery routing, and tests. No DB migration, no new scheduling infrastructure — reuses existing arrival/landing detection and travel_state plumbing.

### 1a — Constants (single source of truth)

File: `supabase/functions/_shared/ceo-behaviour/travel.ts`

Add:
```ts
export const LONG_HAUL_MIN_HOURS = 3;
export const LANDING_WINDOW_SHORT_MIN = 60;
export const LANDING_WINDOW_LONG_MIN = 90;
export const LANDING_PRACTICE_GATE_MIN = 120;
export const LANDING_NUDGE_ONLY_MAX_MIN = 60;
export const TRAVEL_AWAY_MIN_KM = 50;
export const SHORT_HAUL_RETURN_WINDOW_MIN = 30;
```

Replace inline `>= 3`, `60`, `90` literals in `landingWindowMinutes`, `longHaulRecovery`, and `back-to-back.ts:travelLandingProtected` with the constants. Same for `brief-signal-coverage.ts:481`.

### 1b — `landingDeliveryMode` on `BehaviourFlag`

File: `supabase/functions/_shared/brief-context.ts`

Extend `BehaviourFlag`:
```ts
landingDeliveryMode?: 'in_app_practice' | 'push_only' | 'standard';
```

`travelLandingOffload` → `'in_app_practice'` when inside the protected window, no high-stakes follow-up. Otherwise `'standard'`.

`travelLandingPlusHighStakes`:
- next ≤ `LANDING_NUDGE_ONLY_MAX_MIN` (60) → `'push_only'`
- next 60–120 → `'push_only'` (prep-framed copy)
- next ≥ `LANDING_PRACTICE_GATE_MIN` (120) → `'in_app_practice'`

### 1c — `awayFromHome` gate

Extend `SignalMatrix` with `awayFromHome?: boolean`.

Helper in `travel.ts`:
```ts
export function isAwayFromHome(state?: string | null, distanceKm?: number | null): boolean {
  if (state && ['en_route','arrived','returning'].includes(state)) return true;
  if (typeof distanceKm === 'number' && distanceKm > TRAVEL_AWAY_MIN_KM) return true;
  return false;
}
```

`travelLandingOffload` and `travelLandingPlusHighStakes` short-circuit when `ctx.signals.awayFromHome === false`. Default `true` when undefined (back-compat — preserves current always-fire behaviour for callers that don't hydrate travel_state yet).

`SignalCoverageInput` gets an optional `travelState?: { state?: string|null; distanceFromHomeKm?: number|null }` field; `buildSignalMatrix` computes `awayFromHome` via the helper and writes it onto the matrix.

### 1d — `sameDayReturn` + tier classification

Extend `SignalMatrix` with `sameDayReturn?: boolean` and `travelTier?: 'long_haul' | 'short_haul' | 'short_haul_round_trip'`.

Helpers in `travel.ts`:
```ts
export function isSameDayRoundTrip(events: ReadonlyArray<TravelEventLike>, now: Date): boolean
export function classifyTravelTier(durationHours: number, sameDayReturn: boolean, awayFromHome: boolean):
  'long_haul' | 'short_haul' | 'short_haul_round_trip'
```

`isSameDayRoundTrip`: filter events by `isTravelTitle`, group by local calendar date of `start_time`, return true iff today has ≥2 travel events whose start dates match today.

`buildSignalMatrix` hydrates `sameDayReturn`, then `travelTier` via `classifyTravelTier(durationHoursOrZero, sameDayReturn, awayFromHome)`.

Existing rules gating:
- `travelLandingOffload` / `travelLandingPlusHighStakes` add a guard: skip when `travelTier === 'short_haul_round_trip'` (the new arc owns this case).
- `longHaulRecovery` unaffected.

### 1f — Same-Day Round-Trip Arc (three new flags)

New `BehaviourRule` values in `brief-context.ts`:
- `travelDayArrivalFraming`
- `travelDayDuringPushOnly`
- `travelDayReturnRecovery`

New rule fns in `travel.ts`. Triggers:

| Rule | Fires when | landingDeliveryMode | Notes |
|---|---|---|---|
| `travelDayArrivalFraming` | `travelTier='short_haul_round_trip'` AND `landingActive(ctx)` AND no return leg yet completed | `push_only` | No deep link; framing copy ("travel day ahead — here's what's on the other side") |
| `travelDayDuringPushOnly` | `travelTier='short_haul_round_trip'` AND back-to-back hours today ≥4 (reuses `backToBackHoursToday`) | `push_only` | Silent if destination day not back-to-back |
| `travelDayReturnRecovery` | `travelTier='short_haul_round_trip'` AND `lastTravelEventEndedMinutesAgo <= SHORT_HAUL_RETURN_WINDOW_MIN` AND user back home (`awayFromHome === false`) | `standard` | Deep link allowed |

`back-to-back.ts` exposes a thin `isDayBackToBack(ctx): boolean` helper (extracted from `backToBackLoadOverride` threshold) so the new rule reads the same check.

Register all three in `ceo-behaviour/index.ts:ALL_RULES` with scopes `["brief","plan","nudge"]`.

### 1e — smart-nudges wiring

`supabase/functions/smart-nudges/index.ts` reads `flag.landingDeliveryMode` for ALL travel landing/arc flags (`travelLandingOffload`, `travelLandingPlusHighStakes`, `travelDayArrivalFraming`, `travelDayDuringPushOnly`, `travelDayReturnRecovery`):
- `push_only` → omit deep-link CTA, collapse body to one-line breathing cue, retain priority.
- `in_app_practice` → existing Plan deep-link behaviour.
- `standard` → existing default copy + CTA.

Hydrate `travelState` into the `SignalCoverageInput` from `travel_state` table (single query already used elsewhere; add column projection for `state` + `distance_from_home_km`).

Same hydration added to `compute-outer-readiness` and `generate-mastery-plan` callers of `buildRuleContext` so Brief/Plan see `awayFromHome` and `travelTier`.

### Tests

`supabase/functions/_shared/ceo-behaviour/travel.test.ts` (new file) covering 9 cases from the spec:

1. Short-haul, home, no same-day return → landing rules return null.
2. Short-haul, awayFromHome=true, not same-day → `travelLandingOffload` `in_app_practice`.
3. Long-haul, meeting in 30min → `travelLandingPlusHighStakes` `push_only`.
4. Long-haul, meeting in 180min → `in_app_practice`.
5. Oxford↔London same-day round trip → on arrival: `travelDayArrivalFraming` `push_only`; back-to-back day → `travelDayDuringPushOnly`; on return: `travelDayReturnRecovery` `standard`.
6. Poland→Amsterdam early-departure same-day → identical arc (distance-agnostic).
7. London↔Paris Eurostar 09:00 / evening return → same arc (departure-time-agnostic).
8. Same-day round trip but destination day not back-to-back → arrival + return fire; during is silent.
9. Long-haul (≥3h) → tier `long_haul`; 1a–1e logic unchanged.

Plus assertion that `travelLandingOffload` and `travelLandingPlusHighStakes` do NOT fire when `travelTier === 'short_haul_round_trip'`.

### Out of scope

- Scoring weights, why-line LLM, rule severities unchanged.
- No new schedulers, migrations, or DB columns. `travel_state.state` + `distance_from_home_km` already exist.
- `travelPreFlightMandatory`, `longHaulRecovery`, `postTripReentry`, `travelInFlightConnection` behaviour unchanged.

### File touch-list

- `supabase/functions/_shared/brief-context.ts` — add `BehaviourRule` entries, `landingDeliveryMode`, matrix fields.
- `supabase/functions/_shared/ceo-behaviour/travel.ts` — constants, helpers, new flag fns, mode on existing fns, round-trip gating.
- `supabase/functions/_shared/ceo-behaviour/back-to-back.ts` — constant swap + exported `isDayBackToBack`.
- `supabase/functions/_shared/ceo-behaviour/index.ts` — register three new rules.
- `supabase/functions/_shared/brief-signal-coverage.ts` — `travelState` input, derive `awayFromHome` / `sameDayReturn` / `travelTier`.
- `supabase/functions/smart-nudges/index.ts` — read `landingDeliveryMode`, hydrate `travelState` from DB.
- `supabase/functions/compute-outer-readiness/index.ts` + `supabase/functions/generate-mastery-plan/index.ts` — hydrate `travelState` (read-only) into `SignalCoverageInput`.
- `supabase/functions/_shared/ceo-behaviour/travel.test.ts` — new file, 9 cases.
