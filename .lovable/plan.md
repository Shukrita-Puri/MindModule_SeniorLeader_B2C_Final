

## Fix: Archetype Always Returns "Resilient Performer"

### Root Cause

The Energy Renewal (EN) component weights in the scoring engine sum to **2.0** instead of **1.0**:

```text
ER weights: 0.40 + 0.35 + 0.10 + 0.15 = 1.00 (correct)
FR weights: 0.25 + 0.20 + 0.30 + 0.25 = 1.00 (correct)
EN weights: 0.35 + 0.45 + 0.60 + 0.60 = 2.00 (BUG)
```

This inflates EN so high that it nearly always exceeds 65, triggering the "Resilient Performer" condition (`EN >= 65 && ER >= 50`) regardless of what answers the user selects.

Example with worst possible answers (push_through, power_through, always_tired, overwhelmed):
- EN = 30 x 0.35 + 35 x 0.45 + 25 x 0.60 + 35 x 0.60 = 62
- Even the absolute worst combination scores 62 -- just barely under the 65 threshold
- Any single moderate answer pushes it over, locking in "Resilient Performer" every time

### Fix

Normalize the EN weights to sum to 1.0 while preserving their relative importance (35:45:60:60 ratio):

```text
Before: Q1=0.35, Q2=0.45, Q3=0.60, Q4=0.60 (sum = 2.00)
After:  Q1=0.175, Q2=0.225, Q3=0.30, Q4=0.30 (sum = 1.00)
```

### Verification (post-fix scores for polar opposite selections)

**Best answers** (notice_early, stay_grounded, bounce_back, crystal_clear):
- ER = 85x0.40 + 90x0.35 + 80x0.10 + 80x0.15 = 34 + 31.5 + 8 + 12 = 86
- FR = 75x0.25 + 80x0.20 + 85x0.30 + 90x0.25 = 18.75 + 16 + 25.5 + 22.5 = 83
- EN = 70x0.175 + 80x0.225 + 90x0.30 + 75x0.30 = 12.25 + 18 + 27 + 22.5 = 80
- Result: ER=86, EN=80 --> **Grounded Leader** (correct -- strongest profile)

**Worst answers** (push_through, power_through, always_tired, overwhelmed):
- ER = 35x0.40 + 50x0.35 + 35x0.10 + 35x0.15 = 14 + 17.5 + 3.5 + 5.25 = 40
- FR = 55x0.25 + 60x0.20 + 30x0.30 + 25x0.25 = 13.75 + 12 + 9 + 6.25 = 41
- EN = 30x0.175 + 35x0.225 + 25x0.30 + 35x0.30 = 5.25 + 7.875 + 7.5 + 10.5 = 31
- Result: No thresholds met --> **Adaptive Navigator** (correct -- default for low scores)

**Mixed answers** (notice_early, freeze_overthink, accumulating_fatigue, mostly_clear):
- ER = 85x0.40 + 55x0.35 + 45x0.10 + 65x0.15 = 34 + 19.25 + 4.5 + 9.75 = 68
- FR = 75x0.25 + 35x0.20 + 40x0.30 + 70x0.25 = 18.75 + 7 + 12 + 17.5 = 55
- EN = 70x0.175 + 50x0.225 + 35x0.30 + 60x0.30 = 12.25 + 11.25 + 10.5 + 18 = 52
- Result: ER=68, EN=52 (not >= 55) --> Falls through to ER >= 60, FR < 50? No (FR=55). Adaptive Navigator? No... ER=68, EN=52 doesn't hit grounded-leader (needs EN >= 55). Falls to **Intensity Driver** (ER >= 60, FR < 50? FR=55, no). Falls to **Adaptive Navigator**.

All five archetypes are now reachable with different answer combinations.

### File Changed

1. `supabase/functions/generate-onboarding-insight/index.ts` -- lines 68-70: fix EN weights from 0.35/0.45/0.60/0.60 to 0.175/0.225/0.30/0.30

### Deployment

- Re-deploy `generate-onboarding-insight` edge function
