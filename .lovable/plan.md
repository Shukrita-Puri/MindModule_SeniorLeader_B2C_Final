

# Fix First Session Walkthrough — 7 Issues

## Summary of problems from screenshots

1. **Problem 1 (Step 4 — "Your Action")**: The tooltip overlaps the plan content. The `data-tour="daily-plan"` div only wraps `DailyRitual`, not the "C: Your Action" header above it. The tooltip sits on top of the highlighted area. Fix: expand the highlight region to include the header + plan + JIT, and force tooltip above with gap.

2. **Problem 2 (Step 2 — "Decision Readiness")**: Wrong body text. Update to the user's specified copy.

3. **Problem 3 (Step 3 — "Your Compass")**: Tooltip overlaps the compass section. Need to scroll so the element is lower on screen, then place tooltip above it with a gap.

4. **Problem 4 (Steps 6, 7, 8 — Menu, Suite, Coach)**: The sidebar trigger and coach button are small icons but the highlight circle is the same size — invisible behind the overlay. The sidebar nav items are not individually highlighted; the overlay is not removed from them.

## Changes

### File: `src/pages/ExecutiveHome.tsx`

**Expand `data-tour="daily-plan"` wrapper** to include the "C: Your Action" StepLabel header, DailyRitual, and JitCarousel. Move the `data-tour="daily-plan"` attribute to a new parent `div` that wraps the StepLabel section through JitCarousel.

**Add larger highlight wrappers for Menu and Coach buttons**: Add `data-tour` wrapper divs with extra padding around the `SidebarTrigger` and `CoachAccessButton` to create a visible highlight circle. Specifically:
- Wrap `SidebarTrigger` in a div with `data-tour="sidebar-trigger-wrap"` that has `p-2 -m-2 rounded-full` to create a bigger clickable/visible highlight zone.
- Wrap `CoachAccessButton` div similarly with `data-tour="coach-access-wrap"` and `p-2 -m-2 rounded-full`.

### File: `src/components/onboarding/FirstSessionGuide.tsx`

**Step 1 (index 1) — Decision Readiness**: Update body text to:
`"Your Decision Readiness is where your internal signals meet. It combines how you feel right now — your sharpness, clarity, and confidence, with an understanding from your wearable (if available) — based on your time of day."`

**Step 2 (index 2) — Compass**: Change `scrollIntoView` block to `'start'` instead of `'center'` so the element appears lower on screen. Add a step-specific override in `highlightElement` or use a new `scrollBlock` property on `GuideStep` to control scroll alignment per step. Force tooltip to `'top'`.

**Step 3 (index 3) — Your Action**: Change to scroll `'start'` so the full section (header through cards) is visible below the tooltip.

**Step 5 (index 5) — Your Menu**: Change `targetSelector` to `'[data-tour="sidebar-trigger-wrap"]'` (the padded wrapper). This ensures the highlight circle is larger and visible.

**Step 6 (index 6) — Mental Performance Suite**: Instead of highlighting the entire `sidebar-nav` ul generically, the step should:
- Keep `openSidebar: true`
- Use `targetSelector: '[data-tour="sidebar-nav"]'`
- In the highlight logic, also set the sidebar itself to `z-index: 61` so it punches through the overlay. Currently only the `sidebar-nav` element gets z-index, but its parent sidebar panel stays behind the overlay, making the highlight invisible.

**Step 7 (index 7) — Coach Access**: Change `targetSelector` to `'[data-tour="coach-access-wrap"]'` for a bigger highlight area.

**Step 8 (index 8) — Connect Your Data**: Change from `fullscreen` to an interactive step. Change `page` to `'connected-data'`. Navigate to `/connected-data`. Use `targetSelector` pointing to the connected data page content. This shows the user the actual page rather than just text about it.

**Highlight logic changes in `highlightElement`**:
- Add a `scrollBlock` property to `GuideStep` (`'center' | 'start' | 'end'`, default `'center'`).
- Steps 2 and 3 use `scrollBlock: 'start'` to push the element lower, leaving room for the tooltip above.
- For the sidebar step (step 6), after opening sidebar, also set the sidebar panel element (`[data-sidebar="sidebar"]`) to `position: relative; z-index: 61` to punch it through the overlay.

**Cleanup**: When cleaning up highlighted elements, also check and clean up the sidebar panel z-index if it was elevated.

### File: `src/components/navigation/LeftSidebar.tsx`

Add `data-tour="sidebar-panel"` to the `<Sidebar>` component so the guide can target and elevate it above the overlay.

### Detailed step configuration after changes

```text
Step 0: Check-in carousel (unchanged)
Step 1: Today State — new body text
Step 2: Compass — scrollBlock: 'start', tooltip forced top
Step 3: Daily Plan — expanded wrapper, scrollBlock: 'start', tooltip forced top
Step 4: System Learns (fullscreen, unchanged)
Step 5: Menu — bigger highlight wrapper
Step 6: Suite — sidebar + nav elevated above overlay
Step 7: Coach — bigger highlight wrapper
Step 8: Connect Data — navigate to /connected-data, highlight content
Step 9: You're Ready (fullscreen, unchanged)
```

### Navigation for "Connect Your Data" step

Instead of navigating to `/connected-data` (which requires a different page layout and top bar), keep it as a fullscreen step but change the copy to be more actionable. The user's request says "show scrolling down to the profile part and click on profile and take them to connected data sources." This is complex multi-page navigation mid-tour. A simpler approach: navigate to `/connected-data` page and highlight the main content area, then on "Next" navigate back to `/executive-home` for the final step.

Add `'connected-data'` as a valid `page` value in `GuideStep`. In the page transition effect, handle this new page value to navigate to `/connected-data`. Use `targetSelector: '[data-tour="connected-data-content"]'` and add that attribute in `ConnectedData.tsx`.

### File: `src/pages/ConnectedData.tsx`

Add `data-tour="connected-data-content"` to the main content wrapper so the guide can highlight it.

### Summary of all files changed
- `src/components/onboarding/FirstSessionGuide.tsx` — step config, highlight logic, scroll control, sidebar elevation
- `src/pages/ExecutiveHome.tsx` — expand daily-plan wrapper, add padded tour wrappers for menu/coach buttons
- `src/components/navigation/LeftSidebar.tsx` — add data-tour attribute to sidebar
- `src/pages/ConnectedData.tsx` — add data-tour attribute

