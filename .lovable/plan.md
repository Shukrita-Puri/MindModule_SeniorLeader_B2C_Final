

## Plan: Onboarding intro screen, streamlined tour (3 steps), dev mode tour fix

### What changes

**1. New "See How It Works" intro screen before USP slides**

Add a new full-screen intro slide (slide index -1 / pre-slide state) inside `StageUSPIntro.tsx` itself. Before showing the 3 USP slides, show:
- Mind Module logo (`mm-logo-circle.png`) centered
- "MIND MODULE" text below
- Headline: "A new era of executive performance."
- Subheadline: "This isn't self-improvement. This is self-mastery."
- CTA button: "See how it works →" (saffron/`#ff825a`)
- Dark background matching the app theme
- Tapping CTA advances to USP slide 1

**2. Add progress bar to the USP intro flow**

Add a thin orange (`#ff825a`) progress bar at the top of `StageUSPIntro.tsx`:
- Intro screen: 0/4 (0%)
- USP slide 1: 1/4 (25%)
- USP slide 2: 2/4 (50%)  
- USP slide 3: 3/4 (75%)
- Fills to 100% on final slide before navigating to context-connection

This is self-contained within the component (not the OnboardingFlow progress bar, which is hidden at this stage index).

**3. Reduce tour from 10 steps to 3**

In `FirstSessionGuide.tsx`, replace the 10-step `STEPS` array with 3 steps:

| Step | Page | Target | Title |
|------|------|--------|-------|
| 1 | check-in | `[data-tour="check-in-carousel"]` | Performance Readiness Assessment |
| 2 | home | `[data-tour="today-state"]` | Your Decision Engine |
| 3 | home | `[data-tour="daily-plan"]` | Performance Readiness Plan |

Update all hardcoded step-index references:
- `shouldPinSidebarOpen` (currently `currentStep === 6 || 7`) → remove (no sidebar steps)
- `isLastStep` already uses `STEPS.length - 1` → works automatically
- `stepTransitionCopy()` → simplify for 3 steps
- Remove sidebar-related actions (`open-sidebar`, `close-sidebar`, `navigate-profile`) from step logic since no steps use them

**4. Dev mode tour fix (already partially done but needs reinforcement)**

Both `DailyCheckIn.tsx` (line 112) and `ExecutiveHome.tsx` (line 83) already have the `DEV_MODE` bypass:
```
if (!user?.id || (!DEV_MODE && !user?.onboarding_completed_at))
```

The issue is that in DEV_MODE, `user?.id` can still be falsy if the auth hook returns null. Add a fallback: when `DEV_MODE` is true, use `DEV_USER.id` as the user ID for tour session storage keys, and skip the `!user?.id` guard entirely in DEV_MODE so the tour always initializes.

### Files to modify

| File | Change |
|------|--------|
| `src/pages/onboarding/stages/StageUSPIntro.tsx` | Add intro screen + top progress bar |
| `src/components/onboarding/FirstSessionGuide.tsx` | Reduce STEPS to 3, remove sidebar/profile step logic |
| `src/pages/DailyCheckIn.tsx` | Strengthen DEV_MODE bypass for tour |
| `src/pages/ExecutiveHome.tsx` | Strengthen DEV_MODE bypass for tour |

### Not changing
- State card labels/icons/content
- Step 2 sliders (CheckInDetail)
- Routing or submission logic
- Any other page or component
- Bottom nav visibility rules (already correct)
- Coach FAB visibility (already fixed)

