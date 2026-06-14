# Recalibrate Tagging Audit

_Last refreshed: 2026-06-14. Re-run the query at the end of this file to refresh._

## Why this exists

The Plan's "Today's Performance Priorities" picks one (or more) practice per
slot. Until June 2026 the **filler** selector scored content only by
`state_signal`, `favorites`, foundational status, recency, and content-type
diversity — it never read `meta_skill`, Recalibrate `category`, or the
protocol-combo prescribed for the slot. Result: a slot whose verb said
_"Sharpen focus"_ could win with a `meta-renewal` practice from the
_Presence_ shelf (e.g. **Purpose-Driven Flow Through Ikigai**), simply
because the user's `confidence_level ≤ 2` triggered a +15 state-signal
boost that beat everything else.

This document is the catalog-side companion to the fix in
`_shared/plan/practice-selector.ts`. It captures the **actual** state of
the metadata so future scorer changes know what they can rely on.

## Schema reality (June 2026)

| Column                            | Populated? | Used by selector? |
| --------------------------------- | ---------- | ----------------- |
| `sanctuary_content.category`      | 41/41      | ✅ (`pause` / `power-up` / `presence`) |
| `sanctuary_content.sub_type`      | **41/41**  | ⚠️ candidate-pool filter (`mindset` / `tool`) |
| `sanctuary_content.protocol_type` | **41/41**  | ✅ +4 combo tiebreaker (now firing for the first time) |
| `sanctuary_content_metadata.meta_skill`        | **41/41** | ✅ primary intent signal |
| `sanctuary_content_metadata.mastery_category`  | **41/41 (populated, not yet wired)** | ⏸ deferred — see section below |
| `sanctuary_content_metadata.state_signal`      | **41/41** | ✅ secondary intent signal |
| `sanctuary_content_metadata.moment`            | 39/39 | ✅ moment-of-day filter |
| `sanctuary_content_metadata.horizon`           | 39/39 | ✅ filler horizon partition |

As of the June 2026 backfill, every active practice is fully tagged.
`protocol_type` now drives the existing +4 combo tiebreaker in the
selector. `mastery_category` is populated but **not yet read** by the
selector — see "mastery_category — populated but not yet wired" below.

## Known gaps to backfill

_All closed as of the June 2026 backfill. Preserved here as a record of
what was fixed:_

- **2 fully-untagged rows** had no row in `sanctuary_content_metadata`
  at all (so the audit's "39/39" was actually 39/41):
  - `release-exhale-new` — now `meta_skill = [meta-recalibration]`,
    `state_signal = [signal-tense, signal-overloaded]`.
  - `wim-hof-cold-fire` — now `meta_skill = [meta-recalibration,
    meta-renewal]`, `state_signal = [signal-depleted, signal-low-energy]`.
- **15 rows missing `sub_type`** (silently excluded from the `tool`
  candidate pool for slot filters) — all set to `'tool'`:
  `basque-txalaparta`, `bhramari-pranayama`, `box-breathing`,
  `deep-calm-forest-bathing`, `deep-focus-monastic-resonance`,
  `energised-focus-didgeridoo-bowls`, `energy-forge`, `harmonic-calm`,
  `ina-night-fields`, `kapalabhati-pranayama`, `pranayama-clarity`,
  `sustained-focus-choir-harmonic`, `trataka-flame-gaze`,
  `vagus-wind-down`, `warrior-drums`.
- **`protocol_type` was 0/41** — backfilled deterministically:
  `mindset` when `sub_type='mindset'` OR title contains identity/reflection
  language (Reflection, Observer, Ikigai, Stoic, Future Self, Phoenix,
  Arena, Eye of, Simplicity, Subtraction, Single Thread, Constraint,
  Presence Through, Eternal Now, Detachment, Confidence, Reframe,
  Completion, First Move, Rhythm Through The Pulse). Otherwise `somatic`.
  Two edge cases worth knowing:
  - `presence-grounding-new` resolves to `mindset` because the title
    matches "Presence Through", even though it's a somatic tool. Low
    impact (combo bonus is only +4) — re-tag manually if a future
    editorial pass disagrees.
  - `jobs-simplicity` resolves to `somatic` because the title is
    "Clarity Through Elimination" (not "Simplicity") despite the slug.

## mastery_category — populated but not yet wired

`sanctuary_content_metadata.mastery_category` is now populated for all
41 active rows with the shape:

```
{
  "primary":   <first meta_skill>,
  "secondary": [<remaining meta_skills…>, <Recalibrate category>]
}
```

**This column is intentionally not read by `practice-selector.ts` yet.**

The reason: at the moment of this backfill,
`mastery_category.primary === meta_skill[0]` for every row (by
construction in the migration). Wiring it into the scorer right now
would fire the proposed +25 primary-mastery-category branch on exactly
the same condition as the existing +18 `meta_skill[0]` branch — pure
score amplification with no new information, while still adding new
weight tiers and regression-test surface for a divergence that doesn't
yet exist.

The wiring lands with the post-MVP "More like this" feature, which
introduces a richer editorial taxonomy where `mastery_category` can
genuinely diverge from `meta_skill[0]`. At that point we'll also
evaluate whether the new branch should be mutually exclusive with (vs
additive to) the `meta_skill[0]` branch to avoid double-counting.

Populated now (rather than at that future point) so the migration is
done while we're already in the data — "More like this" doesn't need
a second data pass.

## Verb → intent → metadata mapping

Mirrors `deriveSlotIntent()` in `_shared/plan/practice-selector.ts`. If
you change one, change the other.

| Slot state verb                              | Intent label         | Preferred `meta_skill`            | Preferred Recalibrate `category` | Combo               |
| -------------------------------------------- | -------------------- | --------------------------------- | -------------------------------- | ------------------- |
| _Sharpen / Decide / Prime for focus / Re-consolidate focus_ | focus/flow-mastery   | `meta-clarity`                   | `presence`                       | `mindset.flow`      |
| _Recover / Reset / Land / Settle / Decompress_              | recovery/renewal     | `meta-renewal`, `meta-recalibration` | `pause`                          | `mindset.reenergise` |
| _Re-anchor circadian rhythm_                                | circadian            | `meta-recalibration`, `meta-renewal` | `pause`                          | `somatic.reenergise` |
| _Build capacity / Activate / Lead / Present_                | activation/presence  | `meta-recalibration`, `meta-clarity` | `power-up`, `presence`           | `somatic.flow`      |
| _Steady the system / Ground / Hold_ (default)               | regulation/composure | `meta-recalibration`              | `pause`                          | `somatic.pause`     |

## Catalog snapshot (39 active practices)

### Pause (11) — primarily regulation/composure

| ID | Title | `meta_skill` | `sub_type` |
| --- | --- | --- | --- |
| fudoshin-immovable-mind | Calm in Chaos Through Fudōshin | meta-recalibration | tool |
| eye-of-storm | Clarity in Chaos Through The Eye | meta-clarity | mindset |
| deep-calm-forest-bathing | Deep Calm Forest Bathing | meta-recalibration, meta-renewal | – |
| detachment-observer-new | Detachment Through The Observer | meta-clarity, meta-recalibration | mindset |
| grounding-touch | Instant Calm Through Somatic Touch | meta-recalibration | tool |
| harmonic-calm | Nervous System Reset Through Tibetan Bowls | meta-recalibration, meta-renewal | – |
| pranayama-clarity | Pranayama Clarity Breath | meta-clarity, meta-recalibration | – |
| presence-grounding-new | Presence Through Grounding | meta-recalibration | tool |
| softness-release-new | Softness Through Release | meta-recalibration, meta-renewal | mindset |
| stillness-gap-new | Stillness Through The Gap | meta-clarity | mindset |
| vagus-wind-down | The Vagus Wind-Down | meta-recalibration, meta-renewal | – |

### Power-up (12) — activation, courage, energy

| ID | Title | `meta_skill` | `sub_type` |
| --- | --- | --- | --- |
| basque-txalaparta | Basque Txalaparta | meta-recalibration | – |
| energised-focus-didgeridoo-bowls | Didgeridoo & Bowls | meta-clarity | – |
| confidence-through-evidence | Confidence Through Evidence | meta-recalibration | mindset |
| courage-arena | Courage Through The Arena | meta-renewal | mindset |
| courage-future-self | Courage Through The Future Self | meta-renewal | mindset |
| kapalabhati-pranayama | Kapalabhati Pranayama | meta-recalibration, meta-clarity | – |
| energy-reframe | Energy Through Reframe | meta-recalibration, meta-renewal | mindset |
| energy-forge | Energy Through The Forge | meta-recalibration | – |
| buddhist-phoenix | Resilience Through Buddhist Phoenix | meta-renewal, meta-recalibration | mindset |
| energy-through-completion | Restore Energy Through Completion | meta-clarity, meta-recalibration | mindset |
| box-breathing | Tactical Composure Through Box Breathing | meta-recalibration | – |
| warrior-drums | Warrior Drums Activation | meta-recalibration | – |

### Presence (16) — primarily focus / clarity (Flow Mastery)

| ID | Title | `meta_skill` | `sub_type` |
| --- | --- | --- | --- |
| jobs-simplicity | Clarity Through Elimination | meta-clarity | tool |
| bhramari-pranayama | Deep Focus Through Bhramari Pranayama | meta-clarity, meta-recalibration | – |
| deep-focus-monastic-resonance | Deep Focus with Monastic Resonance | meta-clarity | – |
| depth-subtraction | Depth Through Subtraction | meta-clarity | mindset |
| wu-wei-flow | Effortless Action Through Wu Wei | meta-clarity | tool |
| single-thread-focus | Entry Through The Single Thread | meta-clarity | mindset |
| mushin-no-mind | Fluid Performance Through Mushin | meta-clarity, meta-recalibration | mindset |
| ina-night-fields | Ina Night Fields (Tsukiyomi) | meta-renewal | – |
| mastery-constraint | Mastery Through Constraint | meta-clarity | mindset |
| first-move-momentum | Momentum Through The First Move | meta-clarity, meta-recalibration | mindset |
| trataka-flame-gaze | One-Pointed Focus Through Trataka | meta-clarity | – |
| eternal-now-presence | Presence Through The Eternal Now | meta-recalibration | mindset |
| **ikigai-purpose** | **Purpose-Driven Flow Through Ikigai** | **meta-renewal** | mindset |
| rhythm-pulse | Rhythm Through The Pulse | meta-renewal, meta-recalibration | mindset |
| stoic-reflection | Stoic Evening Reflection | meta-renewal, meta-clarity | mindset |
| sustained-focus-choir-harmonic | Sustained Focus with Choir Harmonic | meta-clarity | – |

## Known anomalies

1. **`ikigai-purpose` is shelved as `presence` but tagged `meta-renewal`.**
   It's a meaning-making practice, not a focus practice. Under the new
   selector a "Sharpen focus" slot will rank it _below_ the
   `meta-clarity` cohort (intent score −12 vs +18). Consider re-shelving
   to `pause` or re-tagging the meta-skill — whichever matches editorial
   intent.
2. **Three `presence` rows are tagged `meta-renewal` (`ina-night-fields`,
   `ikigai-purpose`, `rhythm-pulse`)** — they will only surface on
   recovery slots, not focus slots.
3. **`protocol_type` is entirely NULL.** Until backfilled, the
   protocol-combo signal contributes at most +4 (vs +18 from meta_skill).

## How to refresh this table

```sql
SELECT
  m.content_id,
  m.mastery_category,
  m.meta_skill,
  sc.category,
  sc.protocol_type,
  sc.sub_type,
  sc.title
FROM sanctuary_content_metadata m
JOIN sanctuary_content sc ON sc.id = m.content_id
WHERE sc.is_active = true
ORDER BY sc.category, sc.title;
```