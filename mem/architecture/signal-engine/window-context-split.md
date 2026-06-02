---
name: Window Context Split (Morning / Afternoon / Evening)
description: Three pure window-context builders + behaviour-snapshot layer share one daily context across Brief, Plan, and Nudges.
type: architecture
---

## Producers and consumers

- `_shared/signal-engine/build-daily-context.ts` — ONLY producer of `daily_context_snapshot`. Fetches HRV bundle, 3-day load, 60-day DOW history, demand, pattern signals, strategic context. Do not duplicate.
- `_shared/signal-engine/window-context.ts` — dispatcher. Picks `morning|afternoon|evening` builder based on `getTimeOfDay(now.getHours())`.
- `_shared/signal-engine/{morning,afternoon,evening}-context.ts` — pure derivations over pre-fetched inputs. NO DB calls. NO throws on missing data — null-safe everywhere.
- `_shared/signal-engine/_event-utils.ts` — shared internal helpers (split-by-now, load-score, conflict, highest-category, back-to-back, deviation%). Not exported from window-context.ts.
- `_shared/events/format-taxonomy.ts` — formatter that emits the `=== EVENT TAXONOMY ===` block from `classifyEvent` + `EVENT_CATEGORIES`. Single source of pillar copy — never re-state in prompts.
- `_shared/behaviour-snapshot.ts` — runs `evaluateForScope` twice (brief + plan) against ONE `SignalCoverageInput`, returns `{flagsBrief, flagsPlan, slotBoosts, promptBlockBrief, promptBlockPlan, taxonomyBlock, signatureHash}`. The LLM still sees only the two pre-formatted strings.

## Rules

1. Brief / Plan / Nudges MUST consume `behaviour-snapshot` instead of calling `evaluateForScope` directly. This is what guarantees Brief ↔ Plan coherence.
2. Intraday HR is only read in the afternoon window. Morning uses overnight HRV + RHR + sleep. Evening uses afternoon HR avg + latest HRV.
3. `mode = 'jit_remaining'` in evening context is the §3.1 gear-shift trigger — when true, the consumer suppresses Close framing and directs toward completing the remaining JIT prep first.
4. `recoveryNote` is derived deterministically from `(today load × tomorrow pressure)` — `rest` when both heavy, `light` when one heavy or today medium, else `normal`.
5. Window builders are pure functions; never add DB calls. Consumers fetch and pass the inputs.
6. `signatureHash` from the behaviour snapshot must be stamped onto `brief_snapshots.input_signature` so drift between Brief and Plan reads of the same `(user, local_date, window)` is detectable.

## Why

`compute-outer-readiness` and `generate-mastery-plan` previously called `evaluateForScope` independently with different `extras`, causing the Brief to name events the Plan never boosted. One snapshot, one row, two reads — incoherence becomes structurally impossible.