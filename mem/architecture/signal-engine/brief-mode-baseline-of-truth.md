---
name: Brief Mode — Baseline Source of Truth
description: Canonical client-facing signal contract — briefMode ∈ {cold-start, baseline, refined} with source provenance + pill↔MRS coherence.
type: architecture
---

The Brief / Plan / MRS pipeline uses `briefMode` as the single client-facing
contract for "is the rendered output gated by user inputs":

- `cold-start` — no wearable, no calendar connected, no check-in today. UI
  renders skeleton. Server nulls phrase/body/pills/score. Legacy
  `awaitingSignals === true` maps here.
- `baseline`   — wearable and/or calendar present, no check-in for today.
  Brief + pills + MRS render from wearable + calendar + patterns + CEO
  behaviours. Check-in is **not** required.
- `refined`    — check-in present (with or without baseline). Score gets a
  ±15 refinement around the baseline; pills pick up Mind dim qualifiers.

Source: `supabase/functions/compute-outer-readiness/index.ts` derives the
mode from `hasFreshWearable || hasCalendarSignal || hasCalendarConnected ||
hasTodayCheckIn` (cold-start when none) and `hasTodayCheckIn` (refined when
true, baseline when false). The pure rule is mirrored in
`_shared/signal-engine/brief-mode-contract.test.ts` so any divergence
between the docs and the edge function fails CI.

Side-channels on the response:
- `sourceProvenance.mrs` — `{ sources, primary, refinedBy }` from
  `divergenceProvenance` in `_shared/signal-engine/divergence-flag.ts`.
- `pillCoherence` — `{ inSync, adjustments[] }` from `assertPillCoherence`
  in `_shared/signal-engine/checkin-pattern-aggregator.ts`. Surfaces drift
  between deterministic pill tiers and the MRS tier.
- `baselineReadinessScore` — wearable composite + (inverted) calendar
  demand, stable even when no check-in. `innerReadinessScore` stays the
  refined display number; `baselineReadinessScore` is the pre-refiner.

Client rule: gate skeleton on `briefMode === 'cold-start'`. **Never** gate
on `!hasTodayCheckIn` — that re-introduces the regressed check-in gate.

Cache: `prb-cache-v2:` / `prb-awaiting-v2:` namespace. Old `prb-cache:` /
`prb-awaiting:` keys are dropped on sign-out via `cacheKeyPrefixes`.

Prompt version: bump `BRIEF_PROMPT_VERSION` in
`_shared/brief-prompt-version.ts` when the response shape grows new
top-level fields — the signature-hash loader handles invalidation.