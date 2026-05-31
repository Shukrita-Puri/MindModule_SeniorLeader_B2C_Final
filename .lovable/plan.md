## Goal

Mind Module Mental Readiness Score v2 — remove the two dead check-in inputs from `compute-inner-readiness`, derive their replacements (calendar demand + wearable pattern) from data we already store, and publish a single canonical context object that Brief, Nudges, and Plan all read from. Pill values change because their inputs change; pill UI structure does not.

Hard constraints from the spec:
- Do NOT recreate `compute-inner-readiness` or `compute-outer-readiness` — update in place.
- Do NOT drop `daily_checkins` from DB queries; keep reading `checkin_date` only for 60-day DOW history.
- Do NOT change tier boundaries (depleted / managing / strong / peak).
- Do NOT touch onboarding capture in this PR; profile columns are placeholders.
- Strategic context is LLM framing only — it never changes the numeric score.

## Scope decisions (locked from your answers)

1. Full signal-engine + new `daily_context_snapshot` table (Step 5 spec, your pasted version).
2. `compute-inner-readiness` keeps accepting `checkInOutcome / clarityLevel / confidenceLevel` in its request schema but **ignores them in scoring**. Easy to resurface later.
3. Add `pressure_profile` and `protection_goals` JSONB columns now, nullable, untouched by onboarding. Document them as "populated by future onboarding step; null = no personalisation" so future onboarding wiring is a drop-in.
4. Pill UI: recompute pill values + tier labels from new sources; visual structure (3 pills, same labels, same color tiers) is unchanged.

## Step 1 — DB migration (additive only)

One migration:

- `ALTER TABLE public.profiles ADD COLUMN pressure_profile JSONB`, `ADD COLUMN protection_goals JSONB` — both nullable, default null. Column comments mark them as onboarding-fed strategic context.
- `CREATE TABLE public.daily_context_snapshot` keyed by `(user_id, local_date)`, with columns:
  - `pattern_signals JSONB` (hrv_3day_trend, consecutive_high_load_days, dow_historical_pattern, sustained_deficit_flag)
  - `strategic_context JSONB` (resolved pressure_profile + protection_goals + user_archetype)
  - `calendar_demand_score INT`, `demand_load TEXT`, `demand_pressure TEXT`, `has_high_stakes BOOL`
  - `supply_demand_gap_flag TEXT` (ALIGNED / SUPPLY_DEMAND_GAP / RECOVERY_UNDERWAY / LIGHT_DAY_STRONG_STATE)
  - `inner_score INT`, `inner_tier TEXT`, `pillar_mode TEXT`
  - `signal_pills JSONB` (canonical 3-pill payload, same shape as `brief_snapshots.signal_pills`)
  - `weighting_mode TEXT`, `updated_at TIMESTAMPTZ DEFAULT now()`
- GRANTs: `service_role` ALL; `authenticated` SELECT only (writes are service-role only via edge function).
- RLS: deny-by-default; `SELECT` policy `user_id = (auth.jwt()->>'sub')` matching existing Auth0 pattern in `brief_snapshots`.

No existing column is dropped. `brief_snapshots.signal_pills` is left in place (consumers keep working) but flagged in `compute-outer-readiness` as "deprecated copy of daily_context_snapshot.signal_pills".

## Step 2 — Shared signal-engine modules

New folder `supabase/functions/_shared/signal-engine/`:

- `types.ts` — `RawSignals`, `PatternSignals`, `DemandScore`, `StrategicContext`, `DailyContextSnapshot`, `WeightingMode`, `DivergenceFlag` (extends existing with `SUPPLY_DEMAND_GAP` and `LIGHT_DAY_STRONG_STATE`).
- `pattern-engine.ts` — `buildPatternSignals(raw, classifiedEvents)`:
  - (A) hrv_3day_trend: today vs HRV 3 days ago, ±5% bands.
  - (B) consecutive_high_load_days: counts last 3 days where per-day load ≥ high threshold.
  - (C) dow_historical_pattern: `{ typical_hrv_for_dow, typical_load_for_dow }` over last 60 days, joining wearable_data and calendar_events by day-of-week.
  - (D) sustained_deficit_flag: HRV > 20% below baseline for ≥2 consecutive days.
- `demand-scorer.ts` — `computeCalendarDemand(classifiedEvents)`:
  - Lifts the load/pressure thresholds from `compute-outer-readiness/index.ts` lines ~188-256 (4+ events = high, attendees>5 = +3, organizer = +2, non-recurring = +1, gap<15m = +2, totalPressure ≥6 = high). To avoid drift, the same thresholds are exported from `demand-scorer.ts` and `compute-outer-readiness` is refactored to import them — no behaviour change there.
  - Returns `{ load, pressure, hasHighStakes, demandScore (0–100) }`.
- `strategic-context.ts` — reads `profiles.pressure_profile`, `protection_goals`, `user_archetype`. Returns null-safe object. 24h in-process cache keyed by user_id.
- `build-daily-context.ts` — orchestrator: fetches raw signals + classified events, calls the three modules above + `compute-inner-readiness` over HTTP (or shared scoring lib — see Step 4), and upserts `daily_context_snapshot`. Idempotent per `(user_id, local_date)`.

## Step 3 — Update `compute-inner-readiness`

Surgical edit, no rewrite:

- Request schema keeps `checkInOutcome / clarityLevel / confidenceLevel` (ignored) and adds `demandScore`, `patternSignals`, `weightingMode?`.
- Replace `feltScore` with `demandStateScore = demandScore > 70 ? 80 : demandScore >= 40 ? 50 : 20`.
- Replace `irScore` with `patternScore` derived from `patternSignals` (rules in your prompt: consecutive ≥3 → 20; declining → 30; stable → 50; improving → 70; zero high-load + improving → 80).
- Divergence detector now compares **physiological composite** vs **demand score**, not felt vs wearable:
  - `SUPPLY_DEMAND_GAP` when demand ≥65 AND physComposite ≤50.
  - `LIGHT_DAY_STRONG_STATE` when physComposite ≥65 AND demand ≤35.
  - `RECOVERY_UNDERWAY` keeps semantics, retuned to physComposite improving + demand still high.
  - `ALIGNED` when `|physComposite − demand| ≤ 25`.
- Weighting modes match doc §3.2 table (No-wearable / Wearable-early / Aligned / Supply-Demand Gap / Recovery window). Existing wearable-confidence scaling is preserved.
- Tier mapping + sub-tier mapping unchanged.
- `assembleContextStatement` and `selectSignalsForStatement` keep accepting check-in args but those branches become dead code paths gated behind `hasCheckIn` which the new caller always passes as false. Code left in place for future resurfacing.

## Step 4 — Update `compute-outer-readiness`

Two changes only:

1. Refactor the inline load/pressure calc (lines ~188-256) to import from `_shared/signal-engine/demand-scorer.ts`. Pure refactor; tests stay green.
2. Replace the `signal_pills` payload block (lines ~4338-4475) so each pill is recomposed off the new sources per doc §3.5:
   - **Decision Readiness**: HRV deviation (primary) + cognitive fragmentation (back-to-back hours, gap density derived from classified events) + 3-day HRV trend from `patternSignals` + DOW cognitive pattern. Removes `clarityLevel`, `mentalSharpnessLevel`, `checkInOutcome` from the cognitive computation.
   - **Physical Reserves**: unchanged in principle — sleep score vs baseline, total_sleep_minutes vs 6h floor, RHR deviation, 3-day RHR trend. (Already wearable-only; light edits.)
   - **Resilience Capacity**: consecutive_high_load_days + HRV-low-AND-high-demand co-occurrence (last 7 days) + coach_pattern_observations + coach_memory_index (importance ≥5) + protection_goals (framing only). Removes `confidenceLevel` and `checkInOutcome`.
   - `tierLabel` strings kept (`Mind Sharp`, `Body Steady`, `Reserve Strong`, etc.) so no copy churn.
3. The block writes the same `signal_pills` shape into `brief_snapshots` AND mirrors it into `daily_context_snapshot.signal_pills` via the orchestrator so both reads stay consistent during the transition.

## Step 5 — Brief / Nudges / Plan read SSOT

- `useOuterReadiness` and `useBriefSnapshot` are unchanged — they keep reading from `brief_snapshots` so the dashboard pill render path doesn't move in this PR. Pills change *content* automatically because Step 4 changes how they're computed.
- Brief LLM prompt builder picks up `strategic_context` and `pattern_signals` from `daily_context_snapshot` when present (additive — falls back to existing per-request fetches when the row is missing).
- Nudges and Plan generators read `daily_context_snapshot` first; same null-safe fallback to current behaviour.

This makes `daily_context_snapshot` the single source of truth without flipping consumers in lockstep — each consumer can migrate independently after this PR ships.

## Step 6 — Update client invoke

`src/utils/energyStateEngine.ts` line 297: drop the score-relevant payload but keep sending the legacy check-in fields as `null` so the function signature is forward-compatible. Pass `demandScore`, `patternSignals`, and `weightingMode` resolved from `daily_context_snapshot` when available, otherwise let the orchestrator compute them on-demand.

## What does NOT change

- 4-tier structure + sub-tier boundaries.
- Pill labels, pill colors, pill ordering, dashboard layout.
- Brief copy structure, phrase validators, lean-on / watch-for shape.
- `brief_snapshots` schema (still written for backwards compatibility).
- Onboarding flow (separate task — placeholder columns only).
- Any UI route, button, or navigation.

## Memory / docs

- New memory: `mem://architecture/mental-readiness-score-v2` documenting input replacement, divergence flag rename, `daily_context_snapshot` as SSOT, and the "ignore-but-accept" check-in field handling.
- Update `mem://architecture/readiness-scoring-weights-v2` with the new weighting-mode table.
- Update `mem://ui/performance-readiness/signal-pill-system` with the new contributor sources per pill.

## Risk + rollout

- Risk concentrated in Steps 3 + 4 — both inside the existing scoring path. Existing tests in `compute-outer-readiness/*.test.ts` exercise the load/pressure refactor; we add Deno tests for pattern-engine, demand-scorer, and the new divergence-flag matrix.
- DB migration is additive only; rollback = drop new table + drop two columns.
- Onboarding columns staying null means strategic context resolves to empty object — divergence flags and score behave identically for users with no pressure profile.

## Technical detail (engineering)

Files added:
- `supabase/migrations/<ts>_mrs_v2_context_snapshot.sql`
- `supabase/functions/_shared/signal-engine/{types,pattern-engine,demand-scorer,strategic-context,build-daily-context}.ts`
- `supabase/functions/_shared/signal-engine/*.test.ts`

Files edited:
- `supabase/functions/compute-inner-readiness/index.ts` — new inputs, new divergence flags, new weighting modes; check-in scoring branches removed but legacy fields preserved in request type.
- `supabase/functions/compute-outer-readiness/index.ts` — import from demand-scorer; rewrite the `signal_pills` block; write-through to `daily_context_snapshot`.
- `src/utils/energyStateEngine.ts` — invoke payload changes; no UI changes.

Files unchanged: every React component, every route, all onboarding stages, `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts` (regenerates automatically post-migration).
