
Goal: fix the walkthrough so it behaves like a true demo on mobile, without tooltip overlap/jump, and with working Menu → Suite → Profile → Connected Data → Coach steps.

1. Fix the root mobile sidebar bug in `FirstSessionGuide.tsx`
- The current demo opens the desktop sidebar state, but on the user’s 390px viewport the sidebar is a mobile sheet controlled by `openMobile`.
- Update the step-action logic to open/close the correct sidebar state based on `isMobile`.
- This is why the walkthrough currently gets stuck after the Menu step and why the suite/connect-data demos never visibly appear.

2. Add real demo actions instead of static spotlight-only steps
- Extend the step config with explicit actions such as:
  - `open-sidebar`
  - `close-sidebar`
  - `scroll-sidebar-footer`
  - `open-profile`
  - `navigate-profile`
- Run these actions before measuring the target, with retries until the target exists.
- This will make the flow actually demonstrate:
  - Menu button opens sidebar
  - Suite stays open and shows navigation area
  - Connect Data continues to Profile instead of stopping at the profile row
  - Coach returns to home and highlights the top-right button

3. Fix Mental Performance Suite so it shows the actual navigation items
- Right now it only highlights `[data-tour="sidebar-nav"]`, which does not satisfy the requested “show the 4 different features”.
- Add `data-tour` hooks for each suite row in `LeftSidebar.tsx`.
- Change the suite step into either:
  - one grouped spotlight around the full visible feature list plus richer explanatory copy, or
  - a short sub-sequence that spotlights each item in order.
- Also ensure the sidebar sheet/panel gets elevated above the overlay on mobile.

4. Complete the Connect Data discovery path
- The current tour stops at `sidebar-profile`; it never opens Profile and never spotlights `connected-data-btn`.
- Split this into a true path:
  - open sidebar
  - scroll footer/profile into view
  - spotlight profile entry
  - navigate to `/profile`
  - after route settles, spotlight `data-tour="connected-data-btn"`
- This matches the requested “show me where it lives” behavior without redirecting straight to `/connected-data`.

5. Fix Coach step so the highlight always appears
- Ensure the coach step first closes the mobile sidebar, waits for the sheet dismissal to complete, scrolls to top, then measures `[data-tour="coach-access-wrap"]`.
- Keep circular spotlight mode with padded hit area.
- The current failure is likely because measurement runs while the sidebar transition/page state is still changing.

6. Remove tooltip overlap and the visible “jump” correction
- The overlap is happening because the tooltip renders, then repositions after measurement.
- Change tooltip rendering so it stays hidden until:
  - target rect is final
  - tooltip height has been measured
  - final top position is computed
- Use a two-pass measure flow:
  - mount hidden tooltip
  - measure actual height
  - compute top based on real target rect + gap
  - reveal only after final coordinates are ready
- For `today-state`, `compass`, and `daily-plan`, preserve preferred placement but fall back below when above doesn’t fit.

7. Refine spotlight bounds for State / Compass / Plan
- Keep `data-tour="daily-plan"` on the full wrapper.
- Adjust scroll alignment and per-step offsets so the visible spotlight starts exactly at the intended header region, or begins after the tooltip gap when tooltip is above.
- For large cards/sections, add per-step spotlight metadata such as:
  - `spotlightInsetTop`
  - `spotlightInsetBottom`
  - `tooltipGap`
  - optional `scrollOffset`
- This will stop the navigation card from covering “Your State”, “Your Compass”, or “Your Action” before correcting itself.

8. Add missing target hooks required by the approved behavior
- `LeftSidebar.tsx`
  - add `data-tour` for each of the 4 suite items
  - optionally add a footer wrapper target for profile-area scrolling
- `UserSettingsPopover.tsx`
  - keep `data-tour="sidebar-profile"`
- `Profile.tsx`
  - keep `data-tour="connected-data-btn"`
- `ExecutiveHome.tsx`
  - keep menu/coach wrapper hooks and ensure they remain stable for spotlight measurement

9. Verify walkthrough completion logic remains clean
- Confirm `finish()` no longer calls invalid onboarding step recording.
- Keep completion limited to local/session walkthrough state unless there is already a valid backend field for completion timestamp.

Technical details
- Primary issue: mobile sidebar uses `openMobile`, but the walkthrough currently only calls `setOpen(true/false)` semantics through sidebar context behavior, so the visible sheet never opens correctly on phones.
- Secondary issue: tooltip position is calculated after initial render, causing the temporary overlap seen in screenshots.
- Structural gap: step 6 and step 8 are not true demos yet; they spotlight containers but do not perform the requested UI path.
- Main files to update:
  - `src/components/onboarding/FirstSessionGuide.tsx`
  - `src/components/navigation/LeftSidebar.tsx`
  - `src/components/navigation/UserSettingsPopover.tsx`
  - `src/pages/Profile.tsx`
  - `src/pages/ExecutiveHome.tsx`

Expected result
- Menu step opens visibly on mobile.
- Mental Performance Suite visibly demonstrates the 4 feature entries.
- Connect Data shows Menu → Profile → Connected Data Sources.
- Coach button gets a visible circular spotlight after the sidebar closes.
- State / Compass / Plan tooltips appear only in final non-overlapping positions, without the initial overlap/jump.
