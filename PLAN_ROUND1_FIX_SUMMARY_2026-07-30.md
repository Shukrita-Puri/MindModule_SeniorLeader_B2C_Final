# Plan Round 1 Fix Summary

**Date:** July 30, 2026  
**Scope:** Follow-up fixes based on `PLAN_ROUND1_FINAL_ASSESSMENT_AND_GUIDE.md`

## Summary

This pass closed the main repo-level correctness gaps in Round 1 around locale-aware day logic, JIT v2 wiring, snapshot persistence, and subcategory follow-through.

At the code level, these areas are already fixed in source and covered by focused checks/tests. The main remaining items are deployment/runtime items that cannot be proven from repo code alone, such as whether all migrations and backfills have already been applied in production.

## Fixed In This Pass

### 1. Locale-aware weekend and local-date correctness

Fixed locale/day-of-week drift across Plan and downstream consumers:

- `supabase/functions/generate-mastery-plan/index.ts`
  - `deriveStructuralDayFlags()` now uses persisted event tags for structural day detection.
  - `classifyAvailability(...)` receives `weekendDays` from `UserLocaleContext`.
  - `isWeekendRestDay` uses locale context instead of hardcoded weekend assumptions.
- `supabase/functions/_shared/plan/user-locale.ts`
  - Canonical `UserLocaleContext` resolution is in place.
  - Shared weekday derivation is used from local ISO date.
- `supabase/functions/_shared/plan/week-ahead-mode.ts`
  - Recovery/planning day logic is locale-aware.
- `supabase/functions/build-executive-home-cards/day-type.ts`
  - Weekend cadence and weekly-planning logic respect locale weekend rules.
- `supabase/functions/evaluate-week-ahead-mode/index.ts`
  - `todayIsOffDay` now uses locale-aware recovery/planning days.
- `supabase/functions/smart-nudges/index.ts`
  - Local date weekday derivation now uses shared helpers.
  - `[dayshape-drift]` telemetry path reads persisted snapshot metadata.
- `supabase/functions/compute-outer-readiness/index.ts`
  - Weekend/recovery/planning logic is locale-aware.
- `supabase/functions/content-feedback/index.ts`
  - Day-of-week derivation now uses local ISO date helpers.
- `supabase/functions/_shared/signal-engine/*`
  - Shared day-kind logic now uses consistent local-date handling.

### 2. JIT v2 live path and shadow path follow-through

Confirmed and fixed JIT v2 integration:

- Live plan generation already uses:
  - `loadJitContextForEvents(...)`
  - `selectJitCandidates(...)`
  - `adaptV2Ranked(...)`
  - `allocatePlanSlots(...)`
- `supabase/functions/generate-mastery-plan/index.ts`
  - Removed the remaining shadow-path weakness where
    `skipCountsByBucket` and `followThroughByBucket` were passed as empty `{}`.
  - Shadow runs now load real tactical counts through the shared JIT loader before calling `selectJitCandidates(...)`.

### 3. Memory and exclusion follow-through

- `WEEK_AHEAD_MEMORY_BOOST` gate is no longer present in repo usage for Plan.
- `supabase/functions/_shared/plan/exclusion-evaluator.ts`
  - Legacy Sunday targeting now uses shared ISO local-date weekday logic.
- `supabase/functions/record-event-priority-signal/index.ts`
  - Event category/subcategory and title-specific memory handling are present in the current code path.

### 4. Slot allocation and ledger correctness

- `supabase/functions/_shared/jit/slot-allocator.ts`
  - Board protect path is present and tested.
  - Locale weekend bug path was fixed earlier in this pass.
- `supabase/functions/generate-mastery-plan/index.ts`
  - Ledger merge now uses time-filtered current-window event title liveness instead of full-day title presence for stale JIT carry-forward checks.

### 5. Snapshot persistence contract

- `supabase/functions/generate-mastery-plan/index.ts`
  - `mastery_plan_snapshots.priorities` is now written through a normalized projection instead of raw horizon modules.
  - Snapshot priorities now persist:
    - `eventCategory`
    - `eventSubcategory`
    - `event_category`
    - `event_subcategory`
    - `event_title_display`
    - `priorityRank`
    - `priority_rank`

### 6. Smart Nudges trace cleanup

- `supabase/functions/smart-nudges/index.ts`
  - Removed dead trace outcome `light_day_strong_state`.
- `supabase/functions/smart-nudges/trace_contract_test.ts`
  - Updated to match the current trace contract.

### 7. Causality subcategory persistence

- `supabase/functions/cause-effect-engine/index.ts`
  - `performance_lift.subcategory_lift` is now sorted deterministically.
  - Top subcategory is derived and persisted to `causality_findings.event_subcategory`.
- Added migration:
  - `supabase/migrations/20260730101500_add_event_subcategory_to_causality_findings.sql`

## Added/Updated Tests

- `supabase/functions/generate-mastery-plan/ledger-evolution.test.ts`
- `supabase/functions/build-executive-home-cards/day-type.test.ts`
- `supabase/functions/_shared/ceo-behaviour-batch2.test.ts`
- `supabase/functions/_shared/ceo-behaviour-rules.test.ts`
- `supabase/functions/_shared/signal-engine/day-kind-detector.test.ts`
- `supabase/functions/_shared/signal-engine/pattern-engine_test.ts`
- `supabase/functions/_shared/plan/__tests__/exclusion-evaluator.test.ts`
- `supabase/functions/generate-mastery-plan/weekly_snapshot_read_test.ts`
- `supabase/functions/smart-nudges/trace_contract_test.ts`
- `supabase/functions/cause-effect-engine/event_subcategory_persistence.test.ts`

## Verification Run

The following checks/tests were run successfully during this fix pass:

- `deno test --allow-env supabase/functions/generate-mastery-plan/ledger-evolution.test.ts`
- `deno test supabase/functions/_shared/jit/slot-allocator.test.ts`
- `deno test supabase/functions/build-executive-home-cards/day-type.test.ts`
- `deno test supabase/functions/_shared/ceo-behaviour-batch2.test.ts`
- `deno test supabase/functions/_shared/ceo-behaviour-rules.test.ts`
- `deno test supabase/functions/_shared/signal-engine/pattern-engine_test.ts`
- `deno test supabase/functions/_shared/signal-engine/day-kind-detector.test.ts`
- `deno test supabase/functions/_shared/plan/__tests__/exclusion-evaluator.test.ts`
- `deno test --allow-read supabase/functions/smart-nudges/trace_contract_test.ts`
- `deno test --allow-read supabase/functions/generate-mastery-plan/weekly_snapshot_read_test.ts`
- `deno test --allow-read supabase/functions/cause-effect-engine/event_subcategory_persistence.test.ts`
- `deno check supabase/functions/compute-outer-readiness/index.ts`
- `deno check supabase/functions/content-feedback/index.ts`
- `deno check supabase/functions/cause-effect-engine/index.ts`
- `deno check supabase/functions/evaluate-week-ahead-mode/index.ts`
- `deno check supabase/functions/smart-nudges/index.ts`
- `deno check supabase/functions/_shared/plan/exclusion-evaluator.ts`
- `deno check supabase/functions/_shared/plan/user-locale.ts`
- `deno check supabase/functions/generate-mastery-plan/index.ts`

## Remaining Items

These items are not code gaps anymore. They still require deployment-time or production verification:

### A. Migration / production state

Repo code now includes the needed migrations, but source alone cannot confirm:

- whether all pending migrations were applied in production
- whether event-tag backfill has completed
- whether historical rows were recalculated where needed

### B. Real-data verification

Still recommended after deploy:

- verify Israeli/GCC users now receive the correct weekend/rest-day slot behavior
- verify light days with zero qualifying JIT candidates persist `mode: "state"` rather than `jit+state`
- verify `causality_findings.event_subcategory` is populated on fresh runs
- verify `mastery_plan_snapshots.priorities[]` contains the normalized category/subcategory aliases

### C. Full production parity / rollout checks

Still worth confirming in a real environment:

- shadow JIT parity analysis output
- successful edge-function deployment for all touched functions
- no stale clients/consumers assume the removed trace outcome still exists

## Recommended Next Step

Deploy the pending migrations and updated edge functions, then run a short production QA pass focused on:

1. locale-aware weekend behavior
2. snapshot writes
3. cause-effect upserts
4. smart-nudges trace rows
5. event-subcategory persistence
