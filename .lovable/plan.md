
# Evolve Self Mastery Patterns: Archetype Progress + Three-Dimension Scores

## Status: ✅ IMPLEMENTED

### What was delivered

1. **Edge function** (`state-patterns-insights`): Fixed `resolveArchetypeDetails()` to use v2 keys (`energyRegulation`, `focusRecovery`, `energyRenewal`) with legacy fallback, and the correct 5-archetype priority cascade. Added baseline vs current score computation and archetype evolution detection.

2. **LeadershipPatternsCard** (renamed to "Your Self Mastery Patterns"): Added archetype evolution display, three-dimension progress block (Recalibration, Clarity, Renewal with deltas), and updated DEV_MODE to use the same v2 archetype resolution logic. All existing elements preserved.

3. **Full documentation** written at `docs/self-mastery-patterns-card.md` covering architecture, all calculations, data sources, archetype cascade, evolution detection, dimension progress, AI observation, and display structure.
