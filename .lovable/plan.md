
## Scope

Implement the MVP-load-bearing parts of the Recalibrate tagging remediation: close the real detection gaps (untagged rows, missing `sub_type`) and cheaply populate `mastery_category` + `protocol_type` while we're in the data. **Defer** the selector wiring for `mastery_category` to the post-MVP "More like this" work, because Step 3's mechanical derivation makes `mastery_category.primary === meta_skill[0]` for all 41 rows — there is no new signal to score against yet.

No changes to `practice-selector.ts`, `generate-mastery-plan/index.ts` selector hydration, or `practice-selector.test.ts` in this pass.

## Step 1 — Refresh `docs/RECALIBRATE_TAGGING_AUDIT.md`

- Active count: 39 → **41** (add `release-exhale-new`, `wim-hof-cold-fire`).
- New "Known gaps to backfill" section listing:
  - 2 fully-untagged rows (no `meta_skill` / `state_signal`): `release-exhale-new`, `wim-hof-cold-fire`.
  - 15 rows missing `sub_type` (the list from Step 2).
- New section **"mastery_category — populated but not yet wired"** explaining that the column is now backfilled for all 41 rows but `practice-selector.ts` does not read it yet. This is intentional, not an oversight: at migration time `mastery_category.primary === meta_skill[0]` by construction, so there is no divergent signal to score. Wiring will land with the "More like this" editorial taxonomy work.
- Flip the schema-reality table:
  - `mastery_category`: 0/39 → **41/41 (populated, not wired)**.
  - `protocol_type`: 0/39 → **41/41 (populated, +4 tiebreaker now fires)**.
  - `sub_type`: 26/39 → **41/41**.

## Step 2 — Data migration: close meta_skill / state_signal / sub_type gaps

Single data migration (insert tool, not schema migration). All values live in `sanctuary_content` or `sanctuary_content_metadata`; no DDL.

- `release-exhale-new`: `meta_skill = ['meta-recalibration']`, `state_signal = ['signal-tense','signal-overloaded']`, `sub_type = 'tool'` (re-assert in case live differs from audit).
- `wim-hof-cold-fire`: `meta_skill = ['meta-recalibration','meta-renewal']`, `state_signal = ['signal-depleted','signal-low-energy']`, `sub_type = 'tool'`.
- 15 rows missing `sub_type` → all `'tool'`: `box-breathing`, `kapalabhati-pranayama`, `bhramari-pranayama`, `trataka-flame-gaze`, `deep-calm-forest-bathing`, `harmonic-calm`, `vagus-wind-down`, `basque-txalaparta`, `warrior-drums`, `energised-focus-didgeridoo-bowls`, `deep-focus-monastic-resonance`, `sustained-focus-choir-harmonic`, `energy-forge`, `pranayama-clarity`, `ina-night-fields`.

Before writing the migration, run a `SELECT` to confirm the live `sub_type` / `meta_skill` values match the audit; if any of the 15 already has a non-null `sub_type`, drop it from the UPDATE list.

## Step 3 — Data migration: populate `mastery_category` for all 41

```
mastery_category = {
  "primary":   <first meta_skill>,                              -- e.g. "meta-clarity"
  "secondary": [<remaining meta_skills…>, <recalibrate category>]  -- e.g. ["meta-recalibration","presence"]
}
```

Mechanical, derivable from the now-correct `meta_skill` + `category` data. Run **after** Step 2 so the two untagged rows have their `meta_skill` to derive from.

No selector code changes.

## Step 4 — Data migration: backfill `protocol_type` for all 41

`protocol_type = 'mindset'` if `sub_type='mindset'` OR title contains reflection/identity language (e.g. "Reflection", "Observer", "Ikigai", "Stoic", "Future Self", "Phoenix", "Arena", "Eye of", "Simplicity", "Subtraction", "Single Thread", "Constraint", "Presence Through", "Eternal Now", "Detachment", "Confidence Through Evidence", "Energy Through Reframe", "Restore Energy Through Completion", "First Move", "Rhythm Through The Pulse"). Otherwise `'somatic'`.

The +4 combo tiebreaker hook already exists in `practice-selector.ts` and reads this column — this migration just lets it fire for the first time. **No selector code changes.**

## Step 5 — Refresh `mem/features/mastery-plan/practice-selection-binding.md`

- Record that `mastery_category.{primary, secondary}` is now populated for all 41 active practices but is **not yet read** by `practice-selector.ts`.
- State explicitly: at the moment of this migration, `mastery_category.primary === meta_skill[0]` for every row (by construction in Step 3), so there is currently no new signal to wire — the selector continues to rank purely on `meta_skill` / `state_signal` / `category` / `protocol_type`, unchanged.
- Note that `protocol_type` is now populated → the existing +4 combo tiebreaker is active for the first time.
- Cross-link to the new "mastery_category — populated but not yet wired" section of the audit doc.

## Verification (after Steps 2–4 land)

1. Re-run the audit SQL at the bottom of `RECALIBRATE_TAGGING_AUDIT.md` — expect **41/41** on `meta_skill`, `state_signal`, `sub_type`, `protocol_type`, and `mastery_category` (no `{primary:null}` rows).
2. Spot-check 2–3 of the 15 newly-tagged-`sub_type` rows in `[generate-mastery-plan][filler]` logs — confirm they now appear in candidate pools for slots whose `sub_type` filter previously excluded them.
3. Confirm `practice-selector.ts` was not modified (defensive — Step 5 is doc-only).

## Deferred to post-MVP — "More like this" workstream

When a richer editorial taxonomy is introduced that lets `mastery_category` diverge from `meta_skill[0]`:

- Wire `masteryCategoryPrimary` / `masteryCategorySecondary` into `ScorableContent` and `scoreContentAgainstIntent` in `practice-selector.ts`.
- Hydrate the columns in `generate-mastery-plan/index.ts` (~line 2775).
- Add the corresponding cases to `practice-selector.test.ts`.
- At that point, evaluate whether the new branch should be **mutually exclusive** with the existing `meta_skill[0]` +18 branch rather than additive, to avoid double-counting once the two fields genuinely diverge.

**Why deferred:** the proposed +25 primary-mastery-category branch would fire on the exact same condition as the existing +18 `meta_skill[0]` branch (because Step 3 derives one from the other), stacking to +43 for every row that currently scores +18 — pure score amplification with no new information and no MVP-visible quality gain, plus regression-test surface for a divergence that doesn't exist yet.

## File touch-list

- `docs/RECALIBRATE_TAGGING_AUDIT.md` — refresh (Step 1).
- `mem/features/mastery-plan/practice-selection-binding.md` — refresh (Step 5).
- Three data migrations via the insert tool (Steps 2, 3, 4) — `sanctuary_content` and `sanctuary_content_metadata` UPDATEs only, no DDL.

**Explicitly not touched:**
- `supabase/functions/_shared/plan/practice-selector.ts`
- `supabase/functions/generate-mastery-plan/index.ts`
- `supabase/functions/_shared/plan/practice-selector.test.ts`
