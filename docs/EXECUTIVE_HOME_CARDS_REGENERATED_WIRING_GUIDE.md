# Executive Home Cards — Regenerated Wiring Guide

**Source of truth:** current codebase as of 2026-07-15
**Scope:** Executive Home card wiring only
**Status:** regenerated from live implementation, not from historical target-state docs

## 1. Purpose

This guide maps the current end-to-end wiring for the three Executive Home cards:

1. Mental Readiness Score (MRS)
2. Performance Readiness Brief
3. Today's 3 Performance Priorities (Plan)

It describes the actual live call order, persistence contract, snapshot readers, and fallback behavior now present in the codebase.

## 2. Core Card Order

The current orchestrated path builds cards in this order:

1. `build-executive-home-cards`
2. `compute-inner-readiness`
3. `compute-outer-readiness`
4. `generate-mastery-plan`

Primary orchestrator:

- `supabase/functions/build-executive-home-cards/index.ts`

Important live note:

- The orchestrator exists and is active.
- `mode: "checkin_save"` is normalized to `manual_refresh`.

## 3. Shared Runtime Inputs

The orchestrator resolves these inputs before building cards:

- effective timezone via `resolveEffectiveTimezone`
- local date and active window
- day-type cadence gate
- merged today/tomorrow calendar slices for cadence decisions
- latest wearable row and rolling baselines
- latest check-in for the active window
- dry-run / scheduled / manual mode behavior

Authoritative files:

- `supabase/functions/build-executive-home-cards/index.ts`
- `supabase/functions/build-executive-home-cards/day-type.ts`
- `supabase/functions/build-executive-home-cards/scheduler.ts`
- `supabase/functions/_shared/effective-timezone.ts`

## 4. Card 1 — MRS Wiring

### 4.1 Compute path

The current orchestrator calls `compute-inner-readiness` directly after assembling sub-scores and signal availability.

Authoritative files:

- `supabase/functions/build-executive-home-cards/index.ts`
- `supabase/functions/compute-inner-readiness/index.ts`
- `supabase/functions/_shared/signal-engine/mrs-v4-subscores.ts`

### 4.2 What the orchestrator sends

Current inputs include:

- active window
- fresh/stale/missing wearable status
- HRV deviation
- sleep score / sleep hours
- RHR trend
- demand score
- pattern signals
- check-in dimensions

The orchestrator treats MRS as genuinely ready only when:

- `readinessState !== "awaiting"`
- numeric `score`
- numeric `scoreBaseline`
- no awaiting flag in `weightProvenance`

### 4.3 Persisted MRS writer

`compute-inner-readiness` computes only. The persistence mirror into `daily_context_snapshot` is owned by `compute-outer-readiness`.

Authoritative writer:

- `supabase/functions/compute-outer-readiness/index.ts`

### 4.4 Current read path

MRS UI reads snapshot first, then falls back to live payload when needed.

Authoritative readers:

- `src/hooks/useMrsSnapshot.ts`
- `src/hooks/useOuterReadiness.ts`
- `src/components/home/mrs/MrsPage.tsx`

### 4.5 Week-over-week delta

WoW delta is currently a separate server/client path:

- server: `supabase/functions/mental-fitness-scores/index.ts`
- client: `src/hooks/useWeeklyMrsDelta.ts`
- consumer: `src/components/home/mrs/MrsPage.tsx`

The live code suppresses WoW when:

- composition mismatch
- awaiting signals
- not enough history

## 5. Card 2 — Brief Wiring

### 5.1 Compute path

The orchestrator calls `compute-outer-readiness` after MRS.

Current role of `compute-outer-readiness`:

- reads server-side calendar and wearable context
- runs Brief LLM / fallback logic
- writes `brief_snapshots`
- mirrors canonical MRS payload into `daily_context_snapshot`
- writes signal pills and snapshot metadata

Authoritative file:

- `supabase/functions/compute-outer-readiness/index.ts`

### 5.2 Context-only preflight

`compute-outer-readiness` still supports `contextOnly: true` for calendar usability preflight.

That path returns before snapshot persistence.

### 5.3 Cache and replay rules

Brief cache key is still:

- `user_id`
- `local_date`
- `time_window`
- `input_signature`
- `prompt_version`

Current prompt version:

- `v6.6-replacement-vocabulary`

Current cache behavior:

- only `brief_source = 'llm'` rows are replayed from cache
- deterministic rows are ignored for cache replay

Authoritative files:

- `supabase/functions/_shared/brief-prompt-version.ts`
- `src/constants/briefPromptVersion.ts`

### 5.4 Current fallback reality

The live code still supports deterministic Brief fallback objects internally, but the response/persistence path now explicitly drives true awaiting behavior whenever signal contract or inner state is awaiting.

Important nuance:

- deterministic fallback code still exists
- cache replay ignores deterministic rows
- `brief_source` can still be `deterministic`
- the live behavior is stricter than older docs, but not a full deletion of deterministic support

### 5.5 Brief snapshot-read-first

Current Brief UI is snapshot-read-first but not snapshot-only.

Current state:

- `useCurrentBriefSnapshot` reads current-window snapshot through an Edge Function
- snapshot rendering is allowed when copy or score payload exists
- Brief UI still overlays snapshot data on top of live `useOuterReadiness`
- wearable/source provenance is not yet fully reconstructable from snapshot alone

Authoritative files:

- `src/hooks/useCurrentBriefSnapshot.ts`
- `src/components/home/DecisionReadinessBrief.tsx`
- `supabase/functions/get-current-brief-snapshot/index.ts`

## 6. Card 3 — Plan Wiring

### 6.1 Compute path

The orchestrator calls `generate-mastery-plan` after Brief and passes:

- `outerReadinessCache`
- explicit `mrsWindow`
- `strictBriefHandshake: true`

Authoritative file:

- `supabase/functions/generate-mastery-plan/index.ts`

### 6.2 Brief-to-Plan handshake

Current priority order inside Plan:

1. inline `outerReadinessCache.behaviourSnapshot`
2. persisted `brief_snapshots.payload_json.behaviour_snapshot`
3. local rebuild fallback

Important live behavior:

- when `strictBriefHandshake` is true and no valid Brief snapshot is available, Plan returns an awaiting envelope
- when `strictBriefHandshake` is false, local rebuild fallback is still allowed

### 6.3 Plan pipeline

Current live pipeline is:

1. shared context build
2. Brief behavior snapshot load
3. calendar merge and enrichment
4. JIT candidate ranking
5. slot allocation
6. practice selection
7. deterministic title/sub-line composition
8. why-line generation with deterministic repair fallback
9. persistence to `mastery_plan_snapshots`

Key authoritative modules:

- `supabase/functions/_shared/events/jit-candidates.ts`
- `supabase/functions/_shared/jit/select-jit.ts`
- `supabase/functions/_shared/jit/slot-allocator.ts`
- `supabase/functions/_shared/plan/practice-selector.ts`
- `supabase/functions/_shared/plan/title-prefixes.ts`
- `supabase/functions/_shared/plan/why-llm.ts`

### 6.4 Slot allocator

Current allocator behavior:

- `rest_day` returns `slots: []`
- non-rest days do not fabricate duplicate JIT slots when only one meaningful candidate exists
- dominant structural events are phase-aware and can degrade unavailable phases to state fallback

### 6.5 Why-line path

Current why-line generation is:

- deterministic baseline first
- LLM overwrite when accepted
- validation against title echo / practice echo / slot-label echo
- deterministic repair fallback when LLM output is rejected

### 6.6 Persistence contract

Plan persists per-window snapshot rows into `mastery_plan_snapshots`.

Current row behavior:

- `ready` when payload is renderable
- `awaiting` when payload is awaiting or absent
- rest-day with zero modules is still a valid `ready` payload
- awaiting rows never overwrite existing ready rows

Known current limitation:

- `brief_snapshot_id` is still written as `null`
- `source_context_snapshot_id` is not populated here

## 7. Snapshot Readers

### 7.1 Brief snapshot reader

- `supabase/functions/get-current-brief-snapshot/index.ts`
- consumer: `src/hooks/useCurrentBriefSnapshot.ts`

Current rule:

- current window only
- filtered by current `promptVersion`

### 7.2 Plan snapshot reader

- `supabase/functions/get-mastery-plan-snapshot/index.ts`

Current precedence:

1. current-window ready
2. latest same-date ready
3. current-window awaiting
4. latest same-date awaiting

Important live note:

- cross-window fallback is intentional and logged

## 8. Travel and Timezone Wiring

Travel producer now exists:

- `supabase/functions/travel-state-sync/index.ts`

Travel consumer paths include:

- `build-executive-home-cards`
- `compute-outer-readiness`
- `generate-mastery-plan` fallback rebuild path

Important current contract:

- `travel_state.updated_at` is bookkeeping, not freshness truth
- consumers should rely on shared travel freshness logic

## 9. Current Known Gaps

These are real live-code gaps, not historical target-state notes:

1. Plan parity is strict only on the orchestrated path. Legacy callers can still allow local Brief-behavior rebuilds.
2. `mastery_plan_snapshots` lineage fields are incomplete.
3. Brief snapshot-read-first is still partial because wearable/source provenance is not fully snapshot-owned yet.
4. Plan snapshot reader still allows cross-window fallback.
5. Smart Nudges is not yet a pure downstream snapshot consumer in every path.

## 10. Regeneration Note

This file intentionally reflects the current codebase, including live fallbacks and partial migrations. It should replace older wiring guides when auditing present behavior, but it should not be mistaken for a pure target-state architecture spec.
