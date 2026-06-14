
## Scope (revised after audit)

Implement MRS v4 — spec rewrite + code elements that genuinely change. **Brief changes excluded** (§10.3/§10.4/§10.5 instruction injection, `deriveRecoveryNote` signature change, prompt_version bump). MRS still writes the new ground-truth fields; consumers wiring them into the Brief is a separate plan.

---

## Audit — what already exists vs what v4 actually needs

### Already in place (REUSE, do not duplicate)

| v4 element | Existing artifact |
|---|---|
| Per-window check-ins (§2.1) | `daily_checkins.time_window` column already exists with composite index `(user_id, checkin_date, time_window, timestamp DESC)` — multiple-per-day is already a data-layer reality |
| §4 refined-score formula | `computeRefinedScore()` in `compute-inner-readiness/index.ts` — unchanged in v4 |
| Physiological composite math | `computePhysiologicalComposite()` in `divergence-flag.ts` — extend to consume v4 sub-components rather than rewrite |
| Divergence flag classifier | `computeDivergenceFlag()` in `divergence-flag.ts` — extend with `INTRADAY_DECLINE` |
| Window context derivations (§3 inputs) | `morning-context.ts`, `afternoon-context.ts`, `evening-context.ts` — already source the fields v4 §3.2–3.4 reference (`hrvDeviationPct`, `currentHrVsRestingPct`, `hrvEveningDeviationPct`, `bodyLoadElevated`, meetings remaining/completed, tomorrow tally, `yesterdayLoadScore`) |
| Pattern engine composite | `pattern-engine.ts` — patternEngineComposite delegates to this |
| Demand scorer | `demand-scorer.ts` — feeds all five Demand sub-components |
| `daily_context_snapshot` readiness columns | `readiness_score_baseline`, `readiness_score_refined`, `readiness_state`, `refined_contribution` all exist |
| §11 `readiness_tier` | `tier_displayed` already serves this purpose — REUSE, no new column |
| Tier cap / divergence flag storage | `tier_displayed`, `tier_cap_reason`, `supply_demand_gap_flag` exist |
| §3.2a sleep deficit raw inputs | `wearable_data.total_sleep_minutes` + `sleep_quality` already present |

### Genuinely new (only these get added)

| v4 element | Net-new artifact |
|---|---|
| Window-keyed sub-component weight table (§3.2/3.3/3.4) | New: `mrs-v4-weights.ts` (single small file, ~50 lines) |
| §8.3 per-cycle redistribution rule | New: `mrs-v4-redistribute.ts` (pure function) |
| §8.2 per-sub-component availability + §3.2a measured-only sleep cap + composer | Extend existing `divergence-flag.ts` (rename internal section to "physiological composite v4" and add window-aware overload). No new orchestrator file. |
| §6 INTRADAY_DECLINE flag | Extend `divergence-flag.ts` + `types.ts` union |
| `weight_provenance` audit JSONB (§11) | New `daily_context_snapshot.weight_provenance jsonb` column |
| `mrs_window`, `morning_baseline_score` | New columns on `daily_context_snapshot` |
| `check_in_count_today`, `last_check_in_window` | New columns on `daily_context_snapshot` |
| `rhr_baseline_3d` | **Not** a stored column — computed on the fly in `build-daily-context.ts` from existing `wearable_data.resting_heart_rate` rows. Avoids schema churn + backfill. |

---

## Phase A — Spec rewrite (single file)

Rewrite `docs/MRS_V3_SPECIFICATION.md` to "MRS v4 — Consolidated Specification" using your text verbatim. Light formatting only:
- Restore tables flattened in the paste (§1, §2, §3.2, §3.3, §3.4, §6, §7, §8.2, §11).
- Restore the truncated §6 flag-7 row (`ALIGNED — All four dims ≥ 3 AND |phys − demand| ≤ 25`) and the legacy `MASKED_HIGH` row.
- Insert §3.2a (severe sleep-deficit override) immediately after §3.2 as instructed.
- **Mark §10 (Brief–MRS coherence contract) as "Spec-only — not implemented in this pass; tracked separately"** so the doc stays the single source of truth without misrepresenting what shipped.
- Drop the trailing editorial "That's the only addition…" paragraph.
- Filename stays `MRS_V3_SPECIFICATION.md` (memory pointer unchanged).

---

## Phase B — Schema migration (additive only)

Single migration on `daily_context_snapshot`:
- `mrs_window text` (CHECK `morning|afternoon|evening`)
- `morning_baseline_score int`
- `check_in_count_today int not null default 0`
- `last_check_in_window text`
- `weight_provenance jsonb`

No grants (existing table). No backfill. No `wearable_data.rhr_baseline_3d` (computed in code).
No new `readiness_tier` column — `tier_displayed` is reused.

---

## Phase C — Code (only new files where reuse isn't possible)

### New files (2)

1. `supabase/functions/_shared/signal-engine/mrs-v4-weights.ts` (~50 lines)
   - Exports `MRS_V4_WEIGHTS: Record<Window, Record<SubComponentId, number>>` — single source of truth for §3.2/3.3/3.4 target weights.

2. `supabase/functions/_shared/signal-engine/mrs-v4-redistribute.ts` (~80 lines + tests)
   - Pure §8.3 algorithm: `redistribute({window, subs: {id, score, available, targetWeight}[]}) → {finalWeights, earned, awaitingSignals, weightProvenance}`.
   - Demand sub-components are the always-available reservoir; falls back pro-rata when Demand is empty; `awaitingSignals=true` when nothing available.
   - Co-located test file covers §8.4 worked examples + day-1 calendar-only DoW variance.

### Extended files (no new orchestrator)

3. `supabase/functions/_shared/signal-engine/divergence-flag.ts`
   - Add `INTRADAY_DECLINE` to the `DivergenceFlag` union (in `types.ts`).
   - Add `computeIntradayDecline({currentWindowBaseline, morningBaselineScore, bodyLoadElevated, intradayHrDeviationPct, decisionLeakageRisk})` — boolean.
   - Add window-aware overload of `computePhysiologicalComposite` that accepts the v4 sub-components (`intradayHrDeviation`, `eveningPhysioRead`). The existing morning-only signature stays for back-compat and is internally a special case of the new one.
   - Add §3.2a severe-sleep-deficit cap inside the composite: fires **only** when `sleepDeviation.available && (sleepMinutes < 300 || sleepQuality === 'poor')`. Caps physiological contribution at the Mixed-tier ceiling. The `available` guard is the §3.2a "absence ≠ deficit" guarantee.

4. `supabase/functions/compute-inner-readiness/index.ts`
   - Accept new optional inputs: `mrsWindow`, `morningContext`, `afternoonContext`, `eveningContext`, `morningBaselineScore`.
   - When `mrsWindow` is supplied: gather sub-component scores from the contexts → call `redistribute` (Phase C-2) → compute `baseline = Σ(score × finalWeight)/100` → evaluate v4 divergence flags (incl. `INTRADAY_DECLINE` vs `morningBaselineScore`). Bypasses the legacy `weightingMode` branches but leaves them intact for callers not yet migrated (no deletion this pass).
   - Response gains `mrsWindow`, `weightProvenance`. `tier_displayed` already covers the §11 "readiness_tier" need.

5. `supabase/functions/_shared/signal-engine/build-daily-context.ts`
   - In `fetchHrvBundle` (or a sibling fetcher), compute `rhrBaseline3d` from the trailing 3 days of `wearable_data.resting_heart_rate`. Surface as part of `RawSignals` and on the window-context inputs. No schema change.

6. `supabase/functions/compute-outer-readiness/index.ts` (caller wiring only — no Brief changes)
   - Resolve current window from user-local time, build window context, pass `mrsWindow` + the context + `morningBaselineScore` (read from `daily_context_snapshot` for today; if absent and window is morning, write it once).
   - Pass new columns through `upsertDailyContextSnapshot`.

7. `supabase/functions/_shared/signal-engine/build-daily-context.ts` — extend `UpsertContextSnapshotInput` with `mrsWindow`, `morningBaselineScore`, `checkInCountToday`, `lastCheckInWindow`, `weightProvenance`. Writes through.

8. `supabase/functions/daily-checkins/index.ts` (SAVE_CHECKIN handler) — on insert/upsert, compute today's count for the user and write `check_in_count_today` + `last_check_in_window` to `daily_context_snapshot`. `time_window` on the check-in row itself is already populated.

### Explicitly NOT touched (Brief work — separate plan)

- `supabase/functions/_shared/brief-prompt-version.ts` — no bump.
- `supabase/functions/_shared/signal-engine/evening-context.ts` — `deriveRecoveryNote` signature unchanged.
- `supabase/functions/compute-outer-readiness/index.ts` brief-assembly section — no §10.3 instruction injection.
- `mem://architecture/readiness-scoring-weights-v3` body — updated only to point at v4 spec; "Brief coherence contract" line noted as deferred.

---

## Phase D — Tests

Co-located:
- `mrs-v4-redistribute.test.ts` — four §8.4 worked examples + day-1 calendar-only producing different scores Mon vs Sun.
- `divergence-flag.test.ts` (extend) — `INTRADAY_DECLINE` priority + trigger; §3.2a fires only on measured low; null sleep cannot trigger (the absence-vs-deficit guard).

## Files touched (final list)

New (2): `mrs-v4-weights.ts`, `mrs-v4-redistribute.ts` (+ test)
Extended (6): `divergence-flag.ts`, `types.ts`, `compute-inner-readiness/index.ts`, `compute-outer-readiness/index.ts`, `build-daily-context.ts`, `daily-checkins/index.ts`
Migration (1): additive columns on `daily_context_snapshot`
Docs (1): `docs/MRS_V3_SPECIFICATION.md` rewrite
Memory (1): `mem://architecture/readiness-scoring-weights-v3` description refresh

## Out of scope

- All Brief coherence wiring (§10 entirely deferred — spec documents it, code doesn't ship it this pass).
- Removing legacy `weightingMode` branches in `compute-inner-readiness` (kept until callers migrate).
- New UI for midday/evening check-in entry points.
- HealthKit/Oura ingestion changes for `hr_current`, `hr_avg_afternoon`, `hrv_latest` — fields are read where present; absence is handled by §8.3 redistribution.
- New `readiness_tier` column (reusing `tier_displayed`).
- New `rhr_baseline_3d` column (computed in code from existing data).
