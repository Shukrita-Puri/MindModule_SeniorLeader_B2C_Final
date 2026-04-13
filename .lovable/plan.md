

# Synthesized Mind Pill + Inline Patterns on Signal Pills

## Summary

Two focused changes to `src/components/home/DecisionReadinessBrief.tsx`:

1. **Unified Mind pill** — Combine Stage 1 (mental sharpness outcome) with Stage 2 (clarity × confidence) into one synthesized pill
2. **Inline patterns on existing pills** — Move pattern context onto the relevant signal pill instead of rendering a separate pattern chip

---

## Change 1: Unified Mind Pill

Currently the Mind pill only uses clarity × confidence. The check-in outcome (overwhelmed/drained/scattered/focused/steady) from Stage 1 is ignored.

**New logic**: One pill that synthesizes both stages.

- **Front label** examples:
  - `Focused · sharp clarity` (outcome=focused, clarity≥4, confidence≥4)
  - `Scattered · low clarity` (outcome=scattered, clarity≤2)
  - `Steady · moderate mind` (outcome=steady, clarity=3, confidence=3)
  - `Drained · low confidence` (outcome=drained, confidence≤2)
  - `Overwhelmed · clarity low` (outcome=overwhelmed, clarity≤2)
  - Falls back to current C×C-only label if no outcome available

- **Back label**: `Sharpness: {outcome} · C:{x}/5 · Co:{y}/5`

- **Color logic**: Worst-of outcome tier and C×C tier:
  - outcome in [overwhelmed, drained] OR (clarity≤2 AND confidence≤2) → red
  - outcome=scattered OR clarity≤2 OR confidence≤2 → amber
  - outcome in [focused, steady] AND clarity≥3 AND confidence≥3 → green

This creates one pill that represents the full check-in picture.

## Change 2: Inline Patterns on Existing Pills

Instead of a separate `pattern` chip, attach pattern context as a qualifier on the relevant signal pill.

**Examples**:
- HRV pill: `HRV below baseline · 3rd day` (when HRV has been low for consecutive days)
- Sleep pill: `Solid sleep · 7-day streak` (when sleep trend is consistently good)
- Mind pill: `Scattered · low clarity · 3rd day` (when `consecutiveLowConfidence ≥ 3`)
- RHR pill: `RHR elevated · trend declining` (when `wearableTrend7d === 'declining'`)

**Mapping**:
- `consecutiveLowConfidence ≥ 3` → appended to Mind pill qualifier
- `scoreTrajectory7d` (declining/improving) → appended to whichever wearable pill is most relevant (HRV if exists, else sleep, else RHR)
- `typicalDOWScore` divergence → appended to Mind pill qualifier (since it's a score-level pattern)
- `wearableTrend7d` → appended to HRV pill qualifier
- `hrvEventCorrelation` → appended to HRV pill qualifier

The separate `pattern` chip section (lines 401-463) will be removed. Pattern data will be injected as qualifiers during the HRV/Sleep/RHR/Mind pill construction.

**No separate pattern pill is rendered.**

---

## Files to update

### `src/components/home/DecisionReadinessBrief.tsx`
- Refactor Mind pill section (lines 350-399) to include `energyState.checkInOutcome`
- Move pattern logic (lines 401-463) into each pill's qualifier during construction
- Remove the standalone pattern pill block
- Pass `checkInOutcome` into the chip builder (already available via `energyState`)

### No other files change
- No backend changes
- No schema changes
- No doc changes needed for this iteration

