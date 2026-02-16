

## Onboarding Architecture v2.0 Implementation Plan

This is a significant architectural overhaul of the onboarding system. The questions (Stages 2-6) remain the same, but the scoring engine, archetype system, results screen, and downstream connections all change fundamentally.

### Scope Summary

- **Scoring engine**: Replace 5-dimension model with 3-component model (Energy Regulation, Focus Recovery, Energy Renewal)
- **Archetype system**: Unify to 5 archetypes using hyphenated profile IDs (`grounded-leader`, `resilient-performer`, `clear-thinker`, `intensity-driver`, `adaptive-navigator`)
- **Stage 1 (Welcome)**: Add self-mastery positioning statement, simplify to "Begin" CTA
- **Stage 7 (Growth Intention)**: Split into two signals — pressure context + practice goal
- **Stage 9 (Results)**: Complete redesign — archetype reveal, no national average, no percentile, no level labels
- **Edge function**: Move scoring + archetype logic server-side into `generate-onboarding-insight`
- **Database**: Add `practice_priority_tag` and `pressure_context_tag` columns to profiles
- **Archetype matrix alignment**: Update `compute-outer-readiness` to use new archetype IDs

---

### Phase 1: Database Schema

Add two new columns to the `profiles` table:

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS practice_priority_tag text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pressure_context_tag text;
```

No RLS changes needed — profiles table already has policies.

---

### Phase 2: New Scoring Engine

**Replace** `src/utils/innerWorldScoring.ts` with the v2 3-component scoring model.

The new engine calculates:
- **Energy Regulation** (35% weight in baseline)
- **Focus Recovery** (35% weight)
- **Energy Renewal** (30% weight)

Each of Q1-Q4 contributes to all 3 components via a weighted matrix:

| Component | Q1 Weight | Q2 Weight | Q3 Weight | Q4 Weight |
|---|---|---|---|---|
| Energy Regulation | 40% | 35% | 10% | 15% |
| Focus Recovery | 25% | 20% | 30% | 25% |
| Energy Renewal | 35% | 45% | 60% | 60% |

Q1 answer scores per component:
- `notice_early` (was the old Q1 value) mapped to: ER=85, FR=75, EN=70 (example — values from doc's push-through/withdraw/over-analyze/delegate-avoid rows need mapping to the actual question answer keys)

**Important mapping issue**: The v2 doc uses answer keys (`push-through`, `withdraw`, `over-analyze`, `delegate-avoid`) that do not match the current Q1 answer keys (`notice_early`, `physical_signs`, `realize_after`, `push_through`). The current questions are about emotional awareness, not setback response. I will map the current answer keys to the closest v2 component score equivalents based on the behavioral meaning of each answer.

---

### Phase 3: New Archetype Assignment

**Replace** `src/utils/innerWorldArchetypes.ts` with v2 archetype logic using the 3-component scores.

Priority order (first condition met wins):
1. **The Grounded Master** (`grounded-leader`): energyRegulation >= 65 AND energyRenewal >= 55
2. **The Resilient Performer** (`resilient-performer`): energyRenewal >= 65 AND energyRegulation >= 50
3. **The Clear Thinker** (`clear-thinker`): focusRecovery >= 65 AND energyRegulation >= 45
4. **The Intensity Driver** (`intensity-driver`): energyRegulation >= 60 AND focusRecovery < 50
5. **The Adaptive Navigator** (`adaptive-navigator`): Default

---

### Phase 4: Update Stage 1 (Welcome)

Simplify `Stage1Welcome.tsx`:
- Remove "How It Works" section
- Remove bullet point discovery list
- Add single positioning statement: "This takes three minutes. Your answers shape everything the app surfaces for you — your practices, your daily brief, your coaching. The more honest you are, the more precisely it works."
- Change CTA from "Discover My Baseline" to "Begin"
- No progress bar (already handled)

---

### Phase 5: Update Stage 7 (Growth Intention)

Redesign `Stage7GrowthIntention.tsx` to capture two signals on one screen:

**Signal A — Biggest Pressure** (saves as `pressure_context_tag`):
- High-stakes decisions under uncertainty -> `high_stakes_decisions`
- Leading / influencing difficult stakeholders -> `influence_stakeholders`
- Navigating conflict or politics -> `conflict_navigation`
- Managing my own stress and energy -> `self_regulation`
- Multiple competing priorities -> `cognitive_load`

**Signal B — Practice Goal** (saves as `practice_priority_tag`):
- Staying calm and grounded under pressure -> `regulation_composure`
- Managing stress before it escalates -> `regulation_early`
- Recovering faster from setbacks -> `recovery_resilience`
- Sustaining energy without burning out -> `energy_endurance`
- Sharpening focus and cutting through brain fog -> `focus_clarity`
- Reframing negative thoughts and rewiring patterns -> `mindset_reframe`

Both saved to localStorage during flow and written to profiles on completion.

---

### Phase 6: Redesign Stage 9 (Results)

Complete redesign of `Stage8Results.tsx`:

**Remove entirely:**
- National average comparison bar
- Percentile ranking text
- "Building level" / readiness level label
- Research-backed timeline claims
- "Found in top X% of professionals"

**New design:**
1. **Archetype name** (large, centered): "You are The [Archetype Name]."
2. **One-line descriptor** per archetype
3. **Radar chart** — 3 components (Energy Regulation, Focus Recovery, Energy Renewal) — leader's own pattern only, no benchmark line
4. **AI-generated pattern insight** — 2-3 sentences from `generate-onboarding-insight` edge function
5. **Development path** — one line: "Your practice will prioritise [practice_priority_label]"
6. **What the app does** — 3 concise lines about check-in, archetype, and practice
7. **CTA**: "Connect your calendar and Apple Watch to unlock the full experience" -> payment

---

### Phase 7: Update Edge Function — `generate-onboarding-insight`

Modify `supabase/functions/generate-onboarding-insight/index.ts`:

1. **Accept v2 inputs**: archetype ID, 3 component scores, pressure_context_tag, practice_priority_tag
2. **Move scoring + archetype calculation server-side**: Accept raw Q1-Q4 answers, calculate scores and archetype in the edge function (proprietary logic protection), return scores + archetype + AI insight
3. **Update AI prompt**: Remove research citations, timeline promises. New prompt speaks directly to leader about their pattern.
4. **Return**: `{ scores, archetype, archetypeDescription, insight }`

---

### Phase 8: Update Outer Readiness Archetype Matrix

In `supabase/functions/compute-outer-readiness/index.ts`:

Replace the old archetype IDs in the `archetypeMatrix` with the v2 IDs:
- `natural-regulator` -> `grounded-leader`
- `high-octane-performer` -> `resilient-performer`
- `strategic-pauser` -> `clear-thinker`
- `awareness-builder` -> `intensity-driver`
- `adaptive-navigator` -> `adaptive-navigator` (unchanged)

The Lean On / Watch For copy per tier stays the same — only the keys change.

---

### Phase 9: Update Baseline Reference Card

Update `src/components/insights/BaselineReferenceCard.tsx` to use v2 archetype IDs and 3-component radar chart instead of 5-dimension display.

---

### Phase 10: Data Migration / Persistence

Update `src/utils/onboardingMigration.ts` to write the new fields:
- `practice_priority_tag`
- `pressure_context_tag`
- `mental_fitness_baseline` (from v2 scoring)
- `component_scores` (3 components instead of 5 dimensions)
- `user_archetype` (v2 hyphenated IDs)

Remove the old `selfRegulationScoring.ts` file (replaced by v2 scoring engine).

---

### Phase 11: Clean Up Legacy Code

- Remove `src/utils/selfRegulationScoring.ts` (v1 self-regulation scoring — superseded)
- Update any remaining references to old archetype IDs or 5-dimension scoring
- Ensure localStorage session structure matches v2 spec

---

### Technical Details

**Files created:**
- None new — all changes are to existing files

**Files modified:**
1. `src/pages/onboarding/stages/Stage1Welcome.tsx` — simplify welcome
2. `src/pages/onboarding/stages/Stage7GrowthIntention.tsx` — two-signal capture
3. `src/pages/onboarding/stages/Stage8Results.tsx` — complete redesign
4. `src/utils/innerWorldScoring.ts` — v2 3-component scoring engine
5. `src/utils/innerWorldArchetypes.ts` — v2 archetype assignment
6. `supabase/functions/generate-onboarding-insight/index.ts` — server-side scoring + new prompt
7. `supabase/functions/compute-outer-readiness/index.ts` — archetype ID alignment
8. `src/components/insights/BaselineReferenceCard.tsx` — v2 archetype IDs
9. `src/utils/onboardingMigration.ts` — new fields

**Files potentially removed:**
- `src/utils/selfRegulationScoring.ts` (if no other code depends on it)

**Database migration:**
- Add `practice_priority_tag` and `pressure_context_tag` columns to `profiles`

**Edge functions deployed:**
- `generate-onboarding-insight`
- `compute-outer-readiness`

**Important note on existing users:** Any user who completed onboarding v1 will have old archetype IDs (`grounded_master`, `aware_leader`, etc.) in their profile. The Outer Readiness function needs a fallback mapping from old IDs to new IDs, or existing users need a one-time data migration.

