

# Feature Renaming — Final Names

## Naming Map

| Current | New |
|---------|-----|
| Emotional & Cognitive Energy Check in | **Performance Readiness Assessment** |
| Recalibrate Studio | **Reset Studio** |
| Inner Mastery Coach | **Mind Performance Coach** |
| Insights / Inner World Insights | **Performance Intelligence** |
| Renewal Mastery | **Recharge Mastery** |

Check-in pages get "Performance Readiness Assessment" as parent title above existing step headers.

## All File Changes

### 1. Sidebar — `src/components/navigation/LeftSidebar.tsx`
- Line 32: `'Emotional & Cognitive Energy Check in'` → `'Performance Readiness Assessment'`
- Line 38: `'Recalibrate Studio'` → `'Reset Studio'`
- Line 44: `'Inner Mastery Coach'` → `'Mind Performance Coach'`
- Line 50: `'Insights'` → `'Performance Intelligence'`

### 2. Check-In Step 1 — `src/pages/DailyCheckIn.tsx`
- Lines 243-244: Add parent label above h1:
  ```
  <p className="text-sm uppercase tracking-widest text-muted-foreground font-body">Performance Readiness Assessment</p>
  <h1 ...>Emotional & Cognitive State</h1>
  ```

### 3. Check-In Step 2 — `src/pages/CheckInDetail.tsx`
- Lines 80-81: Add parent label above h1:
  ```
  <p className="text-sm uppercase tracking-widest text-muted-foreground font-body">Performance Readiness Assessment</p>
  <h1 ...>Clarity & Confidence State</h1>
  ```

### 4. Reset Studio page — `src/pages/RecalibrateMode.tsx`
- Line 33: `'Renewal Mastery'` → `'Recharge Mastery'`
- Line 107: `'Recalibrate Studio'` → `'Reset Studio'`

### 5. PowerUp outcome — `src/pages/recalibrate/PowerUpOutcomePage.tsx`
- Line 197: `'Renewal Mastery'` → `'Recharge Mastery'`

### 6. Pause outcome — `src/pages/recalibrate/PauseOutcomePage.tsx`
- Line 342: `'Renewal Mastery →'` → `'Recharge Mastery →'`

### 7. Presence outcome — `src/pages/recalibrate/PresenceOutcomePage.tsx`
- Line 330: `'Renewal Mastery →'` → `'Recharge Mastery →'`

### 8. Daily Ritual Card — `src/components/home/DailyRitualCard.tsx`
- Line 57: `'Renewal Mastery'` → `'Recharge Mastery'`

### 9. Insights page — `src/pages/Insights.tsx`
- Line 792: comment `Recalibrate Studio` → `Reset Studio`
- Line 796: `'Inner World Insights'` → `'Performance Intelligence'`

### 10. Coach page — `src/components/coach/CoachSplitView.tsx`
- Line 47: alt `'Inner Mastery Coach'` → `'Mind Performance Coach'`
- Line 254: h1 `'Inner Mastery Coach'` → `'Mind Performance Coach'`
- Line 262: alt `'Inner Mastery Coach'` → `'Mind Performance Coach'`

### 11. Tooltip references — all `'Inner Mastery Coach'` → `'Mind Performance Coach'`:
- `src/components/navigation/FloatingNavigation.tsx` line 58
- `src/components/navigation/UnifiedTopBar.tsx` line 49
- `src/components/navigation/CoachAccessButton.tsx` line 22
- `src/components/simulation/TopNavigation.tsx` line 56

### 12. Protocol type labels — all `'Inner Mastery Coach'` → `'Mind Performance Coach'`:
- `src/components/home/JitCarousel.tsx` line 247
- `src/components/home/DailyRitual.tsx` line 522
- `src/utils/performancePlanEngine.ts` lines 893, 905
- `src/utils/planReconstruction.ts` lines 28, 40

### 13. Profile sidebar — `src/components/ProfileSidebar.tsx`
- Line 18: `'Recalibrate Studio'` → `'Reset Studio'`

### 14. Onboarding payment — `src/pages/onboarding/stages/Stage6Payment.tsx`
- Line 114: `'Recalibrate Studio (all practices)'` → `'Reset Studio (all practices)'`

### 15. Content recommendation engine — `src/utils/contentRecommendationEngine.ts`
- Line 6: comment `Renewal mastery` → `Recharge mastery`

### 16. Coach system prompt — `supabase/functions/self-mastery-coach/index.ts`
- Line 519: `'Recalibrate Studio'` → `'Reset Studio'`
- Lines 525-526: `'RECALIBRATE STUDIO'` → `'RESET STUDIO'`, `'Recalibrate Studio'` → `'Reset Studio'`

All changes are pure text/label updates. No logic, routing, or DB changes.

