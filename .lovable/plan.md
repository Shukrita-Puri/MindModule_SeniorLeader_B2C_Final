

## Plan: Outer Readiness Brief — Full Context Audit Fix

Two issues plus gaps discovered during audit.

---

### Issue 2: `computeCalendarMetrics()` Inaccuracy

**File**: `supabase/functions/compute-outer-readiness/index.ts` (lines 47-93)

**Changes to `computeCalendarMetrics()`:**

1. **Meeting density metric**: Calculate total gap time between consecutive events. If total gap < 30 min across 3+ meetings, boost pressure by +3.

2. **Lower load threshold**: ≥4 events with average gap < 20 min = 'high' (currently needs ≥5).

3. **Higher attendee weight**: >5 attendees now adds +3 pressure (was +2).

4. **Intensity multiplier**: If >50% of events are non-recurring AND organizer, apply 1.5x pressure multiplier before thresholding.

5. **Stronger back-to-back**: Gap < 15 min adds +2 (was +1). Gap < 5 min adds +3.

No auth changes needed — function already works for both auth and dev users via `userId` from either source.

---

### Issue 4: Reasoning Line Visibility

**Files**: `src/components/home/DailyRitual.tsx`, `src/components/home/JitCarousel.tsx`

Change reasoning styling from:
```
text-[11px] text-muted-foreground italic
```
to:
```
text-[11px] text-muted-foreground/90 italic font-medium
```

No edge function change needed — reasoning is already populated for all users via service role key in `generate-mastery-plan`.

---

### Gap Found: Sunday Evening Theme Ignores Monday Signals

**Problem**: `getTheme()` produces Sunday evening phrases like "Close into the week" without referencing Monday's actual calendar load. Only the leanOn/watchFor cascade uses Monday data. The theme phrase + context should differ based on whether Monday is heavy or light.

**Additionally**: Tomorrow's calendar is only fetched when `isLateEvening(hour)` (≥21:00), but Sunday evening themes in `getTheme()` fire at any evening hour (≥18:00). This means a user checking in at 7pm Sunday gets no Monday context.

**Fix** (same file):

1. **Expand tomorrow fetch**: Also fetch tomorrow's calendar when `dayOfWeek === 0` (Sunday) AND hour ≥ 18, not just when `isLateEvening`.

2. **Pass tomorrow metrics to `getTheme()`**: Add `tomorrowLoad` and `tomorrowPressure` parameters.

3. **Update Sunday evening theme entries**: For all 4 tiers, the Sunday evening context text should reference Monday's actual load:
   - Heavy Monday: "A demanding Monday is ahead — [tier-specific guidance]"
   - Light Monday: "A lighter Monday ahead — [tier-specific guidance]"
   - No Monday data: Keep current generic text

This ensures the entire Outer Readiness Brief (phrase, context, leanOn, watchFor) is Monday-aware on Sunday evenings, not just the leanOn/watchFor section.

---

### Summary of Changes

| File | Change |
|------|--------|
| `compute-outer-readiness/index.ts` | Enhanced `computeCalendarMetrics()` with density, intensity multiplier, stronger back-to-back, lower thresholds |
| `compute-outer-readiness/index.ts` | Expand tomorrow fetch to Sunday ≥18:00; pass tomorrow metrics to `getTheme()`; update Sunday evening themes for all 4 tiers |
| `DailyRitual.tsx` | Reasoning line styling boost |
| `JitCarousel.tsx` | Reasoning line styling boost |

