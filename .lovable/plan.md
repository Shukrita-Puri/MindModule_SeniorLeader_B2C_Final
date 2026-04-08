

# Batch 1: Homepage Layout Restructure — Implementation Plan

## Summary
Wire the three existing components (CheckInBanner, FloatingCoachButton, FloatingPillNav) into the app, update colors to `#F26A50`, restyle the pill nav to match micro-practice glass cards, remove sidebar pulse, and hide CoachAccessButton on all viewports (FAB replaces it everywhere).

## Changes

### 1. `FloatingPillNav.tsx` — Glass restyle, no orange active state
- Replace `ACTIVE_COLOR = '#E87A2F'` with `#F26A50`
- Change pill background from `rgba(15,15,15,0.65)` to `bg-white/15 backdrop-blur-md border border-white/40` (matching `MicroPracticePlayerCards.tsx` line 2194: `bg-white/15 backdrop-blur-md border border-white/40`)
- Remove the hardcoded dark background style, use Tailwind classes instead

### 2. `FloatingCoachButton.tsx` — Color update
- Change `ACCENT` from `#E87A2F` to `#F26A50`
- Update pulse keyframe rgba from `232,122,47` to `242,106,80`

### 3. `CheckInBanner.tsx` — Color update
- Replace all `#E87A2F` references with `#F26A50` (dot, text, button bg, dismiss icon)

### 4. `ExecutiveHome.tsx` — Wire CheckInBanner + hide CoachAccessButton
- Import and render `<CheckInBanner />` between hero section (after line 285 `</div>`) and the STATE section
- Hide `CoachAccessButton` wrapper: change line 272 from no visibility class to `hidden` (hide on all viewports — FAB replaces it on both mobile and desktop per user request)
- Change `pb-8` (line 288) to `pb-[100px]`

### 5. `App.tsx` — Add floating nav components to Layout
- Import `FloatingPillNav` and `FloatingCoachButton`
- Add both to the `Layout` component (after `<PushNotificationActionHandler />`, before `<Outlet />`)
- They already have `sm:hidden` so desktop unaffected

### 6. `SidebarDiscoveryPulse.tsx` — Remove pulse rings
- Remove the `<style>` block (lines 71-100) with keyframe animations
- Remove the two `<span>` pulse elements (lines 107-123)
- Keep `shouldPulse` logic and everything else unchanged

### 7. `Insights.tsx` — Bottom padding
- Add `pb-[100px]` to the root div (line 795): `min-h-screen bg-background pt-16 pb-[100px]`

### 8. `RecalibrateMode.tsx` — Bottom padding
- Add `pb-[100px]` to the root div (line 96): `h-screen h-[100dvh] bg-background flex flex-col pt-16 pb-[100px]`

## Files Modified
| File | Change |
|------|--------|
| `src/components/navigation/FloatingPillNav.tsx` | Glass styling from micro-practice cards, color to `#F26A50` |
| `src/components/navigation/FloatingCoachButton.tsx` | Color to `#F26A50` |
| `src/components/home/CheckInBanner.tsx` | Color to `#F26A50` |
| `src/pages/ExecutiveHome.tsx` | Add CheckInBanner, hide CoachAccessButton, padding |
| `src/App.tsx` | Add FloatingPillNav + FloatingCoachButton to Layout |
| `src/components/navigation/SidebarDiscoveryPulse.tsx` | Remove pulse rings |
| `src/pages/Insights.tsx` | Add bottom padding |
| `src/pages/RecalibrateMode.tsx` | Add bottom padding |

## What Does NOT Change
- Hero, TodayStateCard, StrategicIntentionCard, DailyRitual internals
- All data fetching, scoring, energy state logic
- Routing, auth flows, hamburger menu
- Card colours and styling

