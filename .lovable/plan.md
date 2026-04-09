

# Mobile-Native Corrections: Bottom Nav, Tour, and Profile

## Problems Identified

1. **Bottom nav covers content**: The FloatingPillNav (z-180, bottom ~12px) and CoachFAB (z-200, bottom 84px) overlap scrollable content — including the Performance Readiness Plan section and any profile-related elements near the bottom of the sidebar.

2. **Tour Step 3 (Plan) not scrolled into view**: Step 3 targets `[data-tour="daily-plan"]` with `scrollBlock: 'start'` but the element is far down the page. The bottom nav (and Coach FAB) cover the plan card and tour tooltip. The tour overlay z-index (9999) is above the nav (180), but the spotlighted element is at z-61 — visually buried.

3. **Tour tooltip position inconsistency**: Each step places the tooltip in a different screen position (centered, below target, above target), creating a jumpy, non-native feel.

---

## Fixes

### Fix 1: Hide FloatingPillNav and CoachFAB during the tour

**File**: `src/App.tsx`

During the first-session tour, both floating elements should be hidden to prevent overlap. Detect `first_session_guide_active` from sessionStorage (already set) and suppress rendering.

- Add a state/effect in `Layout` that listens for the tour active key.
- When tour is active: `showPillNav = false`, `hideCoach = true`.

### Fix 2: Tour Step 3 — scroll plan to center with safe padding

**File**: `src/components/onboarding/FirstSessionGuide.tsx`

- Change Step 3's `scrollBlock` from `'start'` to `'center'` so the plan card is centered in viewport.
- After `scrollIntoView`, add a delay before measuring to allow scroll to settle.
- In `computePosition()`, clamp tooltip `top` to account for bottom safe area (add ~80px bottom margin to prevent tooltip from sitting behind where the nav normally lives, even though nav is hidden during tour).

### Fix 3: Standardize tour tooltip position across all 3 steps

**File**: `src/components/onboarding/FirstSessionGuide.tsx`

Mobile-native best practice: the tooltip should always appear in a **consistent, predictable location** — ideally below the spotlight for steps 1 and 2, and above for step 3 (since the plan is lower on the page). The key fix:

- Set all tooltip positions to use `'below'` as default preference, falling back to `'above'` only when insufficient space below.
- Ensure the tooltip width/padding is consistent (already `calc(100% - 32px)`).
- Add a max-bottom constraint: `Math.min(top, vH - tooltipH - safeAreaBottom - 16)` to prevent bottom-edge clipping.

### Fix 4: Profile button clearance

**File**: `src/components/navigation/LeftSidebar.tsx`

The sidebar footer (`UserSettingsPopover`) needs bottom padding to clear the floating pill nav when the sidebar sheet is open on mobile.

- Add `pb-[calc(env(safe-area-inset-bottom)+72px)] sm:pb-0` to the `SidebarFooter` to push the profile/settings button above the pill nav on mobile.

Alternatively, hide the pill nav when the sidebar sheet is open (cleaner approach):
- In `Layout`, detect sidebar open state and suppress `FloatingPillNav` when mobile sidebar is visible.

---

## Summary of changes

| File | Change |
|------|--------|
| `src/App.tsx` | Hide pill nav + coach FAB during active tour |
| `src/components/onboarding/FirstSessionGuide.tsx` | Fix Step 3 scroll to center; standardize tooltip position; add bottom safe-area clamping |
| `src/components/navigation/LeftSidebar.tsx` | Add bottom padding to sidebar footer for pill nav clearance on mobile |

All changes are mobile-only (`sm:hidden` scoped) and preserve desktop behavior.

