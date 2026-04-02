
Goal: make the walkthrough behave like a true demo, not a passive overlay, and fix the remaining overlap/highlight issues shown in the screenshots.

1. Rework tooltip placement so it never covers the highlighted content
- Replace the current fixed top/bottom tooltip behavior with measured positioning tied to the target element.
- For large sections like “Your Compass” and “Your Action,” compute a safe gap above the highlighted region and clamp the tooltip there.
- If there is not enough room above, place the tooltip below the highlighted region instead.
- This prevents the box from sitting on top of the headline/body as shown in the screenshots.

2. Make the highlight region start exactly from the feature headline
- Keep `data-tour="daily-plan"` on the full wrapper, but refine the spotlight logic so the highlighted bounds use the wrapper’s real rect after scroll settles.
- Add per-step padding controls so “Your Action” can highlight from the StepLabel/header down through the cards and CTA, without the tooltip intruding into that region.
- Do the same for “Your Compass” so the tooltip sits above the title with visible space.

3. Turn Menu / Coach / Suite / Connected Data into guided demo steps
- Add a small step-action system to `FirstSessionGuide.tsx` so steps can trigger UI behavior, not just navigate/scroll.
- Menu step: animate/open the sidebar and highlight the larger padded wrapper around the menu trigger.
- Mental Performance Suite step: keep the sidebar open and sequentially spotlight the 4 suite items inside the sidebar so the user can clearly see each feature being referenced.
- Coach step: highlight the larger padded wrapper around the coach button with a true circular punch-through.

4. Change “Connect Your Data” from redirect to in-app demo flow
- Remove the `/connected-data` page redirect from the walkthrough.
- Instead, make this step demo the path the user would take:
  - open the menu
  - scroll within the sidebar/footer area to the profile/account section
  - open the profile/settings entry
  - then spotlight the “Connected Data Sources” entry as the destination
- This matches your requested “show me where it lives” behavior instead of taking the user away to another page.
- If the current sidebar only exposes “Profile,” then the walkthrough should highlight that entry first and then continue the demo on the Profile page only for the connected-data button itself, not jump directly there.

5. Add explicit tour targets for the exact sidebar/profile elements
- Add `data-tour` hooks for:
  - sidebar trigger wrapper
  - coach wrapper
  - sidebar panel
  - each of the 4 Mental Performance Suite items
  - profile entry in `UserSettingsPopover`
  - “Connected Data Sources” button in `Profile.tsx`
- This allows the walkthrough to spotlight exact UI pieces instead of generic containers.

6. Improve spotlight rendering for small controls
- Change the current inline z-index styling into a reusable spotlight mode:
  - circular for icon buttons (menu, coach)
  - rounded-rect for cards/sections
  - full-panel elevation for sidebar content
- Add configurable padding/radius per step so small buttons get a larger visible punch-through area.

7. Fix the walkthrough completion runtime error
- The current finish handler sends `first_session_walkthrough` to `onboarding-progress`, but that endpoint only accepts canonical onboarding step names.
- Fix by removing that invalid step submission from the walkthrough flow, or by routing walkthrough completion to a separate accepted action.
- This is separate from the visual issue, but it should be cleaned up in the same pass.

Files to update
- `src/components/onboarding/FirstSessionGuide.tsx`
- `src/pages/ExecutiveHome.tsx`
- `src/components/navigation/LeftSidebar.tsx`
- `src/components/navigation/UserSettingsPopover.tsx`
- `src/pages/Profile.tsx`
- optionally `src/hooks/useOnboardingProgress.ts` or the walkthrough finish logic only

Expected result
- Tooltip boxes no longer overlap Compass or Action content.
- Menu and Coach buttons are visibly spotlighted with larger circles.
- Mental Performance Suite is shown as a guided demo with each feature visibly highlighted.
- Connected Data is shown via the actual discovery path in-app, not by redirecting straight to the page.
- The walkthrough no longer throws the invalid onboarding step error.
