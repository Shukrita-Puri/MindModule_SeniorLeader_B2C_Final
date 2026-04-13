
## What’s happening now

The current card is not faithfully following `docs/PERFORMANCE_READINESS_BRIEF_LOGIC.md`.

### Confirmed mismatches
1. **Wearable pills are not doc-accurate**
   - The doc expects HRV, Sleep, and RHR to each show an **interpreted front** and a **raw/baseline back** across red/amber/green states.
   - The current code only creates HRV/Sleep/RHR pills when thresholds are crossed.
   - When signals are “normal”, it collapses everything into one bundled `wearable-steady` pill, which is why users don’t see the “true picture” consistently.

2. **Mind pill is not doc-accurate**
   - The doc defines the **Mind** chip from the **clarity × confidence matrix**, with front text like “Clarity sharp / moderate / low (+ confidence variant)” and back text `C:x/5 · Co:y/5`.
   - The current code instead creates a separate `felt` chip from `checkInOutcome` (`Mind sharp`, `Mind steady`, etc.), so it is not using the documented cognitive signal logic.

3. **Patterns are computed upstream but not rendered in pills**
   - The edge function returns enrichment fields like `scoreTrajectory7d`, `wearableTrend7d`, `typicalDOWScore`, `hrvEventCorrelation`, and check-in counts.
   - The doc also references consecutive low days, DOW comparisons, and tactical patterning.
   - The current chip builder does not convert these into visible pattern pills.

4. **The “body card” flip is too weak**
   - It is technically using `backLabel`, but only as a text swap.
   - The doc says flippable chips should behave like a real front/back interaction and auto-reset after 4 seconds.
   - Current implementation has no auto-reset and no stronger affordance beyond a helper line.

5. **The system can drift from the doc because the doc is not encoded as a contract**
   - Right now, the logic doc is descriptive, but the component is free to diverge.
   - There are no tests or shared config enforcing the chip inventory, priority, or front/back formatting.

## Implementation plan

### 1. Re-align chip architecture to the doc
Refactor `buildSignalChips()` in `src/components/home/DecisionReadinessBrief.tsx` so chips follow a stable, doc-backed structure:

- **Body / wearable domain**
  - Separate into:
    - `hrv`
    - `sleep`
    - `rhr` / `heart`
  - Each should always render an **analysed front label** when data exists, even if green/at baseline.
  - Each should always render a **detail back label** with value + deviation + baseline when available.

- **Mind domain**
  - Replace outcome-led “felt” chip as the primary cognitive pill with a **clarity × confidence derived chip** per the doc.
  - Keep outcome as supporting context only if needed, not the main mind chip.

- **Pattern domain**
  - Add at least one pattern pill when qualifying pattern data exists:
    - consecutive low confidence / low days
    - score trajectory vs 7d
    - typical DOW comparison
    - wearable trend / HRV-event correlation when available

### 2. Make front/back labels consistent and informative
Adopt a consistent format for all signal pills:

- **Front = analysis**
  - Examples:
    - `HRV below baseline`
    - `Sleep at baseline`
    - `RHR elevated`
    - `Clarity low + confidence high`
    - `3rd low-confidence day`

- **Back = evidence**
  - Examples:
    - `25ms · -18% vs 44ms baseline`
    - `7h 12m · +4% vs 6h 55m baseline`
    - `58bpm · +12% vs 52bpm baseline`
    - `C:2/5 · Co:4/5`
    - `Today is below your usual Monday`

This ensures red/orange/green all still show the “true picture”.

### 3. Preserve the documented signal priority instead of ad hoc additions
Implement a fixed chip-priority cascade so the card stays stable and doesn’t “change too much” over time:

```text
1. Calendar pills
2. HRV pill
3. Sleep pill
4. Heart/RHR pill
5. Mind pill (clarity × confidence)
6. Pattern pill
```

Then cap visible signal chips deliberately rather than slicing arbitrary output. This prevents important cognitive or pattern pills from being pushed out unpredictably.

### 4. Upgrade flip behavior to match the documented interaction
Improve `FlippableChip` so it matches the spec better:

- use an actual front/back flip treatment instead of plain label swap
- auto-reset flipped state after ~4 seconds
- keep keyboard/touch support
- add a subtle flip icon or micro-affordance only for chips with `backLabel`

This addresses the current “the body card is still not flippable” perception.

### 5. Reduce doc drift by turning the logic doc into implementation guardrails
To ensure the system stops drifting from `PERFORMANCE_READINESS_BRIEF_LOGIC.md`:

- create a small shared chip-spec layer in the component or a helper file that maps:
  - chip IDs
  - eligibility rules
  - front-label rules
  - back-label rules
  - color thresholds
- add targeted tests for:
  - green/amber/red wearable states all render
  - mind pill derives from clarity/confidence
  - pattern pill appears when pattern fields exist
  - steady states still show analysed text on front and raw evidence on back
- update the doc only where the current intended behavior has truly changed, otherwise change code to match the doc

## Files to update

### `src/components/home/DecisionReadinessBrief.tsx`
Main work:
- rebuild chip generation around doc-backed categories
- separate HRV / Sleep / Heart
- replace outcome-led mind chip with clarity-confidence mind chip
- add pattern chip(s)
- improve flip behavior and auto-reset
- keep soft color palette already introduced

### `src/hooks/useOuterReadiness.ts`
Likely extend the TS interface so the client can safely consume any missing pattern fields needed for pills, such as:
- consecutive low clarity
- typical DOW outcome
- score vs typical DOW
- any explicit pattern label if already available upstream

### `supabase/functions/compute-outer-readiness/index.ts`
Only if required after audit:
- expose any pattern fields the doc expects but the client does not currently receive cleanly
- especially low-clarity streak or explicit pattern summary fields, since only `consecutiveLowConfidence` is currently returned

### `docs/PERFORMANCE_READINESS_BRIEF_LOGIC.md`
Tighten the signal-pill section so it becomes the canonical UI contract, including:
- separate HRV / Sleep / Heart pills
- mind pill sourced from clarity × confidence
- pattern pill rules
- exact front/back behavior
- cap/priority order

## Why this will fix your concern

This approach makes the pills **stable, predictable, and doc-led**:
- the wearable picture always shows, whether good, okay, or bad
- the back of each pill shows the evidence behind the analysis
- mind sharpness becomes tied to the documented clarity/confidence logic
- patterns become visible instead of remaining hidden upstream
- future changes become less likely to drift because the chip system will be encoded as a contract, not just improvised in the component

## Verification after implementation

1. **Wearable always visible**
   - HRV, Sleep, and Heart/RHR each show analysed front labels when data exists
   - Green states still show, not only red/orange

2. **Back of pill shows evidence**
   - Example: `25ms · -18% vs 44ms baseline`

3. **Mind pill visible**
   - Derived from clarity/confidence matrix, not only check-in outcome

4. **Pattern pill visible when applicable**
   - Example: `3rd day low confidence` or `Below your usual Monday`

5. **Flip feels real**
   - visual flip + auto-reset + clear affordance

6. **Doc alignment**
   - card behavior matches the logic doc, with only intentional documented deviations

## Suggested implementation order

1. Rebuild chip generation around HRV / Sleep / Heart / Mind / Pattern
2. Add/clean missing upstream pattern fields if needed
3. Improve flip behavior
4. Add tests/guardrails
5. Update doc to reflect final canonical contract
