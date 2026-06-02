## Goal

Make wearable + calendar + patterns + CEO behaviours the canonical Brief / Plan / MRS inputs. Reduce check-in to a refiner. Add explicit source provenance and pill ↔ MRS coherence. Keep the shared snapshot / event-taxonomy / CEO-behaviour architecture intact, preserve Brief↔Plan parity already landed.

## Current state (verified by reading the relevant files)

- `compute-outer-readiness` already gates on `hasState1Input = freshWearable || activeCalendar || calendarConnected || todayCheckIn`. So Brief technically *does not* require check-in — but only because `calendarConnected` keeps the gate permissive. If a user has no wearable, no calendar, and no check-in, the brief still goes to `awaitingSignals: true` (cold-start). That part is correct and must be kept.
- `awaitingSignals` still nulls out 25+ surfaced fields (score, tier, pills, etc.) — fine for cold start, but the suppression is currently the only "source of truth" surfaced to the client.
- `awaitingReason` only ever has one value (`cold-start-no-context`) so the client cannot tell why baseline failed.
- `useOuterReadiness.ts` has a separate `prb-awaiting:` localStorage cache that can re-paint a stale "awaiting" state across mounts. If wearable/calendar landed after the awaiting payload was cached, the user keeps seeing skeleton until the next network resolve.
- `innerReadinessScore` arrives from the client (`computeEnergyState`) which is overwhelmingly check-in driven. Server never recomputes a baseline-only score from wearable + calendar + patterns. There is no `sourceProvenance` on the response.
- `assertPillCoherence` exists but only warns in dev and auto-corrects silently. No structured discrepancy is surfaced.
- `generate-mastery-plan` correctly does **not** suppress on `awaitingSignals` (comment confirms it), and reads `briefBehaviour` from the snapshot — that parity work stays as is.

## Changes

### 1. Backend — `compute-outer-readiness/index.ts`

1. Rename the cold-start gate to be explicit about "no baseline":
   - Keep `awaitingSignals` API for backwards compat with cached clients.
   - Add `briefMode: 'baseline' | 'refined' | 'cold-start'` to the response.
     - `cold-start` — no wearable, no calendar connected, no check-in.
     - `baseline` — wearable and/or calendar present, no check-in for today.
     - `refined` — check-in present (regardless of wearable/calendar).
   - Add `awaitingReason` enum: `'cold-start-no-context' | null`. Today is already only ever the first value; lock it.
2. Add a structured `sourceProvenance` block on the response that lists, per surfaced field, which signals contributed:
   ```ts
   sourceProvenance: {
     mrs: { sources: ('wearable'|'calendar'|'pattern'|'ceo-behaviour'|'checkin')[], primary, refinedBy: 'checkin'|null },
     brief: { sources: [...], briefSource: 'llm'|'deterministic' },
     pills: { decision_readiness: [...], physical_reserves: [...], resilience_capacity: [...] },
   }
   ```
3. Replace `assertPillCoherence` dev-only warn with a structured `pillCoherence` block on the response: `{ inSync: boolean, adjustments: Array<{ pill, from, to, reason }> }`. Auto-correct still applies; the client decides whether to surface it.
4. Stop nulling `signalPills`, `pillQualifiers`, `innerReadinessScore*`, etc. when `briefMode === 'baseline'`. Only suppress those fields in `cold-start` mode. The deterministic pill engine already runs from wearable + calendar + patterns; we should expose its output even when check-in is missing.
5. Compute and surface a `baselineReadinessScore` derived from `physComposite` + `demandScore` (the inputs already exist in this function via `computePhysiologicalComposite` and `computeCalendarDemand`). When check-in is present, keep `innerReadinessScore` as the refined value and add `baselineReadinessScore` as the parallel "pre-refiner" number with `refinedContribution = score - baseline`.

### 2. Backend — `_shared/signal-engine`

- `divergence-flag.ts`: no behaviour change; export a `divergenceProvenance(input)` helper that returns which dimensions actually contributed (used by `sourceProvenance.mrs`).
- `checkin-pattern-aggregator.ts`: extend `assertPillCoherence` to return `{ corrected, adjustments }` instead of throwing/warning.
- `build-daily-context.ts`: no change to logic; orchestrator already null-safe.
- `window-context.ts`: no change — already the SSOT consumed by the Brief.

### 3. Backend — `_shared/load-brief-behaviour-snapshot.ts`, `brief-prompt-version.ts`, `behaviour-snapshot.ts`, `behaviour-wiring.ts`, `brief-validators.ts`

- No structural change. Bump `BRIEF_PROMPT_VERSION` because the response shape grows new fields (`briefMode`, `sourceProvenance`, `pillCoherence`, `baselineReadinessScore`). The signature-hash + loader already handle the version bump cleanly.

### 4. Backend — `generate-mastery-plan/index.ts`

- Read `briefMode` from the `outerReadinessCache` / snapshot and stop using `awaitingSignals` as a proxy for "no inputs". Plan should generate in `baseline` and `refined` modes — only skip in `cold-start`.
- Tag each scored module with `provenance: ('wearable'|'calendar'|'pattern'|'ceo-behaviour'|'checkin')[]` so the Plan UI can render the same source chips as the Brief.

### 5. Client

- `src/hooks/useOuterReadiness.ts`:
  - Add `briefMode`, `sourceProvenance`, `pillCoherence`, `baselineReadinessScore` to `OuterReadinessData`.
  - Treat `briefMode === 'cold-start'` as the only "render skeleton" state. `briefMode === 'baseline'` must paint the brief + pills + score normally.
  - Kill the `prb-awaiting:` cache path for `baseline` mode (only cache awaiting when cold-start), so a baseline brief never reverts to skeleton across mounts. Bump cache namespace from `prb-cache:` → `prb-cache-v2:` so old `awaitingSignals: true` rows from yesterday are dropped.
  - `cacheKeyPrefixes` updated; on sign-in we sweep old `prb-cache:` / `prb-awaiting:` keys once.
- `src/utils/persistentBriefCache.ts`: add v2 keys + the sweep helper.
- `src/pages/ExecutiveHome.tsx`, `src/components/home/DecisionReadinessBrief.tsx`, `src/components/home/TodayThreePriorities.tsx`, `src/components/home/DailyRitual.tsx`:
  - Switch the gating `awaitingSignals === true` checks to `briefMode === 'cold-start'`.
  - Keep displaying `phrase / bodyText / pills / score` whenever `briefMode !== 'cold-start'`.
- `src/components/CheckInVisibilityGuard.tsx`: no change (visibility-only).

### 6. Tests

Add under `supabase/functions/_shared/`:

- `signal-engine/divergence-flag.test.ts` — provenance helper.
- `signal-engine/checkin-pattern-aggregator.test.ts` — pillCoherence adjustment payload.
- `compute-outer-readiness.contract.test.ts` (new lightweight contract test using fixture rows): asserts
  - **baseline-only Brief**: wearable + calendar, no check-in → `briefMode: 'baseline'`, phrase + body + pills + score all populated, `sourceProvenance.mrs.refinedBy === null`.
  - **check-in refiner**: baseline + check-in → `briefMode: 'refined'`, `baselineReadinessScore` still present, `refinedContribution !== 0`.
  - **cold-start regression**: no signals → `briefMode: 'cold-start'`, pills/score null, prior gating preserved.
  - **pill ↔ MRS coherence**: MRS Depleted + all-green pills → adjustment surfaced.
- `_shared/load-brief-behaviour-snapshot.test.ts` — extend to cover the new `briefMode` field round-trip.

## Technical details

- `sourceProvenance.mrs.primary` is the highest-weighted input that actually had a value (wearable > calendar > pattern > ceo-behaviour > checkin). `refinedBy` is `'checkin'` when a check-in row exists for today, else `null`.
- `baselineReadinessScore` is computed only from wearable composite + calendar demand + pattern signals (no Mind dims), so it is stable even when the user has not checked in.
- Cache namespace bump (`prb-cache-v2:`) is the single mechanism for invalidating any client that has a stale "awaiting" payload from the previous shape — no in-app migration code needed.
- `BRIEF_PROMPT_VERSION` bump invalidates persisted `brief_snapshots` rows for the new contract — the loader already disambiguates by version.

## Out of scope

- No DB schema changes.
- No changes to inner-readiness scoring math (Mind dims keep their weights — we just expose baseline alongside).
- No changes to Smart Nudges shape beyond reading `briefMode` (already reads the snapshot).

## Verification

- `bunx vitest run supabase/functions/_shared` — new + existing tests pass.
- Hand-test in preview with a user that has wearable but no check-in: Brief, pills, MRS, Plan all render.
- Force `cold-start` by clearing wearable + calendar + check-in: skeletons render as before.
