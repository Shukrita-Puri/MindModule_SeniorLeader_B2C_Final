

## Consistent Top Navigation Across All Pages

### Current State (Inconsistent)

There are **4 different back button styles** across the app:

1. **`FloatingNavigation`** — Dark circular buttons (`bg-black/70`, `h-10 w-10 rounded-full`). Used on feature pages: DailyCheckIn, Recalibrate, Insights, CheckInDetail, Coach.
2. **`UnifiedTopBar`** — Glass variant (`variant="glass"`, fixed bar with blur). Used on Privacy, Terms.
3. **Custom sticky headers** — Ghost icon button with title inline (`variant="ghost" size="icon"`). Used on Profile, ConnectedData, Refer.
4. **Custom inline buttons** — Small rounded border circles (`w-8 h-8 rounded-full border`). Used on Onboarding Payment, OnboardingFlow.

Page titles sit inside the top bar on Profile, ConnectedData, and Refer — but not on Privacy/Terms.

### Target Design

| Page Type | Back Button | Coach Icon | Title Location |
|-----------|------------|------------|----------------|
| **Executive Home** | No | Sidebar + Coach (as-is) | N/A |
| **Feature pages** (DailyCheckIn, Recalibrate, Insights, CheckInDetail) | FloatingNavigation dark circle | Yes (coach icon) | Below nav |
| **Coach** | FloatingNavigation dark circle | No | Below nav |
| **Sub pages** (Profile, ConnectedData, Privacy, Terms, Refer) | `UnifiedTopBar` with `hideCoach` | No | Below top bar, in page content |
| **Onboarding pages** (OnboardingFlow, Payment, Results, ContextConnection) | `UnifiedTopBar` with `hideCoach` | No | Below top bar, in page content |

### Changes

**1. `src/pages/Profile.tsx`**
- Replace custom sticky header with `<UnifiedTopBar hideCoach backPath="/executive-home" />`
- Remove the `ArrowLeft` + title from the sticky div
- Move "Profile" title into page content below with proper `pt-16` spacing

**2. `src/pages/ConnectedData.tsx`**
- Replace custom sticky header with `<UnifiedTopBar hideCoach backPath="/profile" />`
- Remove `ArrowLeft` + title from sticky div
- Move "Connected Data" title into page content below with `pt-16` spacing

**3. `src/pages/Refer.tsx`**
- Replace custom sticky header with `<UnifiedTopBar hideCoach />`
- Remove the inline back button + title + subtitle
- Move "Refer Friends" title and subtitle into page content below with `pt-16` spacing

**4. `src/pages/Privacy.tsx`**
- Already uses `UnifiedTopBar hideCoach` — good
- Verify `pt-20` provides proper spacing below fixed bar (already done)

**5. `src/pages/Terms.tsx`**
- Already uses `UnifiedTopBar hideCoach` — good
- Same as Privacy

**6. `src/pages/onboarding/OnboardingFlow.tsx`**
- Replace custom back button (`<button>` with `ArrowLeft` + "Back" text) with `<UnifiedTopBar hideCoach />`
- The `onBack` prop handles the custom `getBackPath()` logic
- Adjust content padding to account for the fixed top bar

**7. `src/pages/onboarding/stages/Stage6Payment.tsx`**
- Remove the two inline back buttons (lines 150 and 167)
- The parent `OnboardingFlow` already provides the back button via `UnifiedTopBar`

**8. `src/pages/onboarding/stages/Stage7ContextConnection.tsx`**
- This page renders outside the OnboardingFlow layout (standalone `min-h-screen`)
- Add `<UnifiedTopBar hideCoach />` at the top
- Adjust content padding

### Summary

All sub-pages and onboarding pages will use `UnifiedTopBar` with `hideCoach` for a single, consistent back-button-only top bar. Feature pages keep `FloatingNavigation` with the coach icon. No titles in the top bar — all page titles live in the content area below.

