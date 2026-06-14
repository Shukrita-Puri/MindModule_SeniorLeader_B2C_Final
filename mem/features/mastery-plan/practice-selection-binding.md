---
name: Plan practice-selection intent binding
description: Verb→meta_skill→Recalibrate-category mapping that binds Today's Priorities content selection to slot intent.
type: feature
---

# Plan practice-selection binding

Today's Performance Priorities picks one practice per slot. The **filler selector** in `generate-mastery-plan` was scoring only by `state_signal` + `favorites` + recency, so a "Sharpen focus" slot could win with a `meta-renewal` practice (e.g. `ikigai-purpose`) because `confidence_level ≤ 2` triggered a +15 state-signal boost.

## Single source of truth

`supabase/functions/_shared/plan/practice-selector.ts` — `deriveSlotIntent()` maps the slot's `(stateAction, ceoVerb, anchorCategory, anchorPhase, practicePriorityTag)` to preferred `metaSkills`, `recalibrateCategories`, and `combo`. `scoreContentAgainstIntent()` returns an additive boost (and a hard −12 penalty when the content's meta_skill is **only** something the intent does not want). Used in the filler scorer on top of state-signal / favorites / recency scoring.

## Verb → intent table

Mirror of `docs/RECALIBRATE_TAGGING_AUDIT.md`. If you change one, change the other.

| Slot verb family | Intent | meta_skill | category | Combo |
| --- | --- | --- | --- | --- |
| Sharpen / Decide / Re-consolidate focus / Prime for focus / anchor=E | focus/flow-mastery | meta-clarity | presence | mindset.flow |
| Recover / Reset / Land / Settle / Decompress / phase=post | recovery/renewal | meta-renewal, meta-recalibration | pause | mindset.reenergise |
| Re-anchor circadian rhythm / anchor=G | circadian | meta-recalibration, meta-renewal | pause | somatic.reenergise |
| Build capacity / Activate / Lead / Present | activation/presence | meta-recalibration, meta-clarity | power-up, presence | somatic.flow |
| Steady the system / Ground / Hold (default) | regulation/composure | meta-recalibration | pause | somatic.pause |

## Data dependencies

- `sanctuary_content.category` and `sanctuary_content_metadata.meta_skill` — populated and driving selection.
- `sanctuary_content.protocol_type` — **41/41 populated** (June 2026 backfill). The existing +4 combo tiebreaker in `practice-selector.ts` is now firing for the first time.
- `sanctuary_content_metadata.mastery_category` — **41/41 populated, but NOT yet read by the selector.** At the moment of the backfill, `mastery_category.primary === meta_skill[0]` for every row (mechanically derived from `meta_skill`), so there is currently no divergent signal to score — wiring it now would only stack score on conditions that already trigger via the existing meta_skill branch. Wiring lands with the post-MVP "More like this" workstream, once a richer editorial taxonomy lets the two fields genuinely differ. See `docs/RECALIBRATE_TAGGING_AUDIT.md` § "mastery_category — populated but not yet wired".

## Companion fixes shipped in the same change

`composeStateLabel` in `generate-mastery-plan/index.ts`:
1. Bare `else anchor = "today's load"` replaced with a time-of-day phrase (`this morning` / `this afternoon` / `this evening` / `the day ahead` on weekends) so the title can't claim a calendar load that doesn't exist.
2. `managing`-tier default `Re-consolidate focus` is now gated on an actual focus signal (anchor category E, cog-dominant demand, or `practicePriorityTag = 'focus_clarity'`). Otherwise falls back to `Steady the system`.

## Out of scope

Brief copy/prompt, MRS scoring, JIT horizon, dedupe key, signal pills, UI, RLS. Primary `selectPracticesByCombo` path is untouched — it already has recency penalty and combo-driven type matching.

## Tests

`supabase/functions/_shared/plan/practice-selector.test.ts` — 8 cases covering all five intent branches plus null-safety.

## Telemetry

Filler logs `[generate-mastery-plan][filler] intent-scored selection` per slot with `intent`, `intentTargets`, `selectedId`, `selectedMetaSkill`, `intentTotal`, `finalScore`. Watch for `intentTotal <= 0` rates climbing.