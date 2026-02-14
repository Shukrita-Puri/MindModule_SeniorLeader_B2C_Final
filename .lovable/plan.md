
# Inner Readiness v2.0 — Implementation Plan

## Overview

Migrate the "Today's State" feature to "Inner Readiness" with a completely revised scoring architecture. This involves:
1. Moving all scoring logic from client-side to a secure backend function
2. Implementing the new v2.0 weighting system (Clarity + Confidence as active 30% input)
3. Adding divergence detection (MASKED_HIGH / RECOVERY_UNDERWAY)
4. New 3-layer context statement system
5. Renaming the feature and updating the tooltip

The frontend design remains unchanged except for the name and tooltip text.

---

## What Changes (Summary)

| Area | Current (v1) | New (v2) |
|------|-------------|----------|
| Feature name | "Today's State" | "Inner Readiness" |
| Felt State weight (no wearable) | 90% | 55% |
| Clarity + Confidence | Stored only, 0% of score | 30% of score (IRScore) |
| Circadian | Raw -8 to +7 adjustment | Normalized 0-100 scale, 15% weight |
| Wearable weight | Fixed 30% | Dynamic: 25% aligned, 35% masked-high, 30% recovery |
| Divergence detection | None | MASKED_HIGH / RECOVERY_UNDERWAY flags |
| Context statements | 1 layer (outcome x time) | 3 layers (base + C+C modifier + divergence overlay) |
| Scoring location | Client-side (exposed) | Backend function (secured) |

---

## Technical Implementation

### Task 1: Create `compute-inner-readiness` Backend Function

**New file:** `supabase/functions/compute-inner-readiness/index.ts`

This function receives the user's raw inputs and returns the computed score + context. All proprietary logic lives here.

**Inputs accepted (POST body):**
- `checkInOutcome`: string or null (overwhelmed/drained/scattered/steady/focused)
- `clarityLevel`: number 1-5 (default 3 if not provided)
- `confidenceLevel`: number 1-5 (default 3 if not provided)
- `wearableHRV`: number or null (raw HRV reading)
- `wearableBaseline`: number or null (user's 30-day personal HRV average)
- `hasCheckIn`: boolean
- `hasWearable`: boolean

**Logic inside the function (all from your v2 spec):**

1. **Felt State Score** — map outcome to raw score (drained=20, overwhelmed=25, scattered=35, steady=55, focused=80, default=50)

2. **Internal Readiness Score** — `IRScore = (clarity + confidence) * 8`. Defaults: clarity=3, confidence=3 giving IRScore=48

3. **Circadian Score** — `CircadianScore = 50 + (TimeAdj + DayAdj) * 3` using server-side UTC-adjusted time. Range: 26-71

4. **Wearable Score** (if available):
   - Calculate `HRVDeviation = (ReadingHRV - PersonalBaseline) / PersonalBaseline * 100`
   - Map: >+15% = 80 (Recovered), within +/-15% = 50 (Baseline), <-15% = 20 (Under Load)

5. **Divergence Detection:**
   - `divergenceGap = |FeltStateScore - WearableScore|`
   - If gap > 30 and Felt > Wearable: flag = MASKED_HIGH
   - If gap > 30 and Wearable > Felt: flag = RECOVERY_UNDERWAY
   - Otherwise: ALIGNED

6. **Weighting Modes:**
   - Mode 1 (no wearable): `Score = Felt*0.55 + IR*0.30 + Circadian*0.15`
   - Mode 2 (aligned): `Score = Felt*0.40 + IR*0.25 + Wearable*0.25 + Circadian*0.10`
   - Mode 3 (MASKED_HIGH): `Score = Felt*0.30 + IR*0.25 + Wearable*0.35 + Circadian*0.10`
   - Mode 4 (RECOVERY_UNDERWAY): `Score = Felt*0.35 + IR*0.25 + Wearable*0.30 + Circadian*0.10`

7. **Tier mapping:** Depleted (0-39), Managing (40-59), Strong (60-74), Peak (75-100)

8. **3-Layer Context Statement Assembly:**
   - Layer 1: Base statement from 15-combination matrix (outcome x timeOfDay) or tier-based fallback (no check-in)
   - Layer 2: C+C modifier appended only when avg(clarity, confidence) <= 2.5 or >= 4.5
   - Layer 3: Divergence overlay appended only when MASKED_HIGH or RECOVERY_UNDERWAY flag fires, including HRV deviation percentage

**Returns:**
```json
{
  "score": 66,
  "tier": "strong",
  "subTier": "high",
  "contextStatement": "High cognitive readiness... High energy with low confidence...",
  "divergenceFlag": "ALIGNED",
  "dataSources": ["check-in", "circadian"],
  "confidence": "medium",
  "timeOfDay": "morning",
  "checkInOutcome": "focused",
  "tierLabel": "Perform and Execute"
}
```

**Config update:** Add `[functions.compute-inner-readiness]` with `verify_jwt = false` to `supabase/config.toml`

---

### Task 2: Update `energyStateEngine.ts` to Call Backend

Replace the current `computeEnergyState()` function to:
1. Read raw inputs from localStorage (check-in outcome, wearable data)
2. Fetch clarity/confidence from the database via the `daily-checkins` edge function (GET_TODAY_CHECKIN)
3. Call the new `compute-inner-readiness` backend function with the raw inputs
4. Return the response in the existing `CurrentEnergyState` interface shape

The client becomes a thin orchestrator that gathers inputs and passes them to the backend. No scoring logic remains client-side.

Key changes:
- Remove all imports from `energyStateScoring.ts` used for scoring
- Add clarity/confidence fetch from DB (since CheckInDetail saves them there, not localStorage)
- Add `divergenceFlag` and `hrvDeviation` to the `CurrentEnergyState` interface
- The function signature and return type remain compatible so TodayStateCard works without changes

---

### Task 3: Update `TodayStateCard.tsx` (Minimal Frontend Changes)

Only two text changes:
1. **Header text:** "Today's State" becomes "Inner Readiness"
2. **Tooltip:** Update the MetricInfoModal title to "How Your Inner Readiness Score is Calculated" and description to the new tooltip text from your spec

The tier label logic (`getStateLabel`) stays in the component since it's purely a display mapping, not proprietary scoring.

---

### Task 4: Update `EnergyStateHeader.tsx` (Same Minimal Changes)

Update the MetricInfoModal title and description to match the new "Inner Readiness" naming and tooltip text.

---

### Task 5: Clean Up Client-Side Scoring Exposure

After the backend function handles all scoring:
- Remove `formatContextStatement()` from `energyStateScoring.ts` (moved to backend)
- Remove the circadian normalization logic from client (moved to backend)
- Keep `getCheckInScore()` only because `DailyCheckIn.tsx` uses it to store `energy_balance` in the DB at check-in time — but this is a raw mapping, not the actual weighting algorithm
- Keep `getCalendarMetrics()` since it's used by the Theme for Today (separate feature)
- Keep `getEnergyTier()`, `getEnergySubTier()` as they're used elsewhere
- Remove the weighting constants (0.90/0.65/0.30/0.05) from client code entirely

---

### Task 6: Handle Clarity/Confidence Data Flow Fix

**Current bug:** `CheckInDetail.tsx` saves clarity/confidence to the DB via direct Supabase call but `computeEnergyState()` only reads from localStorage (where they are NOT stored). The v2 system needs these values.

**Fix:** In the updated `computeEnergyState()`, fetch today's check-in from the DB (via `daily-checkins` edge function GET_TODAY_CHECKIN action) to get `clarity_level` and `confidence_level`, then pass them to the backend scoring function.

---

## What Does NOT Change

- Frontend card layout, styling, colors, typography
- The score display (number / 100)
- The tier label display
- The "View insights" link
- The data sources footer
- The check-in flow (DailyCheckIn.tsx and CheckInDetail.tsx)
- The Theme for Today / Strategic Theme system (separate layer)
- Calendar scoring (stays separate, used by Theme for Today only)

---

## Sequencing

1. Create the backend function (Task 1) — this is the core work
2. Update config.toml (part of Task 1)
3. Update energyStateEngine.ts to call backend (Task 2)
4. Fix clarity/confidence data flow (Task 6, done as part of Task 2)
5. Update TodayStateCard.tsx name + tooltip (Task 3)
6. Update EnergyStateHeader.tsx name + tooltip (Task 4)
7. Clean up exposed client-side scoring (Task 5)

All tasks will be implemented together in one pass.
