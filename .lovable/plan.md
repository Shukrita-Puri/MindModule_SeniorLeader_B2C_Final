Isolated UI change on the MRS card only.

### Changes
1. **Wrap `WeeklyDeltaDial` in a collapsible disclosure inside `MrsPage.tsx`**
   - Use the same `Collapsible` / `CollapsibleTrigger` / `CollapsibleContent` primitives already used by the signal pills in `DecisionReadinessBrief.tsx`.
   - Default state: **closed** on page load.
   - Trigger label: "Week over week" — keep the existing font styling (`text-[11px] uppercase tracking-[0.18em] text-muted-foreground`).
   - Add a `ChevronDown` icon that rotates 180° when open, matching the signal-pill pattern.

2. **Remove the visible border from `WeeklyDeltaDial.tsx`**
   - Drop the `border border-border/60` class from the card container (line 51).
   - Keep all internal layout, gradients, shadows, and typography unchanged.

3. **Update `WeeklyDeltaDial.test.tsx`**
   - Because the panel is closed by default, add a click on the trigger before asserting on the card contents.
   - No calculation or prop contract changes.

### Out of scope
- No Edge Function, hook, or scoring changes.
- No changes to `useWeeklyMrsDelta`, `MOCK_MRS`, or any other MRS logic.
- No other pages or components touched.