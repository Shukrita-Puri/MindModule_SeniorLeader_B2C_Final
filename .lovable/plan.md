# Phase B — Pill + Resilience inputs read snapshot

Changes the **read path** in `supabase/functions/compute-outer-readiness/index.ts` only. No UI changes, no pill shape changes, no tier colour mapping changes. Coach feature is suppressed in the UI, but coach-derived signals (`coach_pattern_observations`, `coach_memory_index`) remain in DB and remain valid inputs to Resilience per MRS v2 §3.5.

## 1. Hydrate `patternSignals` from the orchestrator

At the top of the brief-build branch (just after `wearableTrend7d` is computed, ~line 2863), call `composeDailyContext(db, userId, userLocalDate, { timezone, dryRun: true })` and destructure `patternSignals`. `dryRun: true` returns the composed object **without** upserting — the existing upsert lower down (~line 4535) remains the single writer for this request, avoiding double-write.

Null-safe: if compose throws or returns nulls, fall back to today's derived approximations already in scope (`wearableTrend7d`, `todayLoadIsHigh`, `sustainedDeficit`). Pill build must never throw.

Replaces the hand-derived `patternSignals` literal at lines 4499–4510 with the real orchestrator output (real `hrv_3day_trend` from 14-day samples, real `consecutive_high_load_days` from 3-day load, real DOW pattern, real `sustained_deficit_flag`).

## 2. Fetch Resilience inputs (one parallel batch)

New block alongside the compose call. All queries `Promise.all`-batched, each wrapped in try/catch returning safe defaults so a missing row never crashes the pill builder:

- `coach_pattern_observations` — count rows where `user_id = userId AND status = 'active' AND last_observed_at >= now() - interval '14 days'`. Returns `activePatternCount: number` (default 0).
- `coach_memory_index` — select `memory_type, importance, created_at` where `user_id = userId AND memory_type IN ('depletion','recovery_debt') AND created_at >= now() - interval '14 days'`. Returns `{ hasRecentDepletion: boolean, hasRecoveryDebt: boolean }` (default false/false). "Recent" = ≤14d for amber, ≤7d AND importance ≥ 5 for red weight.
- `profiles.protection_goals` — single row read of `protection_goals jsonb`. Returns `protectionGoals: string[]` (default []). Already fetched elsewhere in some paths; reuse if available in scope, otherwise fetch once here.

These three remain valid even with Coach UI suppressed — they're written by background jobs and onboarding, not the suppressed coach surface.

## 3. Decision Readiness (Cognitive) — rewire inputs

Current code at lines 4350–4364. Changes:

- Replace `wearableTrend7d === 'declining'` (line 4359) with `patternSignals.hrv_3day_trend === 'declining'` → amber.
- Add: `patternSignals.consecutive_high_load_days >= 3` → amber (fragmentation escalation).
- Keep: HRV deviation primary tier (red ≤-20, amber <-8); keep calendar `load === 'high' && pressure === 'high'` → amber.
- Update the `contributors` block (line 4452): swap `wearableTrend7d` for `hrv_3day_trend`, add `consecutive_high_load_days`.

## 4. Physical Reserves — unchanged shape, add sustained-deficit escalation

Current code at lines 4367–4392. Keep all existing sleep/RHR/HR rules. Add at end:

- `patternSignals.sustained_deficit_flag === true` → push `'red'` (sustained physiological deficit beyond a single-day reading).

Contributors block: add `sustained_deficit_flag`. Order and labels unchanged.

## 5. Resilience Capacity — full MRS v2 §3.5 inputs

Current code at lines 4398–4416. Rewrite the tier collection while keeping the same `PillTier` reduce → max pattern:

- Keep: HRV strict band (red ≤-25, amber <-15).
- Replace `wearableTrend7d === 'declining' || scoreTrajectory7d === 'declining'` with `patternSignals.consecutive_high_load_days >= 3` → amber (sustained-demand-day count is the §3.5 signal, not score trajectory).
- Keep: low HRV co-occurring with high calendar pressure → red.
- Add: `activePatternCount >= 3` → amber (per request spec).
- Add: `hasRecoveryDebt || hasRecentDepletion` (≤7d AND importance ≥5) → red; else if (≤14d) → amber.
- Add: `protectionGoals.length > 0 && (calendarPressure === 'high' || _hasStakes)` → amber bias (only when goal under pressure, never raw presence).

Contributors block: add `activePatternCount`, `hasRecentDepletion`, `hasRecoveryDebt`, `protectionGoalsCount`, `consecutive_high_load_days`.

## 6. Snapshot writer

The downstream `upsertDailyContextSnapshot` call (line 4535) continues to write `signalPills: signalPillsPayload`. Because pills now reference real `patternSignals`, also replace the local literal `patternSignals` (lines 4499–4510) with the orchestrator-derived object captured in step 1, so the snapshot reflects true signals (not single-day approximations).

`weightingMode` / `supplyDemandGapFlag` logic (lines 4512–4533) stays as-is but switches to reading `patternSignals.hrv_3day_trend` instead of `wearableTrend7d` for the recovery/declining checks.

## 7. Safety

- Every new fetch is null-safe with try/catch returning the documented default. Pill build never throws.
- Missing wearable → `patternSignals.hrv_3day_trend = 'unknown'`, no cognitive/resilience HRV push, pill tier collapses to other signals or `neutral` — unchanged behaviour from today.
- Missing coach data / protection goals → defaults to no escalation. The MRS v2 score is never disrupted by a missing signal.
- No client file changes. No UI file changes. No DB migration. `signal_pills` shape unchanged: same three keys, same tier enum, same `tierLabel`, same `contributors` object with added fields.

## Files touched

- `supabase/functions/compute-outer-readiness/index.ts` — pill builder block (~4334–4476), snapshot mirror block (~4478–4553).

## Out of scope (later phases)

- C: dedupe legacy `computeCalendarMetrics`.
- D: snapshot-first reads in Brief/Nudges/Plan.
- E: Deno tests + memory updates.
