## Change 4 — server-side score read-first (implement and deploy first)

**File:** `supabase/functions/compute-outer-readiness/index.ts`

- Reuse the already-loaded window row `existingWindowMrs` (line ~9323) and its `existingIsReadyRow` flag (line ~9348). No new query.
- Add `adoptExistingMrs = existingIsReadyRow && !isInternalCall`, using the existing `isInternalCall` flag defined at line 2976 (service-role or cron-secret caller).
  - **Browser calls (Auth0 token → `isInternalCall = false`):** adopt the persisted row as canonical — `inner_score`, `inner_tier`, `tier_displayed`, `tier_cap_reason`, `readiness_score_baseline`, `readiness_score_refined`, `readiness_state`, `refined_contribution`, `weight_provenance` — and suppress the MRS portion of the `daily_context_snapshot` upsert.
  - **`build-executive-home-cards` (service role → `isInternalCall = true`):** unchanged write-through, so manual refresh and cron still update the score.
- Widen the gate: `shouldPreserveExistingMrs = (suppressIncomingMrsSnapshot || adoptExistingMrs) && existingIsReadyRow`. The adoption block at line ~9394 already assigns every `canonical*` field, so the Brief copy and the client response echo the adopted score automatically.
- Add a structured log `[canonical-mrs] adopted_existing_snapshot` with `{ userId, localDate, window, incomingScore, existingScore, isInternalCall }`.
- Brief copy generation, signal pills, calendar/wearable context and `brief_snapshots` persistence are untouched.

**Deploy + verify before starting Change 5:**
1. Deploy `compute-outer-readiness`.
2. Pick a user with a ready `daily_context_snapshot` row for today's window; record `inner_score` via `read_query`.
3. Trigger a browser brief load; check edge-function logs for `adopted_existing_snapshot` with `isInternalCall: false`.
4. Re-read the row — `inner_score` and `readiness_score_baseline` must be unchanged.
5. Confirm a service-role refresh still updates the row.

---

## Change 5 — scoped client compute suppression (only after 4 is verified)

**File:** `src/utils/energyStateEngine.ts`

- Signature becomes `computeEnergyState(userId?: string, options?: { snapshotOnly?: boolean })`.
- Return `SNAPSHOT_ONLY_STUB` when `options?.snapshotOnly === true && HOME_SNAPSHOT_ONLY`, before the cache read and before any `supabase.functions.invoke`. Do not write the stub into the cache, so a later live caller (Coach) still gets a real compute.
- The stub is modelled exactly on the existing failure stub at line ~1138: every non-nullable `CurrentEnergyState` field present, `energyTier: 'managing'`, `status: 'stale'`, `overallBalance: null`. This keeps `generateRecommendations()` and the JIT reads of `energyState.energyTier` type-safe and crash-free.

**Callers passing `{ snapshotOnly: true }` (5):** `TodayStateCard.tsx`, `DailyRitualCard.tsx`, `JustInTimeIntervention.tsx`, `RecommendedPlan.tsx`, `PerformancePreparation.tsx`.

**Callers left on the live path (3):** `useCoachConversation.ts`, `coachContextBuilder.ts`, and `fetchOuterReadiness` in `useOuterReadiness.ts` (already short-circuited upstream at line 922 — passing the option there would be dead code).

Each of the five home callers renders its existing empty/awaiting state on the stub; any that lacks a guard gets a null guard in the same pass.

---

## Verification

- `tsgo` typecheck clean.
- Existing suites: `computeOuterReadinessMrsResilienceGuards.test.ts`, `snapshotContractGuards.test.ts`, `useOuterReadiness.test.ts`, `useOuterReadiness.authFailure.test.ts`.
- New unit test: `computeEnergyState(id, { snapshotOnly: true })` performs zero `supabase.functions.invoke` calls and returns `energyTier: 'managing'` / `status: 'stale'`; `computeEnergyState(id)` still invokes `compute-inner-readiness`.
- Browser check on `/`: no `compute-inner-readiness` request on Home mount; Coach surface still receives a populated energy state.

## Out of scope

`compute-inner-readiness`, `build-executive-home-cards`, `generate-mastery-plan`, the Plan engine, the `HOME_SNAPSHOT_ONLY` default, and `daily_context_snapshot` schema.
