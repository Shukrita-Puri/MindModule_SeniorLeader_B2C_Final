# Executive Home Cards — Regenerated SSOT

**Source of truth:** current codebase as of 2026-07-15
**Scope:** Executive Home only
**Status:** implementation-aligned SSOT regenerated from live code

## 1. Scope

This SSOT covers the current live contract for:

1. Mental Readiness Score (MRS)
2. Performance Readiness Brief
3. Today's 3 Performance Priorities (Plan)

It reflects the code that currently ships, including live fallbacks, snapshot precedence, and incomplete migrations still present in the system.

## 2. System Model

Executive Home is now primarily a snapshot-driven system centered on a per-window orchestrator.

Main orchestrator:

- `supabase/functions/build-executive-home-cards/index.ts`

Primary outputs:

- `daily_context_snapshot`
- `brief_snapshots`
- `mastery_plan_snapshots`

## 3. Time Windows

The active card window is:

- `morning` for 05:00-11:59
- `afternoon` for 12:00-17:59
- `evening` for 18:00-04:59

Window resolution is timezone-aware and based on effective timezone, not just raw client offset.

## 4. Build Modes

Current orchestrator modes:

- `scheduled`
- `manual_refresh`
- `manual_replay`
- `backfill`
- `dry_run`

Compatibility alias:

- `checkin_save` -> `manual_refresh`

## 5. Build Sequence

Current orchestrated card build sequence:

1. resolve effective timezone
2. resolve current local date and active window
3. apply centralized day-type cadence gate
4. load daily context inputs
5. compute MRS
6. build/persist Brief
7. build/persist Plan

Important behavior:

- scheduled runs respect cadence suppression
- manual refresh / replay / backfill can bypass cadence suppression
- manual refresh can force Plan generation even when stage-one signal is absent

## 6. Day-Type and Cadence

Current cadence gating is centralized in the orchestrator before card generation.

Authoritative files:

- `supabase/functions/build-executive-home-cards/day-type.ts`
- `supabase/functions/build-executive-home-cards/index.ts`

Current principle:

- orchestrator decides whether a user/window should run
- downstream card functions decide what content to generate within an allowed run

## 7. Travel and Effective Timezone

Travel is now a live producer/consumer path, not a future-state placeholder.

Producer:

- `supabase/functions/travel-state-sync/index.ts`

Consumer paths:

- `build-executive-home-cards`
- `compute-outer-readiness`
- `generate-mastery-plan` fallback rebuild logic

Current rule:

- effective timezone is resolved server-side
- travel state freshness must not be inferred from `updated_at` alone

## 8. Card 1 — MRS

### 8.1 Role

MRS is the numeric readiness engine for the Executive Home experience.

Current output surface includes:

- display score
- baseline/refined split
- readiness state
- displayed tier
- band / band valence
- divergence flag
- weight provenance
- week-over-week delta

### 8.2 Compute contract

`compute-inner-readiness` computes MRS. It does not persist the card snapshot itself.

Persistence mirror is performed by:

- `compute-outer-readiness`

### 8.3 Awaiting rules

Current awaiting behavior is score-safe:

- awaiting returns null score surfaces rather than fabricated low numbers
- band is null in awaiting
- tier labels become awaiting labels

### 8.4 Read labels

Current user-facing readiness state labels are:

- `Full read`
- `Early read`
- `Awaiting signals`

Owner:

- `src/utils/readinessLabels.ts`

### 8.5 WoW delta

Current WoW behavior is composition-matched.

The delta is suppressed when:

- compositions mismatch
- either side is awaiting
- there is not enough history

Current client hook:

- `src/hooks/useWeeklyMrsDelta.ts`

## 9. Card 2 — Brief

### 9.1 Role

The Brief is the prose interpretation layer for Executive Home.

It is built by:

- `supabase/functions/compute-outer-readiness/index.ts`

### 9.2 Current prompt version

Current frontend/backend prompt version:

- `v7.7-calendar-load-honesty` (was `v6.6-replacement-vocabulary`; the deterministic fallback was reinstated at v6.6 and is validated by `validateBrief()` before it ships)

### 9.3 Current snapshot behavior

Brief rows are persisted into `brief_snapshots`.

Current cache replay behavior:

- only LLM rows are replayed from cache
- deterministic rows are intentionally ignored for snapshot replay

### 9.4 Current fallback reality

The live code still contains deterministic Brief support, but current response and cache behavior are stricter than older implementations.

What is true today:

- deterministic code paths still exist
- `brief_source` may still be `deterministic`
- explicit awaiting behavior now wins when signal contract or inner state is awaiting
- deterministic rows are not treated as valid replay cache hits

### 9.5 Validation

Current validators enforce:

- phrase constraints
- body word ceiling
- signal evidence constraints
- data-availability honesty
- structural four-beat validation

This means the Brief body contract is no longer prompt-only.

### 9.6 Snapshot-read-first status

Brief rendering is currently snapshot-read-first but not fully snapshot-only.

Current truth:

- snapshot can render score or copy
- live `useOuterReadiness` is still needed for part of the wearable/source contract

## 10. Card 3 — Plan

### 10.1 Role

The Plan is the per-window performance-priority card.

Built by:

- `supabase/functions/generate-mastery-plan/index.ts`

Persisted to:

- `mastery_plan_snapshots`

### 10.2 Current Plan contract

The Plan is window-scoped.

Each row is keyed by:

- `user_id`
- `plan_date`
- `mrs_window`

### 10.3 Brief-to-Plan parity

Current source precedence for Brief behavior inside Plan:

1. inline `outerReadinessCache.behaviourSnapshot`
2. persisted current-window Brief snapshot
3. local fallback rebuild

Important nuance:

- the orchestrated Executive Home path sets `strictBriefHandshake: true`
- legacy callers can still allow local fallback rebuild

### 10.4 Slot allocation

Current allocator behavior:

- true rest day -> zero slots
- non-rest day -> no duplicate fabricated JIT slots when only one candidate exists
- dominant structural event -> phase-aware slot construction with state fallback when a phase is unavailable

### 10.5 Why-line behavior

Current why-line path is hybrid:

- deterministic baseline line is always available
- LLM can overwrite when accepted
- validator blocks title/practice/slot-label echo
- deterministic repair fallback is used on rejection

### 10.6 Persistence status contract

Current snapshot statuses:

- `ready`
- `awaiting`
- `error`

Current protections:

- awaiting rows are persisted
- awaiting rows do not overwrite ready rows
- non-rest-day empty horizon payloads are explicitly logged

### 10.7 Current lineage gap

Schema fields exist for:

- `brief_snapshot_id`
- `source_context_snapshot_id`

Current writer gap:

- `brief_snapshot_id` is still written as `null`
- `source_context_snapshot_id` is not currently populated

## 11. Snapshot Read Contracts

### 11.1 MRS

MRS UI is snapshot-first, with live fallback when needed.

### 11.2 Brief

Brief snapshot read is current-window scoped and filtered by prompt version.

### 11.3 Plan

Plan snapshot read precedence is:

1. current-window ready
2. latest same-date ready
3. current-window awaiting
4. latest same-date awaiting

Important current truth:

- cross-window fallback is allowed
- cross-window fallback is logged as a structured warning

## 12. Current Honest Architecture Statement

The Executive Home implementation is not yet a pure single-snapshot architecture. It is a partially consolidated snapshot system with a strong orchestrated path and a smaller number of legacy or fail-open fallbacks still present.

What is consolidated today:

- orchestrator exists
- per-window snapshots exist
- Plan strict handshake exists on orchestrated path
- travel-state producer exists
- WoW composition guard exists
- rest-day zero-slot allocator exists
- four-beat Brief validation exists

What is still partially transitional:

- Brief deterministic support still exists
- Brief snapshot-read-first is incomplete
- Plan still allows local rebuild outside strict orchestrated paths
- Plan and downstream consumers can still fall back across windows in some cases
- snapshot lineage fields are not fully populated

## 13. Current Real Gaps

These are the main live-code gaps that still matter:

1. Universal strict Brief-to-Plan parity is not enforced for every caller.
2. Plan lineage fields are incomplete.
3. Brief snapshot-only rendering is not finished.
4. Plan reader still allows cross-window fallback.
5. Downstream consumers are not all pure snapshot readers yet.

## 14. Usage Note

Use this regenerated SSOT when auditing or extending the current codebase. Older Executive Home SSOTs should be treated as historical references unless they match the implementation described here.
