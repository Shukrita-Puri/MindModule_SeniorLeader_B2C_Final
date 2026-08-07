# Resilience Capacity — drop Protected Goals, loosen the two pattern signals

Scope: the Resilience Capacity pill only, inside `_shared/signal-pills/derive-pills.ts`. No other pill, no MRS scoring change, no brief/plan/nudge change.

## Verified current state

In `derive-pills.ts`, Resilience today pushes tiers from:

```text
sleep efficiency  (primary anchor)      >=85 green, >=70 amber, else red
HR-elevated proxy (fallback, no sleep)  full tier
emotion / regulation / pressure         check-in overlays
sustainedDeficitFlag                    -> red
cooccurrence_count >= 3                 -> red ;  == 2 -> amber
protectionGoals.length > 0 AND (calendar high OR high-stakes) -> amber
```

The two pattern signals come from `_shared/signal-engine/pattern-engine.ts`:

- `detectSustainedDeficit`: HRV <= -20% of the **30-day** baseline for **2 consecutive samples**, walking back from the most recent. Days with no HRV are skipped rather than breaking the streak.
- `computeHrvLoadCooccurrence`: joins HRV days to per-day calendar load over a **7-day** window; counts days where HRV <= **-10%** of the 30-day baseline **and** the load tier is exactly **`high`**. Anchors the window on days that have HRV.

Important constraint confirmed by search: `sustained_deficit_flag` is **not** private to the pill. It is consumed by `compute-inner-readiness`, `generate-mastery-plan`, `smart-nudges`, and `compute-outer-readiness` (where it applies a -5 MRS penalty). So the global definition must not be loosened, or scores and nudges move. The plan therefore introduces a **separate, resilience-only strain read** and leaves the global flag byte-identical.

## 1. Remove Protected Goals from Resilience

- Delete the `protectionGoals.length > 0 && (calendarPressure === 'high' || hasStakesEarly)` amber push.
- Remove `protectionGoalsCount` from the pill's `contributors` so the tooltip stops showing a permanently-zero line.
- `protectionGoals` stays in the function signature and stays available to every other consumer — only Resilience stops reading it.

No tier can get *worse* from this change; a small number of green-to-amber demotions become green.

## 2. Sustained deficit -> a graded, shorter-window strain read

Add a resilience-local helper (new export in `pattern-engine.ts`, additive, nothing renamed):

```text
computeHrvStrain(hrvRecent, baseline14d):
  take the last 3 HRV samples within the trailing 5 calendar days
  need >= 2 samples, else 'unknown' (no push)
  avgDev = mean deviation of those samples vs the 14-day baseline
  avgDev <= -15%  -> red
  avgDev <= -7%   -> amber
  else            -> green
```

Why this fixes the emptiness:

- **Averages, not streaks.** One good day no longer wipes out a genuinely depleted week. shukrita's 6 Aug (-30%) and 4 Aug (-7%) average to roughly -18% -> red, where the current rule reads "No".
- **14-day baseline, not 30.** Reacts to the last fortnight rather than being anchored to data the user may not have; also becomes usable ~2 weeks after connecting instead of ~4.
- **Gap-tolerant but bounded.** A 5-day lookback for 3 samples suits an intermittently-worn ring without silently joining month-old days.
- **Graded.** Amber exists, so the signal contributes a read far more often than the current all-or-nothing red.

Resilience switches to `computeHrvStrain`. **Physical Reserves keeps the existing `sustainedDeficitFlag` red push unchanged**, so nothing outside Resilience shifts.

## 3. HRV x High-Demand -> wider window, softer thresholds, ratio-aware

Loosen `computeHrvLoadCooccurrence` by parameter, keeping the same function and return shape:

```text
window            7d      -> 14d
HRV deficit gate  -10%    -> -5%
baseline          30d     -> 14d (same baseline as above, one definition)
load tier         high    -> high OR medium
```

And re-tier on the ratio rather than the raw count, so a sparse calendar still produces a read:

```text
days_observed < 3            -> no push (honest "not enough history")
ratio >= 0.40 or count >= 3  -> red
ratio >= 0.20 or count == 2  -> amber
else                          -> green
```

Also anchor the window on the union of HRV dates and load dates instead of HRV dates only, so calendar-only days count toward `days_observed` correctly.

Effect for a user like shukrita: with a calendar that started 6 Aug, `days_observed` stays under 3 for about another week and the contributor honestly reads "not enough history" — but once a fortnight of data exists it will produce a real green/amber/red instead of a permanent "None observed", because medium-load days now count and the deficit gate is half as strict.

## Net effect on the pill

Resilience keeps four inputs: sleep efficiency (or HR proxy), the three check-in overlays, the HRV strain read, and the HRV-vs-demand read. Two of the four now produce a graded read on realistic data instead of firing almost never. Worst-tier-wins composition, the freshness gate, `checkin_only` handling, score-bearing rules and the `regulationRiskPill` override are all untouched.

## Isolation guarantees

- `sustained_deficit_flag` keeps its exact current definition and value everywhere: MRS penalty, inner-readiness, plan, nudges, Physical Reserves.
- No MRS weight, subscore or redistribution change; the Resilience pill remains non-score-bearing in the same conditions as today.
- No frontend change beyond `PillTooltip.tsx` dropping the Protected Goals line and relabelling the two pattern rows to their new windows.
- No schema change.

## Tests

In `derive-pills.test.ts` and a new `pattern-engine` case set:

- Protected goals present + high calendar pressure -> Resilience no longer ambers on that basis.
- `protectionGoalsCount` absent from contributors.
- Strain: two samples averaging -18% -> red; -9% -> amber; -3% -> green; one sample only -> no push.
- Strain does not alter `sustainedDeficitFlag` or the Physical Reserves tier in the same input.
- Co-occurrence: `days_observed` 2 -> no push; ratio 0.5 -> red; ratio 0.25 -> amber; medium-load day now counted.
- Existing 39 resilience cases still pass.

## Deploy

Redeploy `compute-outer-readiness` (it bundles both shared modules). Verify against the affected account that Resilience shows a graded read and the Protected Goals row is gone.