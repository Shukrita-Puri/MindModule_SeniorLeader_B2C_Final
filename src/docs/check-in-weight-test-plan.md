# Check-In Weight Test Plan (60%)

## Test Objective
Verify that check-in outcomes are weighted at **60%** in the energy balance calculation and produce accurate final scores.

## Scoring System Reference

### Raw Check-In Scores (Base Values)
Each check-in outcome maps to a raw balance score (0-100):

| Check-In Outcome | User Selects | Raw Score | Balance Range |
|-----------------|--------------|-----------|---------------|
| **pause** | "I'm stressed or overwhelmed" | 40 | Depleted |
| **power-up** | "I'm drained or tired" | 35 | Depleted |
| **presence** | "I'm scattered or unfocused" | 50 | Managing |
| **calm** | "I'm anxious or tense" | 45 | Managing |
| **ready** | "I'm motivated and ready" | 85 | Peak |

## Calculation Formula

**For Pro Users (no wearables/calendar):**
```
Final Balance = (Check-In Score × 0.60) + (Memory Score × 0.25) + (Circadian Score × 0.15)
```

**Default Assumptions** (when no historical data exists):
- Memory Score: 50 (neutral baseline)
- Circadian Score: 50 + bonus (-5 to +10 based on time of day)

### Circadian Bonuses by Time of Day
- 6am-9am: +10 (peak morning)
- 9am-12pm: +5 (strong morning)
- 12pm-3pm: 0 (neutral)
- 3pm-6pm: -5 (afternoon dip)
- 6pm-9pm: 0 (neutral evening)
- 9pm-12am: -5 (wind down)

## Expected Test Results

### Scenario 1: Morning Test (9am, circadian = 55)
| Check-In | Raw Score | Calculation | Expected Final Score | Range Label |
|----------|-----------|-------------|---------------------|-------------|
| **pause** | 40 | (40 × 0.60) + (50 × 0.25) + (55 × 0.15) | **45** | Managing |
| **power-up** | 35 | (35 × 0.60) + (50 × 0.25) + (55 × 0.15) | **42** | Managing |
| **presence** | 50 | (50 × 0.60) + (50 × 0.25) + (55 × 0.15) | **51** | Managing |
| **calm** | 45 | (45 × 0.60) + (50 × 0.25) + (55 × 0.15) | **48** | Managing |
| **ready** | 85 | (85 × 0.60) + (50 × 0.25) + (55 × 0.15) | **72** | Strong |

### Scenario 2: Afternoon Test (3pm, circadian = 45)
| Check-In | Raw Score | Calculation | Expected Final Score | Range Label |
|----------|-----------|-------------|---------------------|-------------|
| **pause** | 40 | (40 × 0.60) + (50 × 0.25) + (45 × 0.15) | **43** | Managing |
| **power-up** | 35 | (35 × 0.60) + (50 × 0.25) + (45 × 0.15) | **40** | Depleted/Managing |
| **presence** | 50 | (50 × 0.60) + (50 × 0.25) + (45 × 0.15) | **49** | Managing |
| **calm** | 45 | (45 × 0.60) + (50 × 0.25) + (45 × 0.15) | **46** | Managing |
| **ready** | 85 | (85 × 0.60) + (50 × 0.25) + (45 × 0.15) | **70** | Strong |

### Scenario 3: Evening Test (7pm, circadian = 50)
| Check-In | Raw Score | Calculation | Expected Final Score | Range Label |
|----------|-----------|-------------|---------------------|-------------|
| **pause** | 40 | (40 × 0.60) + (50 × 0.25) + (50 × 0.15) | **44** | Managing |
| **power-up** | 35 | (35 × 0.60) + (50 × 0.25) + (50 × 0.15) | **41** | Managing |
| **presence** | 50 | (50 × 0.60) + (50 × 0.25) + (50 × 0.15) | **50** | Managing |
| **calm** | 45 | (45 × 0.60) + (50 × 0.25) + (50 × 0.15) | **47** | Managing |
| **ready** | 85 | (85 × 0.60) + (50 × 0.25) + (50 × 0.15) | **71** | Strong |

## Testing Instructions

### How to Test Each Outcome

1. **Clear localStorage** (optional, to reset any previous data):
   - Open browser DevTools (F12)
   - Console tab: `localStorage.clear()`
   - Refresh page

2. **Navigate to Check-In**: Go to `/daily-check-in`

3. **Select Outcome**: Choose one of the 5 check-in cards

4. **Verify Results** on Executive Home page:
   - Check **"Energy Balance"** score (large number)
   - Check **"Sources:"** line shows "check-in + circadian" (or "+ memory" if historical data exists)
   - Compare actual score to expected score in tables above

5. **Verify Insight Text**: The insight should:
   - Match the balance range (Depleted/Managing/Strong/Peak)
   - Match the time of day (morning/afternoon/evening)
   - Match the check-in outcome (stressed/drained/scattered/anxious/focused)
   - NOT mention "high-stakes decisions" in the evening

## Success Criteria

✅ **Pass**: Final score is within ±2 points of expected score (rounding variance)
✅ **Pass**: Data sources include "check-in"
✅ **Pass**: Insight text accurately reflects balance range, time of day, and outcome
✅ **Pass**: No LLM-generated text (e.g., "high-stakes" in evening)

❌ **Fail**: Score differs by >2 points (check-in weight may not be 60%)
❌ **Fail**: Data sources only show "circadian" (check-in not detected)
❌ **Fail**: Insight text is generic or doesn't match state

## Troubleshooting

### Issue: Score doesn't match expected value
- **Check time of day**: Circadian bonus affects final score by ±10 points
- **Check for historical data**: If memory data exists, it replaces the 50 baseline
- **Verify localStorage**: Open DevTools → Application → Local Storage → check `dailyCheckIn` key

### Issue: Data sources only show "circadian"
- **Check localStorage update**: The check-in should trigger a storage event
- **Force refresh**: Navigate away and back to `/executive-home`
- **Check timing**: The `refetchOnMount: 'always'` should catch updates

### Issue: Insight text is inaccurate
- **Check `energyInsightEngine.ts`**: The template selection logic should match balance/outcome/time
- **Review console**: Check for any errors in the insight generation

## Weight Distribution Reference

### Pro User (Check-In Only)
- Check-in: **60%**
- Memory: 25%
- Circadian: 15%

### Super Pro User (Check-In + Wearable + Calendar)
- Check-in: **60%**
- Wearable: 15%
- Calendar: 5%
- Memory: 10%
- Circadian: 10%

This ensures the user's explicit emotional state dominates the energy balance calculation.
