

# Fix Tour Walkthrough: Mobile Sidebar, Profile Highlight, Tab Activation

## Issues Found

1. **Sidebar not showing on mobile tour**: The sidebar Sheet renders as a portal dialog. The tour overlay sits at `z-[60]`, but the mobile Sheet dialog needs its z-index elevated above it. The current `elevateSidebar` code finds `[data-sidebar="sidebar"]` and its parent `[role="dialog"]`, but the Sheet overlay/backdrop also needs elevation.

2. **Profile button missing circular highlight**: Step 7 (`sidebar-profile`) has no `spotlightPad` or `spotlightCircle` — it gets a default rectangular highlight unlike the menu button (step 5) which has `spotlightPad: 14, spotlightCircle: true`.

3. **Homepage tour steps may target hidden tab content**: Steps 1-3 target `today-state`, `compass`, and `daily-plan` which live inside tab panels controlled by `display: block/none`. If the wrong tab is active, the element is hidden and unmeasurable. The tour needs to activate the correct tab before highlighting.

## Changes

### 1. `src/components/onboarding/FirstSessionGuide.tsx`

**a) Fix mobile sidebar elevation (line ~335-341)**

Expand the `elevateSidebar` logic to also elevate the Sheet's backdrop/overlay element. On mobile, the sidebar renders inside a `Sheet` with a backdrop that sits below z-60. Add:
- Find the Sheet's overlay sibling (`[data-sidebar="sidebar"]`'s closest `[role="dialog"]`'s parent, or the Radix dialog overlay)
- Set its z-index to 61 as well
- On cleanup (`cleanupPrevious`), reset these z-indexes

**b) Add `spotlightCircle` + `spotlightPad` to Profile step (step 7, line ~139-149)**

Add `spotlightPad: 14` and `spotlightCircle: true` to the step 7 definition, matching the style of step 5 (menu button).

**c) Add tab activation before homepage highlights (steps 1-3)**

Add a new action type or inline logic: before highlighting `today-state`, activate the "state" tab; before `compass`, activate the "compass" tab; before `daily-plan`, activate the "action" tab. This can be done by:
- Adding a `preAction` field to step definitions (e.g., `activateTab: 'state'`)
- In `highlightElement`, click the corresponding tab button programmatically before measuring

### 2. `src/pages/ExecutiveHome.tsx`

**Add data-tour attributes to tab buttons** so the tour can programmatically click them:
- Add `data-tour="tab-state"`, `data-tour="tab-compass"`, `data-tour="tab-action"` to each tab button in the grid (line ~223-238)

### Files touched
- `src/components/onboarding/FirstSessionGuide.tsx` — step definitions + sidebar elevation + tab activation logic
- `src/pages/ExecutiveHome.tsx` — add `data-tour` attrs to tab buttons (~3 lines)

