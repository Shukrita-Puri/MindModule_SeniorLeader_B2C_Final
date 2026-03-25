

# Smart Nudges Enhancement — Weekend Logic, Diversity, Learning & Daily Cap

## Current Gaps (confirmed from code)

| Gap | Evidence |
|-----|----------|
| **No daily cap** | No `todayLogs.length` guard anywhere — theoretically 6+ notifications/day |
| **No weekend awareness** | Zero `dayOfWeek` checks in morning/evening/afternoon logic — identical to weekdays |
| **No Friday evening close** | Same EC/ECI variants used Friday as any other day |
| **No Sunday evening prep** | No "prepare for Monday" variant exists |
| **No type diversity guarantee** | System only rotates *variants within a type*, never ensures variety *across types* |
| **No engagement learning** | `tapped`, `dismissed`, `time_to_engagement_seconds` columns recorded but never queried back |
| **Static priority all day** | Pre-Event > Pattern > Morning > Afternoon > Evening > State-Aware > Fallback regardless of time |
| **No quiet days defaults** | `quiet_days[]` supported in schema but defaults to null |
| **Weekend morning windows identical** | 6:00–8:30 AM on Saturday/Sunday — too early for weekends |

## Plan

### File 1: `supabase/functions/smart-nudges/index.ts`

#### Change 1: Daily Global Cap (max 4/day)
After fetching `todayLogs` (line ~390), add:
```
if (todayLogs && todayLogs.length >= 4) continue;
```

#### Change 2: Weekend Morning Variants + Shifted Windows
Add `getWeekendMorningVariants()` function returning:
- `MA-W1`: "No calendar pressure today. Check in when you're ready."
- `MA-W2`: "Weekend morning. A slower check-in for a different pace."

In morning anchor block (~line 705), check `dayOfWeek === 0 || dayOfWeek === 6`:
- Shift window to 7:30–10:00 (Sat) / 8:00–10:30 (Sun)
- Use weekend variants when calendar pressure is low

#### Change 3: Weekend Evening Variants (Fri/Sat/Sun)
Add three new variant sets:
- **Friday evening** (`dayOfWeek === 5`):
  - `EC-F1`: "Week complete. What are you carrying into the weekend?"
  - `EC-F2`: "Five days behind you. Close the week before you unplug."
- **Saturday evening** (`dayOfWeek === 6`):
  - `EC-W1`: "No agenda tonight. Just notice how you're landing."
- **Sunday evening** (`dayOfWeek === 0`):
  - `EC-S1`: "Monday is mapped. Set your intention before the week begins."
  - `EC-S2`: "Sunday close. What do you want to carry into the new week?"

In evening close block (~line 794), check `dayOfWeek` and select weekend-specific variants before falling through to standard logic.

#### Change 4: Skip Afternoon Check-In on Weekends
In afternoon check-in block (~line 761), add:
```
if (dayOfWeek === 0 || dayOfWeek === 6) { /* skip */ }
```
Weekends don't have structured afternoon work — remove this nudge on Sat/Sun.

#### Change 5: Type Diversity Guarantee (3-day lookback)
After fetching `todayLogs`, fetch last-3-day logs grouped by `notification_type`:
```sql
notification_log WHERE user_id = X AND sent_at >= 3_days_ago
  GROUP BY notification_type → frequency map
```
Build `typeFrequency` map. When multiple types qualify in the same evaluation, prefer the **least-recently-sent type** — unless Pre-Event (P1) which always wins due to time-sensitivity.

Add a `diversityBoost` flag: if a type hasn't been sent in 3+ days and qualifies, it gets priority over types sent daily.

#### Change 6: Engagement-Based Learning (14-day feedback loop)
Add `getUserEngagementProfile()` function:
```typescript
async function getUserEngagementProfile(supabase, userId): Promise<{
  typeEffectiveness: Record<string, { sent: number; tapped: number; rate: number }>;
  suppressedTypes: string[];  // types with 0 taps in 5+ sends
}> {
  // Query notification_log last 14 days with tapped/dismissed columns
  // Calculate per-type tap rate
  // Return types to suppress (sent 5+ times, 0 taps)
}
```

Usage in evaluation loop:
- If a type is in `suppressedTypes`, skip every other qualifying occasion (50% reduction, not full suppression)
- Log suppression reason in payload for debugging

#### Change 7: Time-of-Day Priority Shifting
Replace static priority array (line 1010) with time-aware function:
```
Morning (6-11):   Morning > Pre-Event > Pattern > others
Midday (11-15):   Pre-Event > State-Aware > Afternoon > Pattern > others
Evening (18-22):  Evening > Pattern > Pre-Event > others
Other:            Pre-Event > Pattern > Fallback > others
```
Pre-Event always wins within its 30-90 min trigger window regardless.

### File 2: `docs/SMART_NUDGES_TECHNICAL_DOCUMENTATION.md`
Full rewrite incorporating all existing documentation plus new sections:
- **Daily Global Cap** (max 4/day)
- **Weekend Rules** (Fri evening, Sat/Sun morning + evening, no afternoon on weekends)
- **Type Diversity Guarantee** (3-day lookback, least-recently-sent preference)
- **Engagement-Based Learning** (14-day feedback loop, per-type tap rates, suppression of ineffective types)
- **Time-of-Day Priority Shifting** (dynamic priority based on current time window)
- **Quiet Days** (schema support, no defaults, user-configurable)
- Updated changelog

### No DB Changes Required
All data already exists in `notification_log` (`tapped`, `dismissed`, `time_to_engagement_seconds`) and `notification_preferences` (`quiet_days[]`).

