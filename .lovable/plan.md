# Stress Load — mean HR, trailing baseline, long-block focus window

## First, the question: what is "Calm" and what is "Acute"

They are not thresholds. The Stress Load grid uses a 7-stop coral ramp that is scaled **relative to the user's own highest cell in the window**:

- Every cell value is `delta bpm` = (event-window HR) − (resting baseline), rounded.
- `maxObserved` = the largest cell value in the whole grid.
- Colour index = `floor(value / maxObserved * 7)` — so the palest stop ("Calm") is a delta near 0 bpm and the darkest ("Acute") is a delta at or near that user's own maximum.

So "Acute" means "your heaviest bucket this window", not a clinical band, and the same +25 bpm cell can look pale for one user and dark for another. Empty cells (no HR samples overlapping the event) stay neutral. No change proposed to this — flagging it because the labels imply absolute meaning they don't have.

## The three changes (Stress Load delta path only)

All three land in `supabase/functions/cause-effect-engine/index.ts`, in the two places that currently compute `peak − restingBaseline` per event:

1. the Stress Load matrix loop (builds `stressMatrix.cells`, `n`, `subLabels`)
2. the `subcategory_lift` rollup, which the Stress Load card renders as the breakdown line under the grid

The Section B blocks on "When You Perform Best" (`hr_event_lift`, `category_lift`, `sleep_to_peak`, `rhr_recovery_window`) keep the existing peak-based maths untouched, so this stays isolated to Stress Load.

### Fix 2 — mean HR instead of peak (first)

Replace `peak = max(v)` with `mean_hr = mean(v)` over samples in `[start, end]`, and set `delta = mean_hr − baseline`. Sample selection window, skip logic (no samples → event omitted), cell aggregation (mean of deltas per bucket), and the output field name `delta` all stay as they are.

### Fix 1 — per-event trailing baseline with cascading fallback (second)

For each event, in order: mean resting HR over the 14 days before the event date (needs ≥3 values) → widen to 30 days (needs ≥3) → whole-window mean (today's behaviour) → if no resting HR anywhere, skip the event. Record the tier used as `baseline_source: "14d" | "30d" | "window"`, exposed in diagnostics only. Minimum data gates and confidence tiers (emerging n≥3, strong n≥5) unchanged.

### Fix 3 — duration gate for long blocks (third)

If `end − start > 90 minutes`, mark `long_block = true` and compute `mean_hr` from the first 45 minutes only. If that focus window holds fewer than 3 samples, fall back to the full window. Shorter events are unchanged. Long blocks still contribute to the matrix; `long_block` is reported per event in diagnostics.

## Verification

Read-only query for shukrita@mindmodule.me over the 60-day window reproducing the new maths, dumped as: date, day, event, mean_hr, baseline_used, baseline_source, delta, long_block, sample_count. Expected direction: the flight and hotel rows (+83, +67 bpm on peak maths) drop substantially once mean HR and the 45-minute focus window apply.

## Technical notes

- Both delta sites will share one helper (`eventHrDelta(event, samples)` returning `{ delta, meanHr, baselineUsed, baselineSource, longBlock, sampleCount }`) so the two paths cannot drift.
- Diagnostics: extend the `_diagnostics.ts` payload with a `stressLoadEvents` array carrying the per-event metadata above. Additive — no existing field changes shape.
- `ENGINE_VERSION` is currently **11**, not 6 (the audit document is stale). It will be bumped to **12** to force one silent recompute per user; bumping to 7 would go backwards and break the `cachedPayload.version < ENGINE_VERSION` recompute check.
- No UI copy, card component, or downstream consumer changes. `signal_summary` keys stay identical.
- Deploy `cause-effect-engine` only.
- The audit doc `docs/INSIGHTS_DRAIN_AND_LIFT_CARDS_AUDIT.md` gets its Stress Load formula section and verification dump refreshed to match.
