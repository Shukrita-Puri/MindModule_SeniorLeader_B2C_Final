

# Fix Today's 3 Performance Priorities — 4 Issues

## Issue 1: Show reasoning for all priorities (not just multi-practice)

**File:** `src/components/home/TodayThreePriorities.tsx`

Line 732 gates `practice.reasoning` behind `hasMultiple`. For single-practice slots (Priority 2, Priority 3), the reasoning text is hidden. Also the `sequenceReasoning` (line 660) and `whyLine` (line 667) only show in expanded state — these are fine, but the per-practice `reasoning` line inside the card should show for single-practice slots too.

**Fix:** Remove the `hasMultiple` condition from line 732. Change to `{practice.reasoning && (`.

## Issue 2: Fix time-of-day awareness in context statements

**File:** `supabase/functions/generate-mastery-plan/index.ts`

Line 2839: `'Clarity strong — this maintains it through the ${ctx.timeOfDay === 'morning' ? 'afternoon' : 'rest of the day'}'`

At midnight (evening period), this produces "rest of the day" which is nonsensical. Fix to use proper time-aware phrasing:
- morning → "afternoon"
- afternoon → "evening"
- evening → "tomorrow"

Also audit lines 2792, 2794-2796, and 2870+ for similar issues.

## Issue 3: Priority-level feedback after each priority completion

**File:** `src/components/home/TodayThreePriorities.tsx`

Currently feedback is triggered only at the whole-plan level from `ExecutiveHome.tsx` via `consumePlanFeedbackFlag`. Need to:

1. Add state for `feedbackSlot` (which priority just completed) in `TodayThreePriorities`
2. In the completion detection effect (line 123), detect when a full slot is newly completed (all practices in that slot done)
3. Show `PlanFeedbackModal` inline with priority-specific title (e.g., "Priority 1 Complete")
4. Submit feedback with slot context (horizon type, priority number)
5. Props on `PlanFeedbackModal` updated to accept optional `priorityLabel` and `priorityNumber`

## Issue 4: Counter should count completed priorities, not individual practices

**File:** `src/components/home/TodayThreePriorities.tsx`

Line 534: `completedCount = allPractices.filter(...)` counts individual practices.
Line 554: `{completedCount} of {horizonModules.length}` — displays against total priorities (3).

**Fix:** Change `completedCount` to count the number of slots where ALL practices are complete:
```typescript
const completedPriorityCount = horizonModules.filter(hm => {
  const slotPractices = hm.practices || [hm.practice];
  return slotPractices.every(p => completedPracticeIds.includes(p.contentId));
}).length;
```

Use `completedPriorityCount` in the display instead of `completedCount`.

## Files Changed

| File | Changes |
|------|---------|
| `src/components/home/TodayThreePriorities.tsx` | Remove `hasMultiple` gate on reasoning; fix counter to count priorities; add per-priority feedback modal |
| `src/components/home/PlanFeedbackModal.tsx` | Add optional `priorityLabel`/`priorityNumber` props for per-priority context |
| `supabase/functions/generate-mastery-plan/index.ts` | Fix time-of-day phrasing in tactical/strategic whyLine builders |

## Implementation Order

1. Fix reasoning display (remove `hasMultiple` gate)
2. Fix counter to count completed priorities
3. Fix time-of-day phrasing in edge function
4. Add per-priority feedback modal trigger
5. Deploy edge function + test end-to-end

