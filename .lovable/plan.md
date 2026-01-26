
# Fix Plan: JIT Logic, Data Tracking, and Completion Status

## Summary of Issues

1. **JIT includes "Capture Win" evening flow** - Should be part of Performance Plan, not JIT
2. **Check-ins not being saved** - Root cause of empty Energy Rhythm
3. **Tiny Wins not showing in Insights** - Despite being captured in the database
4. **Completion shows "completed" after only 1 of 3 practices** - Coach completion not registering properly
5. **Insights queries missing DEV_MODE handling** - `fetchInsightsData` uses `user.id` directly

---

## Part 1: Remove Evening "Integrate" from JIT

The JIT system should only trigger for urgent scenarios:
- High-stakes calendar events (15-60 min away)
- Wearable stress spikes
- 3+ consecutive days of same low-energy state

**Evening Integrate should be part of Today's Performance Plan** (which already includes it via `coach-integrate`), not a separate JIT intervention.

**File: `src/components/home/JustInTimeIntervention.tsx`**

Remove the evening-depleted trigger entirely (lines 305-343):

```typescript
// REMOVE THIS ENTIRE BLOCK:
// 4. Evening → Integrate flow (for all users, not just depleted)
if (isEvening() && !moduleStatus.integrate) {
  // ... entire logic
}
```

The Performance Plan engine already includes an "Integrate" module in the evening that routes to the coach with the proper evening prompt. The JIT card duplicates this.

---

## Part 2: Fix Check-in Data Not Saving

The `daily_checkins` table is empty, which is why Energy Rhythm shows nothing.

**Investigation needed:**
- Verify `saveCheckin` in `src/utils/dailyCheckins.ts` is being called
- Check for RLS policy issues on `daily_checkins` table
- Ensure the DEV_MODE upsert is working

**Potential Fix in `src/utils/dailyCheckins.ts` (saveCheckin function):**

The function should log success/failure. Add explicit error handling:

```typescript
// In DEV_MODE branch (~line 153-178)
if (DEV_MODE) {
  console.log('[dailyCheckins] DEV_MODE: Saving checkin directly...', {
    user_id: DEV_USER.id,
    checkin_date: checkinData.checkin_date,
    outcome: checkinData.outcome
  });
  
  const { data, error } = await supabase
    .from('daily_checkins')
    .upsert(
      { ...checkinData, user_id: DEV_USER.id },
      { onConflict: 'user_id,checkin_date' }
    )
    .select()
    .maybeSingle();
  
  if (error) {
    console.error('[dailyCheckins] DEV_MODE save FAILED:', error);
    return null;
  }
  console.log('[dailyCheckins] DEV_MODE save SUCCESS:', data);
  return data as CheckinData;
}
```

---

## Part 3: Fix Insights Page DEV_MODE Queries

**File: `src/pages/Insights.tsx`**

The `fetchInsightsData` function (lines 195-282) queries `daily_checkins` and `sanctuary_events` using `user.id`. In DEV_MODE, this should use `DEV_USER.id` explicitly for consistency.

```typescript
const fetchInsightsData = async () => {
  if (!user?.id) return;
  setLoading(true);

  // Use DEV_USER.id in DEV_MODE for consistency
  const effectiveUserId = DEV_MODE ? DEV_USER.id : user.id;

  try {
    const today = new Date();
    const sevenDaysAgo = subDays(today, 6);

    // Fetch check-ins
    const { data: checkIns } = await supabase
      .from('daily_checkins')
      .select('checkin_date, energy_balance, outcome, created_at')
      .eq('user_id', effectiveUserId)  // Use effectiveUserId
      .gte('checkin_date', format(sevenDaysAgo, 'yyyy-MM-dd'))
      .lte('checkin_date', format(today, 'yyyy-MM-dd'))
      .order('checkin_date', { ascending: true });

    // ... rest of function uses effectiveUserId
  }
};
```

---

## Part 4: Fix Performance Plan Completion Status

The issue is that completing a coach session doesn't add to `completed_practice_ids`, so the ritual shows incomplete.

**Root Cause:** When the user completes the coach flow, the practice ID (`coach-integrate`) isn't being added to `completed_practice_ids` in the `daily_ritual_completions` table.

**File: `src/pages/SelfMasteryCoach.tsx`**

After the coach session ends, ensure the coach practice ID is marked complete:

```typescript
// When coach session is done (user sends final message or closes)
// Add to completed_practice_ids
const markCoachComplete = async () => {
  const ritualData = await getTodayRitual();
  const coachId = flowType === 'integrate' ? 'coach-integrate' : 'coach-prepare';
  const existingIds = ritualData?.completed_practice_ids || [];
  
  if (!existingIds.includes(coachId)) {
    await upsertRitual({
      ritual_date: new Date().toISOString().split('T')[0],
      completed_practice_ids: [...existingIds, coachId]
    });
  }
};
```

**Alternative Fix in `checkRitualCompletion` (DailyRitual.tsx):**

The status logic compares `effectiveCompletedCount` to `totalRecommended`, but the calculation might be off. The current ritual data shows:
- `recommended_practices_count: 3`
- `completed_practice_ids: []`
- Boolean flags: all false

If the user completed the coach but it wasn't registered, the fix is in the coach completion flow, not the status calculation.

---

## Part 5: Ensure Tiny Wins Show in Insights

The database shows 2 tiny wins for `dev-user-123`, but they may not display if the Insights page query has issues.

**Verified:** The `fetchTinyWinsInsights` function already has a DEV_MODE branch (lines 289-313) that queries directly with `DEV_USER.id`.

The issue might be:
1. The query date range (14 days ago) - verify the wins are within range
2. The themes extraction logic

The wins are dated `2026-01-26`, which is today, so they should appear. The query seems correct.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/home/JustInTimeIntervention.tsx` | Remove evening-depleted trigger (lines 305-343) |
| `src/utils/dailyCheckins.ts` | Add explicit logging for DEV_MODE save |
| `src/pages/Insights.tsx` | Add `effectiveUserId` for DEV_MODE in `fetchInsightsData` |
| `src/pages/SelfMasteryCoach.tsx` | Mark coach as complete in `completed_practice_ids` when session ends |

---

## Expected Outcomes

1. **JIT = Urgent Only**: Calendar events (15-60 min) and wearable stress
2. **Evening Integrate via Performance Plan**: The daily plan includes coach-integrate for evening
3. **Check-ins Save Properly**: With logging to debug failures
4. **Energy Rhythm Populates**: When check-ins are saved correctly
5. **Tiny Wins Display**: Already querying correctly, but verify themes extraction
6. **Completion Status Accurate**: Only show "completed" when ALL 3-4 items are done

---

## Technical Notes

### Current JIT Triggers (keeping these):
1. `calendar` - High-stakes event in 15-60 min
2. `wearable` - Stress spike detected
3. `consecutive-low` - 3+ days of same low state

### Removing from JIT:
- `evening-depleted` - This duplicates the Performance Plan's Integrate module

### Performance Plan Already Handles Evening:
The `generatePerformancePlan` function in `performancePlanEngine.ts` includes an Integrate module when `timeOfDay === 'evening'`. This routes to the coach with the evening closure prompt.
