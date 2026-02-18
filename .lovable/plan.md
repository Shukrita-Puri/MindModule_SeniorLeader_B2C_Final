

# Evolve Leadership Patterns: Archetype Progress + Three-Dimension Scores

## What You Will See

The "Your Leadership Patterns" card on `/insights` will gain two new sections **while keeping everything that already exists** (AI observation, archetype, 30-day avg, typical state, friction frequency, Lean On / Watch For, recurring themes, progressive messages):

1. **Archetype Evolution** -- If your current operating archetype has shifted from your onboarding baseline, you will see something like: "Started as The Adaptive Navigator -- Now operating as The Grounded Master". If unchanged, just your current archetype title as today.

2. **Three-Dimension Progress** -- Below the archetype line, a compact block showing your baseline (onboarding) scores versus your current (last 7 days) scores for Recalibration, Clarity, and Renewal, with delta indicators. Only appears once you have 7+ check-ins. Fewer than 7 shows baseline only with "Building your pattern..." note.

3. **Fixed Archetype Resolution** -- The archetype title and Lean On / Watch For labels will finally show the correct v2 archetype names (Grounded Master, Resilient Performer, Clear Thinker, Intensity Driver, Adaptive Navigator) instead of legacy fallbacks.

---

## Technical Plan

### File 1: `supabase/functions/state-patterns-insights/index.ts`

**A. Fix `resolveArchetypeDetails()` (lines 271-299)**

Replace the entire function to:
- Read v2 keys first (`energyRegulation`, `focusRecovery`, `energyRenewal`), fall back to legacy keys (`q2_energy_regulation`, etc.)
- Use the correct 5-archetype priority cascade:
  - Grounded Master: ER >= 65 AND EN >= 55 (Lean on: Recalibration, Watch for: Renewal depth)
  - Resilient Performer: EN >= 65 AND ER >= 50 (Lean on: Renewal, Watch for: Clarity under load)
  - Clear Thinker: FR >= 65 AND ER >= 45 (Lean on: Clarity, Watch for: Recalibration speed)
  - Intensity Driver: ER >= 60 AND FR < 50 (Lean on: Recalibration, Watch for: Clarity balance)
  - Adaptive Navigator: default (Lean on: Flexibility, Watch for: Recalibration depth)
- Add v2 IDs (`grounded-leader`, `resilient-performer`, etc.) to the string fallback map alongside legacy IDs

**B. Add baseline vs current score computation (new logic block)**

After the existing parallel queries, add:
- Extract `baselineScores` from `profiles.component_scores` (the onboarding scores, reading v2 keys with legacy fallback)
- Query `daily_checkins` for last 7 days including `clarity_level` and `confidence_level` (already in the table but not currently selected)
- Compute `currentScores`:
  - Recalibration = avg of `energy_balance` over last 7 days
  - Clarity = avg of `clarity_level` over last 7 days
  - Renewal = avg of `confidence_level` over last 7 days
- Re-evaluate `currentArchetype` using the same cascade on current scores
- Compute deltas (current - baseline) for each dimension
- Set `archetypeEvolved = true` if current archetype differs from baseline archetype

**C. Extend the response payload**

Add to the existing response (nothing removed):
```
baselineScores: { recalibration, clarity, renewal } | null
currentScores: { recalibration, clarity, renewal } | null
baselineArchetypeTitle: string | null
currentArchetypeTitle: string | null
archetypeEvolved: boolean
scoreDeltas: { recalibration, clarity, renewal } | null
```

### File 2: `src/components/insights/LeadershipPatternsCard.tsx`

**A. Extend the `LeadershipPatternsData` interface**

Add the new fields from the edge function response.

**B. Add Archetype Evolution display (after existing archetype line, ~line 237)**

If `archetypeEvolved` is true:
- Show: baseline archetype title with a right arrow to current archetype title
- Subtle styling: baseline in muted text, arrow, current in bold

If false: keep existing single archetype line as-is.

**C. Add Three-Dimension Progress block (after archetype, before composite score)**

When `baselineScores` and `currentScores` both exist:
- Three rows: Recalibration, Clarity, Renewal
- Each row: dimension label, baseline score, arrow, current score, delta in parentheses
- Delta color: green for positive, red for negative, neutral for zero/small
- Compact layout using the existing card design language

When only `baselineScores` exist (fewer than 7 check-ins):
- Show baseline scores with "Your starting point" label
- Small note: "Current scores build after 7 check-ins"

**D. Update DEV_MODE fallback (lines 64-173)**

Mirror the new fields in the DEV_MODE path so development testing works. Read `component_scores` from the profile query that already runs, and compute current scores from the check-in data already fetched.

### What stays unchanged

- AI observation headline
- 30-day Inner Readiness avg + trend direction
- Most frequent state (30 days)
- Friction frequency with qualitative label
- Lean On (strength) with coach quote
- Watch For (friction) with coach quote
- Recurring Compass themes with occurrence counts
- Progressive check-in messages
- Data source note
- All other Insights cards

### No database changes required

The `daily_checkins` table already has `clarity_level` and `confidence_level` columns. The `profiles` table already has `component_scores` (JSONB). No migration needed.

