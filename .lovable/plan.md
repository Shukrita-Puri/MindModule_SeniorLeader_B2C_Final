

# Inner Readiness Feature Audit — Findings & Assessment

## Architecture Overview

The Inner Readiness feature flows as:

```text
DailyCheckIn (outcome) → CheckInDetail (clarity + confidence)
       ↓                          ↓
   daily_checkins table (outcome, clarity_level, confidence_level)
       ↓
energyStateEngine.ts (client orchestrator)
       ↓
compute-inner-readiness Edge Function (scoring + context statement)
       ↓
TodayStateCard.tsx (renderer) + EnergyStateHeader.tsx (legacy renderer)
       ↓
Downstream: Outer Readiness Brief, Mastery Plan, Coach Context
```

---

## Question 1: Is the copy built from all relevant data inputs?

**Yes.** The `compute-inner-readiness` edge function receives and uses all four signals:

| Signal | Input Field | Weight (no wearable) | Weight (with wearable) |
|--------|------------|---------------------|----------------------|
| Felt State | `checkInOutcome` | 55% | 30-40% |
| Internal Readiness (C+C) | `clarityLevel`, `confidenceLevel` | 30% | 25% |
| Circadian | `timezoneOffset` → hour/day | 15% | 10% |
| Wearable HRV | `wearableHRV`, `wearableBaseline` | 0% | 25-35% |

All four feed into the composite score. No data is missing from the scoring pipeline.

---

## Question 2: What is AI-generated vs. static copy?

**Nothing is AI-generated.** The entire context statement is built from **pre-authored static copy** assembled via a 3-layer logic system in the edge function:

- **Layer 1 (always present):** A lookup from `BASE_STATEMENTS[outcome][timeOfDay]` — 15 hand-written sentences (5 outcomes × 3 times of day). If no check-in exists, falls back to `TIER_FALLBACK_STATEMENTS[tier][timeOfDay]` (12 sentences).
- **Layer 2 (conditional):** Appended only when avg(clarity, confidence) ≤ 2.5 or ≥ 4.5. Uses `LOW_CC_MODIFIERS[outcome]` or `HIGH_CC_MODIFIERS[outcome]` — 10 hand-written sentences.
- **Layer 3 (conditional):** Appended only when wearable divergence > 30 points gap. Two template strings with HRV deviation percentage inserted.

No LLM call is made. The copy is deterministic.

---

## Question 3: Does the copy incorporate Clarity & Confidence?

**Yes, but only at extremes.** The Layer 2 modifier triggers when:
- Average C+C ≤ 2.5 (low) — appends a low-C+C sentence
- Average C+C ≥ 4.5 (high) — appends a high-C+C sentence
- Between 2.5 and 4.5 — **no Layer 2 text appears**

This is by design (the memory doc confirms: "Layer 2 appears only when your clarity and confidence are notably low or high"). However, this means **most users will only see Layer 1** since C+C values of 3–4 are the most common range. The C+C data still affects the **score** (30% weight) even when it doesn't trigger Layer 2 copy.

**Your observation that no text was visible below the pill** is correct — if the user's C+C was in the 2.6–4.4 range, Layer 2 wouldn't fire, and there would be nothing to show under those pills. Removing the pills was the right call since the copy handles the signal when it matters.

---

## Question 4: Does the copy still handle physiological divergence?

**Yes.** Layer 3 in `assembleContextStatement` (lines 194-201 of the edge function) still fires when `divergenceFlag` is `MASKED_HIGH` or `RECOVERY_UNDERWAY`. The pill badges were a UI indicator; the copy itself is unaffected by their removal.

---

## Question 5: DB and Edge Function — reading/writing correctly?

**Reading pipeline (working):**
1. `energyStateEngine.ts` calls `fetchTodayCheckin()` → edge function `daily-checkins` with `GET_TODAY_CHECKIN` action → returns `outcome`, `clarity_level`, `confidence_level` from `daily_checkins` table
2. Passes all values to `compute-inner-readiness` edge function
3. Edge function returns score, tier, contextStatement, layersActive, divergenceFlag

**Writing pipeline (working):**
1. After scoring, `persistCompositeScore()` writes `energy_balance` back to `daily_checkins` via `daily-checkins` edge function with `UPDATE_ENERGY_BALANCE` action
2. Has retry logic (up to 6 retries at 5-min intervals)

**No bugs found in the read/write pipeline.**

---

## Question 6: Downstream consumers tracking relevant data?

**Yes.** The following consumers use the energy state output:

1. **Outer Readiness Brief** (`useOuterReadiness.ts`) — receives `innerReadinessTier`, `innerReadinessScore`, `clarityLevel`, `confidenceLevel`, `checkInOutcome`
2. **Mastery Plan** (`generate-mastery-plan`) — uses energy tier for practice selection
3. **Executive Home hero visual** — uses `energyTier` to select background video/image
4. **JIT Carousel** — uses energy state for event prioritization
5. **Insights page** — uses check-in history from `daily_checkins`

All downstream consumers receive the full computed state including C+C influence.

---

## Issues Found

### Issue 1: Dead code — `hasExtraLayers` variable (minor)
In `TodayStateCard.tsx` line 64, `hasExtraLayers` is computed but never used (the pill badges that consumed it were removed). This is harmless dead code but should be cleaned up.

### Issue 2: `EnergyStateHeader.tsx` — duplicate/legacy component
This component duplicates the Inner Readiness display. It's imported nowhere in the current routing but exists in the codebase. Should be confirmed unused and removed if so.

### No critical bugs or data integrity issues found.

---

## Summary

| Aspect | Status |
|--------|--------|
| Score uses all 4 signals | Working |
| C+C affects score (30% weight) | Working |
| C+C appears in copy (Layer 2) | Working (only at extremes, by design) |
| Divergence appears in copy (Layer 3) | Working (when wearable connected) |
| Copy is AI-generated? | No — all static, deterministic |
| DB read (check-in → score) | Working |
| DB write (score → daily_checkins) | Working with retry |
| Downstream consumers | All receiving correct data |
| Critical bugs | None found |

### Recommended cleanup (optional)
1. Remove dead `hasExtraLayers` variable from `TodayStateCard.tsx`
2. Confirm and remove unused `EnergyStateHeader.tsx`

