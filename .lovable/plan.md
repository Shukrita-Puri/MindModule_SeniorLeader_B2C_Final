

# USP Intro Screens – Post-Payment, Pre-Data Connection

## Overview

Three full-screen swipeable intro screens inserted between payment and context-connection in the onboarding flow. Each screen sells one USP to a C-suite leader, building urgency before asking them to connect data.

**New flow**: Payment → `/onboarding/app-intro` (3 slides) → Context Connection

---

## The 3 Screens

Each screen: uploaded engraved illustration (top ~45%), headline in bold italic Cormorant Garamond (`font-headline`), subtitle in Crimson Pro (`font-subheadline`), dot indicators, Skip + Continue buttons at bottom.

| # | Headline (bold italic, font-headline) | Subtitle (font-subheadline) | Visual |
|---|---|---|---|
| 1 | *Peak performers don't react. They anticipate.* | Your day mapped. Your state read. Your plan ready – before you need it. | Uploaded engraved sky (light version – sun/clouds/landscape) |
| 2 | *You stop guessing. The intelligence does the work.* | Your context connected. Your patterns learnt. Your history decoded – before your day begins. | CSS-drawn pulse/signal visual (animated heartbeat line with gradient glow, matching the app's glassmorphic style) |
| 3 | *Every elite athlete has a performance team. Now you do too.* | A thinking partner. A preparation system. A recalibration space. A performance intelligence layer. Always on. | Uploaded engraved sky (dark/dramatic version) – same illustration style as landing page |

---

## Button Hierarchy

- **Continue** (bottom): `variant="critical"` (saffron) – advances slide or navigates to `/onboarding/context-connection` on final screen
- **Skip** (above Continue): `variant="outline"` – jumps straight to `/onboarding/context-connection` from any screen

---

## Context Connection Page Text Update

After the 3 USP screens, the context-connection page header copy will be updated to reinforce the momentum:

**Current**: "Connect Context" / "Personalise your experience"
**New**: "Connect Your Intelligence Layer" / "Your calendar and biometrics power everything you just saw – the state read, the plan, the resets."

This directly ties back to the 3 USPs and gives connecting data real urgency.

---

## Technical Changes

### 1. Copy uploaded images to project
- Copy the light engraved sky → `src/assets/onboarding/usp-sky-light.jpeg`
- Copy the dark engraved sky → `src/assets/onboarding/usp-sky-dark.jpeg`
- Both imported as ES6 modules in the component

### 2. New file: `src/pages/onboarding/stages/StageUSPIntro.tsx`
- Internal state: `currentSlide` (0, 1, 2)
- Swipe via existing `useSwipeHandler` hook
- Screen 2 visual: CSS-only animated pulse line (SVG path with `stroke-dashoffset` animation + gradient glow)
- Dot indicators (3 dots, active = saffron fill)
- Font classes: headline uses `font-headline font-bold italic`, subtitle uses `font-subheadline`
- En-dash (–) used per typography standard

### 3. Update `src/App.tsx`
- Add lazy import: `const StageUSPIntro = lazy(() => import("./pages/onboarding/stages/StageUSPIntro"))`
- Add route inside onboarding children: `{ path: "app-intro", element: <Suspense ...><StageUSPIntro /></Suspense> }` between `payment` and `context-connection`

### 4. Update `src/pages/onboarding/OnboardingFlow.tsx`
- Add `/onboarding/app-intro` to `STAGE_ROUTES` array between `payment` and `context-connection`

### 5. Update `src/pages/onboarding/stages/Stage6Payment.tsx`
- Line 32: change `'/onboarding/context-connection'` → `'/onboarding/app-intro'` (beta skip path)
- Post-payment success navigation would also route to `app-intro` if applicable

### 6. Update `src/utils/onboardingStatus.ts`
- Add `'/onboarding/app-intro'` to `stageOrder` array (line 192) between `payment` and `context-connection`
- Add resume logic (line 135): if payment done but app-intro not done, resume to `/onboarding/app-intro`

### 7. Update `src/pages/onboarding/stages/Stage7ContextConnection.tsx`
- Line 341-347: Change header from "Connect Context" / "Personalise your experience" to "Connect Your Intelligence Layer" / "Your calendar and biometrics power everything you just saw – the state read, the plan, the resets."

---

## Files Changed

| File | Change |
|------|--------|
| `src/assets/onboarding/usp-sky-light.jpeg` | New – copied from upload |
| `src/assets/onboarding/usp-sky-dark.jpeg` | New – copied from upload |
| `src/pages/onboarding/stages/StageUSPIntro.tsx` | New – 3-screen swipeable USP intro |
| `src/App.tsx` | Add lazy import + route |
| `src/pages/onboarding/OnboardingFlow.tsx` | Add to STAGE_ROUTES |
| `src/pages/onboarding/stages/Stage6Payment.tsx` | Redirect to app-intro |
| `src/utils/onboardingStatus.ts` | Add stage validation + resume entry |
| `src/pages/onboarding/stages/Stage7ContextConnection.tsx` | Update header copy |

No database changes. No edge function changes.

