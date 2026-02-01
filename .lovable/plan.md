
# Fix Plan: Performance Plan Stability + Visual Asset Separation

## Root Cause Analysis

### Issue 1: Performance Plan Changes on Every Refresh
**Problem**: Every time the Executive Home page loads/refreshes, `DailyRitual.tsx` calls `loadRecommendations()` which regenerates a fresh performance plan. The `selectContentForModule()` function includes randomization among top 3 candidates (line 483-488 in performancePlanEngine.ts), causing different practices to appear each time.

**Expected Behavior**: The Performance Plan should remain stable throughout the day and only change when:
- User completes a new daily check-in
- Time of day changes significantly (morning → afternoon → evening)
- JIT triggers occur (calendar events, wearable stress)

**Root Cause Code** (performancePlanEngine.ts lines 483-488):
```typescript
// Randomize among top 3 candidates for variety
const topCandidates = scored.slice(0, Math.min(3, scored.length));
const randomIndex = Math.floor(Math.random() * topCandidates.length);
return topCandidates[randomIndex]?.content || null;
```

**Additional Issue**: `DailyRitual.tsx` fetches `todayRitual` but only uses it for `completedToday` - it never checks if `recommended_practice_ids` already exist and should be reused.

### Issue 2: Visual Asset Separation Confirmation
The codebase already separates visuals correctly:
- **Executive Home hero**: Uses 15 unique videos from `/all-visuals/videos/` (depleted-morning.mp4, managing-afternoon.mp4, etc.) - tied to energy tier + time of day
- **Recalibrate Studio**: Uses architectural illustrations (architectural-pause.jpg, architectural-power-up.jpg, architectural-presence.jpg)
- **Insights page**: No hero visual (just text header)
- **Practice player pages**: Use practice-specific thumbnails

No visual overlap exists. The videos in `/all-visuals/videos/` are exclusively for the Executive Home dashboard.

---

## Solution

### Part 1: Stabilize Performance Plan Recommendations

The fix ensures recommendations persist throughout the day until a meaningful change occurs.

**Step 1: Modify DailyRitual.tsx - Check for existing recommendations first**

In `loadRecommendations()`, before generating a new plan:
1. Fetch today's ritual record
2. If `recommended_practice_ids` exists, reconstruct the plan from stored IDs
3. Only regenerate if no stored recommendations exist OR if check-in changed

```typescript
const loadRecommendations = async () => {
  setLoading(true);
  
  try {
    // First check if we have stored recommendations for today
    const todayRitual = await getTodayRitual();
    
    // If recommendations already exist and no new check-in, use stored plan
    if (todayRitual?.recommended_practice_ids && todayRitual.recommended_practice_ids.length > 0) {
      const storedPlan = reconstructPlanFromIds(todayRitual.recommended_practice_ids);
      if (storedPlan.length > 0) {
        console.log('🔄 Using stored Performance Plan:', storedPlan.map(m => m.content.id));
        setRecommendations(storedPlan);
        setLoading(false);
        return;
      }
    }
    
    // No stored plan - generate fresh one
    // ... existing generation logic ...
    
    // Store the generated plan immediately
    await upsertRitual({
      ritual_date: new Date().toISOString().split('T')[0],
      recommended_practice_ids: plan.map(r => r.content.id),
      recommended_practices_count: plan.length
    });
  }
}
```

**Step 2: Add helper function to reconstruct plan from stored IDs**

Create `reconstructPlanFromIds()` that:
1. Looks up each stored practice ID in the content library
2. Rebuilds ModuleRecommendation objects
3. Handles coach cards (coach-prepare, coach-integrate)

**Step 3: Determine when to invalidate stored recommendations**

Add logic to regenerate if:
- Today's check-in timestamp is newer than the stored ritual's `created_at`
- Time of day window has shifted (e.g., morning → afternoon)
- Manual "refresh recommendations" action (optional future feature)

### Part 2: Update performancePlanEngine.ts - Remove runtime randomization

Remove the random selection from `selectContentForModule()` and instead use deterministic selection (highest scored candidate). The variety comes from different daily inputs (check-in outcome, time of day, favorites) rather than runtime randomness.

**Alternative approach**: Keep randomization but seed it with today's date + user ID for consistent daily results:
```typescript
const seed = hashCode(`${context.userId}-${new Date().toISOString().split('T')[0]}`);
const randomIndex = seed % topCandidates.length;
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/home/DailyRitual.tsx` | Check for stored `recommended_practice_ids` before generating new plan; add `reconstructPlanFromIds()` helper |
| `src/utils/performancePlanEngine.ts` | Replace random selection with deterministic or date-seeded selection |
| `src/data/practicesAndSoundscapes.ts` | May need helper to lookup content by ID |

---

## Implementation Details

### reconstructPlanFromIds() Helper

```typescript
function reconstructPlanFromIds(ids: string[]): ModuleRecommendation[] {
  const plan: ModuleRecommendation[] = [];
  
  for (const id of ids) {
    // Handle coach cards
    if (id === 'coach-prepare') {
      plan.push({
        type: 'prepare',
        required: false,
        priority: 5,
        intensity: 'moderate',
        duration: 'short',
        focus: 'clarity',
        reasoning: 'Mental rehearsal for upcoming moments',
        content: createCoachCard('prepare')
      });
      continue;
    }
    if (id === 'coach-integrate') {
      plan.push({
        type: 'integrate',
        required: true,
        priority: 6,
        intensity: 'gentle',
        duration: 'short',
        focus: 'release',
        reasoning: 'Evening reflection and wins capture',
        content: createCoachCard('integrate')
      });
      continue;
    }
    
    // Find content by ID in sanctuary library
    const content = sanctuaryContent.find(c => c.id === id);
    if (content) {
      // Determine module type based on content type
      const moduleType = content.contentType === 'soundbath' || 
                         content.tags?.some(t => t.includes('breathing')) 
                         ? 'regulate' : 'align';
      plan.push({
        type: moduleType,
        required: true,
        priority: 6,
        intensity: 'moderate',
        duration: 'short',
        focus: 'grounding',
        reasoning: 'Recommended for your current state',
        content
      });
    }
  }
  
  return plan;
}
```

### Invalidation Logic

```typescript
// Check if we should regenerate plan
const shouldRegenerate = () => {
  // No stored plan
  if (!todayRitual?.recommended_practice_ids?.length) return true;
  
  // Get latest check-in time
  const checkInTimestamp = await getLatestCheckInTimestamp();
  const ritualTimestamp = todayRitual.created_at;
  
  // Check-in is newer than stored plan
  if (checkInTimestamp && ritualTimestamp && 
      new Date(checkInTimestamp) > new Date(ritualTimestamp)) {
    console.log('🔄 Check-in updated - regenerating plan');
    return true;
  }
  
  return false;
};
```

---

## Expected Outcomes

1. **Stable Plan**: Performance Plan remains consistent on page refresh until user does new check-in
2. **Predictable Experience**: Users see the same recommendations throughout the day (unless context changes)
3. **Fresh Content on Check-in**: New check-in triggers fresh recommendations appropriate to new state
4. **Visual Separation**: Executive Home videos remain exclusive - no changes needed

---

## Technical Notes

### Why This Matters
- Users were confused seeing different practices on every refresh
- The randomization was intended for variety but creates poor UX
- Storing recommendations in the database provides consistency and auditability

### Database Schema Already Supports This
The `daily_ritual_completions` table has:
- `recommended_practice_ids` (text array) - stores the day's recommended content IDs
- `recommended_practices_count` (integer) - stores expected count

These fields are already being used for completion tracking but not for plan reconstruction.
