
Goal: fix the non-working Confirm button on `/daily-check-in`, make the check-in screen fit within one fold more cleanly, remove redundant top-right coach icons across the app, and align the floating coach/menu button styling.

What I found
- The Confirm CTA itself is wired correctly: `handleConfirm` calls `handleOutcomeSelect`, which saves the check-in and navigates onward.
- The real UX bug is layout: on `DailyCheckIn.tsx`, the fixed Confirm bar sits too close to the state cards. On a 390x844 viewport, the last card and CTA visually collide, so the button appears blocked and the state selection area feels cramped.
- The top-right coach icon is still baked into `FloatingNavigation.tsx` by default, so any page using `<FloatingNavigation />` without `showCoachButton={false}` still renders it.
- The floating coach FAB currently has an orange border and different chrome than the menu/back buttons.
- The menu circle (`SidebarDiscoveryPulse`) and coach FAB use similar but not fully unified styling.

Implementation plan

1. Fix `/daily-check-in` layout so it behaves like a single-fold action screen
- Tighten the hero/header spacing in `DailyCheckIn.tsx`:
  - reduce top and bottom vertical spacing around the title block
  - move “Select your current state” and the card stack upward
  - slightly reduce per-card vertical padding and inter-card gaps if needed
- Reserve explicit bottom clearance for the sticky Confirm bar plus pill nav, instead of letting the last card run into it.
- Best-practice approach: keep the primary CTA fixed, but ensure the last interactive list item never sits underneath it. The content area should end above the CTA safe zone.

2. Make the Confirm CTA reliably tappable
- In `DailyCheckIn.tsx`, raise the sticky Confirm container a little more above the bottom nav.
- Ensure the CTA’s z-index remains above page content, while the content area has enough bottom padding to avoid overlap.
- Keep the CTA full-width and fixed, but visually separate it from the state list with a clear gap.

3. Remove top-right coach icon consistently across the app
- Change `FloatingNavigation.tsx` so it no longer shows the coach icon by default.
- Make the default right-side behavior a spacer unless a page explicitly passes `rightContent`.
- This removes the redundant top-right coach icon everywhere and makes the floating FAB the single coach entry point.

4. Keep coach FAB only where intended
- Preserve the existing route-level hiding in `App.tsx` for `/daily-check-in` and `/check-in-detail`.
- Since top-nav coach access will be removed globally, the app will have one clear rule:
  - no coach access during check-in flow
  - FAB-only coach access from homepage/core product pages onward

5. Unify menu circle and coach FAB styling
- Match the FAB chrome to the same dark circular surface used by the menu/back controls:
  - same background
  - same shadow language
  - no orange border
- Update `FloatingCoachButton.tsx` to remove the orange outline and use white icon styling or the app’s agreed icon treatment.
- Keep the orange pulse around the FAB only, using the previous discovery behavior moved from the menu button.

6. Restore/strengthen the coach pulse on the FAB
- Apply the orange pulsating ring treatment to `FloatingCoachButton.tsx` only.
- Keep the pulse outside the button body so the button surface stays visually consistent with the menu circle.

7. Refine the bottom pill nav toward the Apple-style reference
- Keep the darker translucent pill shell, but polish the active state so it reads like a subtle highlighted capsule behind the active tab.
- Use white icons consistently for all tabs, not faded taupe.
- Preserve enough bottom offset so the nav never visually collides with sticky CTAs on short mobile screens.

Files to update
- `src/pages/DailyCheckIn.tsx`
- `src/components/navigation/FloatingNavigation.tsx`
- `src/components/navigation/FloatingCoachButton.tsx`
- `src/components/navigation/FloatingPillNav.tsx`
- possibly `src/components/navigation/SidebarDiscoveryPulse.tsx` if I align its surface classes exactly with the FAB/menu standard

Technical notes
- Root cause of “Confirm not working”: not broken click logic; it’s a mobile spacing/stacking issue caused by a fixed CTA competing with the last rows in a short viewport.
- Best-practice fix: fixed CTA + protected content safe area + compact first-fold layout.
- The cleanest consistency change is to make `showCoachButton` default to `false` in `FloatingNavigation`, so coach access is always opt-in rather than accidentally rendered on pages that use the shared header.
