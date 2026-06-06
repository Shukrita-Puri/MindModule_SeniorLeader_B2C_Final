---
name: Plan Why-line prompt + validator contract
description: Per-priority "Why this matters" LLM contract — shared StateBand from briefBehaviour, SlotAnchor identity, forgiving validator, deterministic fallback.
type: feature
---

# Plan "Why this matters" — prompt + validator contract

The Plan owns the one-line justification for each Today's Priority. The Brief orients ("here's how the day feels, here's how to carry yourself"); the Plan justifies ("here's why I put THIS move on your schedule"). The Plan is the surface that answers *"how do I improve my readiness?"* — the Brief never does.

## Single-source state band

`WhyLLMInput.stateBand` is read directly off `shared.briefBehaviour` — the same server-computed band powering the MRS dial and the Brief. **Never re-banded.** When the snapshot is missing → `stateBand=null` → the prompt drops the band-discipline block and the validator's valence gate is skipped (event-anchor grounding still required). Tier→band mapping lives in `tierToStateBand()` in `_shared/plan/why-llm.ts`:

- `peak → firing`, `strong → sharp`, `managing → steady`, `depleted → depleted`
- Canonical band names accepted directly (forward-compat).
- Unknown → `null` (degrade gracefully).

## SlotAnchor identity

`SlotAnchor = { eventTitle, categoryId, phase }` is built ONCE per slot in `generate-mastery-plan` and passed to both `buildPriorityTitle` AND the Why LLM input. This structurally eliminates the "title says Board Meeting, why-line says 1:1 with Sarah" drift class.

`composeWhyLine` already reads slot-scoped anchor identity for its deterministic clauses; anchor clauses gate on **both** `categoryId` AND `eventTitle` presence — never emit half an anchor.

## Arc position

Derived from `jitPhase` via `arcPositionFromPhase()`:
- `pre → prepare`, `during → during`, `post → recover`, unknown/missing → `standalone`.

Same field the dedupe key `${eventId}::${jitPhase}` uses, so justification and dedupe agree on what "different" means. Unknown phases default to `standalone` so future `jitPhase` values never crash the layer.

## Validator (`validateWhyLine`) — asymmetric and forgiving

Engineered to fail closed ONLY on clear contradictions. Stylistic variance is left to telemetry + downstream monitoring.

1. **Anchor / state grounding (asymmetric)** — accept if EITHER an anchor token OR a state token is present.
   - Anchor tokens: forgiving tokenizer that keeps `1:1`-style compounds, drops short stopwords, folds in per-category aliases (e.g. cat D adds `conversation`, `feedback`) + words from `selfRegulationFocus`.
   - State tokens (band-keyed, narrow): depleted/stretched → `/low|running low|reserves|stretched|tired|drained|behind/`; firing/sharp → `/sharp|firing|clear|edge|locked in|on form/`; steady → `/steady|holding|on track|even/`.
   - Band=null: anchor grounding is required (no state allowlist available).
2. **Valence gate (only when band ≠ null)** — narrow on purpose:
   - firing/sharp: rejects `/recover|recovery|recharge|wind down|come down|refill|rest up/`. `protect|preserve|maintain|hold|clear` are NOT rejected (read as performance language across bands).
   - depleted/stretched: rejects `/push|sprint|spend the edge|go harder|lean in|grind/`.
3. **No lexical arc check** — arc framing is prompt-guided only. We do not validate "contains 'before/after'" — that drives template fatigue.
4. **Dedupe** — `jaccard > 0.85` ONLY when the prior accepted line shares both `slotAnchor.eventTitle` AND `arcPosition`. Different events with similar wording both ship.
5. **Fallback** — on any reject the LLM output is dropped and the existing deterministic `buildModuleEventWhyLine` repair path runs. No retry, no second LLM call.

## Telemetry (function-log only)

Per slot:
- `band` (`firing|sharp|steady|stretched|depleted|null`)
- `bandSource` (`shared_brief_behaviour | missing`)
- `arc` (`prepare|during|recover|standalone`)
- `fallback` (`llm_accepted | deterministic_repair`)
- `reject` (`null | generic | valence_firing_recovery | valence_depleted_push | jaccard_dup | empty`)
- `anchorTokens` (`true | false`)

Watch `fallback=deterministic_repair` rate before tightening anything further. If it climbs above ~15%, the validator is over-constrained (most likely the state allowlist) — loosen the regex before retraining the prompt.

## Code locations

- `supabase/functions/_shared/plan/why-llm.ts` — `WhyLLMInput`, `validateWhyLine`, `tierToStateBand`, `arcPositionFromPhase`, `anchorTokens`, prompt builder.
- `supabase/functions/_shared/plan/title-prefixes.ts` — `SlotAnchor`, `buildPriorityTitle` (accepts `slotAnchor` preferentially; legacy `eventTitle`/`category` fields kept for back-compat).
- `supabase/functions/generate-mastery-plan/index.ts` — single `slotAnchor` per slot fed to both title + Why LLM input; validator-driven accept loop with telemetry.

## Tests

- `supabase/functions/_shared/plan/priority-title.test.ts` — cross-event leakage (E category + Board title → E's verb wins).
- `supabase/functions/_shared/plan/why-llm-validator.test.ts` — 13 cases covering all grounding/valence/alias/dedupe paths + null-band degradation + unknown-phase safety.

## Out of scope (do NOT touch when iterating)

Brief prompt/copy, Plan slot ordering, JIT horizon, dedupe key, MRS scoring, signal pills, UI components, DB schema, RLS, edge function config.
