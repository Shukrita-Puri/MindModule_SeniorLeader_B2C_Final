

# Global Mobile UX Fix — Navigation, Scroll, and Sticky CTAs

## What This Fixes
1. **FloatingNavigation scrolls away** on pages like DailyCheckIn, Insights, RecalibrateMode, and Coach — back/coach buttons disappear on scroll
2. **Pages can open mid-scroll** — only 2 of ~20 pages use `useScrollToTop`
3. **Primary CTA buttons (Confirm, Continue, Save)** sit below the fold on DailyCheckIn, CheckInDetail, and onboarding pages — user must scroll to act
4. **No safe-area handling on FloatingNavigation** — buttons can sit under the notch/Dynamic Island

## Approach

### Part A: Fix FloatingNavigation (the main offender)
`FloatingNavigation` is `relative z-40` — it scrolls with content. Used on: DailyCheckIn, RecalibrateMode, Insights, SelfMasteryCoach.

**Change**: Make it `fixed top-0 left-0 right-0 z-50 safe-area-top` with a glass background (`bg-background/80 backdrop-blur-sm`), matching what `TopNavigation` and `UnifiedTopBar` already do. Add corresponding `pt-16` (or similar) to the page content below it so nothing hides behind the bar.

This single change fixes back-button visibility on 4+ pages at once.

### Part B: Global Scroll-to-Top
The existing `useScrollToTop` hook works but is only used in 2 pages. Instead of adding it to every page individually:

**Change**: Add a `ScrollToTop` component inside the router `Layout` wrapper in `App.tsx` that fires `window.scrollTo(0, 0)` on every pathname change. This covers all routes globally with one change.

### Part C: Sticky Bottom CTAs
Pages with primary action buttons that can fall below the fold:

| Page | Button | Current |
|------|--------|---------|
| DailyCheckIn | "Confirm" | `mt-6` in scrollable content, `pb-32` spacer |
| CheckInDetail | "Continue to my Performance Dashboard" | Inside card, scrollable |

**Change**: Extract CTAs into a sticky bottom container:
```
fixed bottom-0 left-0 right-0 z-50 px-4 pb-[env(safe-area-inset-bottom,16px)] pt-3 bg-gradient-to-t from-background via-background to-background/0
```

### Part D: Verify existing fixed navs
- `TopNavigation` — already `fixed top-0 ... z-50 safe-area-top` — correct
- `UnifiedTopBar` — already `fixed top-0 ... z-50 safe-area-top` — correct
- No changes needed for these two

## Files Changed

| File | Change |
|------|--------|
| `src/components/navigation/FloatingNavigation.tsx` | `relative z-40` → `fixed top-0 left-0 right-0 z-50 safe-area-top bg-background/80 backdrop-blur-sm` |
| `src/App.tsx` | Add `ScrollToTop` component inside Layout that scrolls to top on route change |
| `src/pages/DailyCheckIn.tsx` | Add `pt-16` to clear fixed nav; move Confirm button to sticky bottom container |
| `src/pages/CheckInDetail.tsx` | Add `pt-16`; move Save button to sticky bottom container |
| `src/pages/Insights.tsx` | Add `pt-16` to clear fixed nav |
| `src/pages/RecalibrateMode.tsx` | Add `pt-16`; remove redundant `useScrollToTop` import |
| `src/pages/SelfMasteryCoach.tsx` | Verify padding (Coach page is `h-screen` flex — may just need minor top padding adjustment) |
| `src/hooks/useScrollToTop.tsx` | Keep file but it becomes optional — global solution in App.tsx handles it |

## What Does NOT Change
- Logic, data fetching, state management
- Component structure beyond CSS positioning
- Content, copy, routing, navigation logic
- Colors, card designs, visual identity, icons
- TopNavigation and UnifiedTopBar (already correct)
- Onboarding pages (already use UnifiedTopBar which is fixed)

