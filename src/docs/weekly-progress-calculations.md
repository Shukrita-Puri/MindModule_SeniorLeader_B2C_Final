# Weekly Progress Calculations - Documentation

## Overview

This document describes how weekly progress metrics are calculated and displayed on the Executive Home dashboard. These metrics provide users with insights into their consistency, energy patterns, and engagement with sanctuary content.

---

## 1. Weekly Ritual Streak

### Definition
Tracks consecutive days (Monday-Sunday) where the user completed their daily ritual (all 3 components: soundscape, guided practice, and micro-practice).

### Calculation Logic

**Data Source**: `daily_ritual_completions` table

```sql
SELECT 
  ritual_date,
  completion_status
FROM daily_ritual_completions
WHERE user_id = $1
  AND ritual_date >= $2  -- Start of current week (Monday)
  AND ritual_date <= $3  -- End of current week (Sunday)
ORDER BY ritual_date ASC
```

**Streak Counting**:
```typescript
let streak = 0;
const completions = results.map(row => row.completion_status === 'complete');

// Count consecutive days from Monday
for (const completed of completions) {
  if (completed) {
    streak++;
  } else {
    break; // Streak breaks on first incomplete day
  }
}
```

### Display
- **Format**: "X days this week" or "Perfect week! 7/7 days"
- **Color Coding**:
  - 0-2 days: Red (needs attention)
  - 3-4 days: Yellow (improving)
  - 5-6 days: Green (strong)
  - 7 days: Gold (exceptional)

### Example
If user completed rituals on Mon, Tue, Wed, Fri:
- Streak = **3 days** (breaks on Thursday)
- Display: "3 days this week"

---

## 2. Weekly Energy Balance (Average)

### Definition
Average of daily energy balance scores across the week (0-100 scale).

### Calculation Logic

**Data Source**: `energy_snapshots` table

```sql
SELECT 
  snapshot_date,
  energy_balance
FROM energy_snapshots
WHERE user_id = $1
  AND snapshot_date >= $2  -- Start of week
  AND snapshot_date <= $3  -- End of week
```

**Average Calculation**:
```typescript
const balances = results.map(row => row.energy_balance).filter(b => b !== null);
const average = balances.length > 0 
  ? Math.round(balances.reduce((sum, b) => sum + b, 0) / balances.length)
  : null;
```

### Energy Tier Mapping
- **0-40**: Depleted
- **41-60**: Managing
- **61-75**: Strong
- **76-100**: Peak

### Display
- **Format**: "72% (Strong)" or "45% (Managing)"
- **Trend Indicator**: 
  - ↗ if average increased from last week
  - ↘ if average decreased from last week
  - → if stable (±3 points)

### Example
Daily balances: Mon=65, Tue=72, Wed=68, Thu=70, Fri=75
- Average = **70%**
- Tier = **Strong**
- Display: "70% (Strong) ↗"

---

## 3. Sessions This Week

### Definition
Total number of completed practice sessions (soundscapes, guided practices, micro-practices) during the current week.

### Calculation Logic

**Data Source**: `practice_sessions` table

```sql
SELECT COUNT(*) as session_count
FROM practice_sessions
WHERE user_id = $1
  AND completed = true
  AND started_at >= $2  -- Start of week
  AND started_at <= $3  -- End of week
```

### Display
- **Format**: "12 sessions" or "No sessions yet"
- **Breakdown** (optional hover):
  - Soundscapes: X
  - Guided Practices: Y
  - Micro-Practices: Z

### Category Breakdown Query
```sql
SELECT 
  category,
  COUNT(*) as count
FROM practice_sessions
WHERE user_id = $1
  AND completed = true
  AND started_at >= $2
  AND started_at <= $3
GROUP BY category
```

---

## 4. Best Time (Peak Engagement)

### Definition
Time of day when user most frequently completes practice sessions, based on historical patterns.

### Calculation Logic

**Data Source**: `practice_sessions` table

```sql
SELECT 
  EXTRACT(HOUR FROM started_at) as hour,
  COUNT(*) as session_count
FROM practice_sessions
WHERE user_id = $1
  AND completed = true
  AND started_at >= $2  -- Last 30 days for pattern analysis
GROUP BY hour
ORDER BY session_count DESC
LIMIT 1
```

**Time Period Mapping**:
```typescript
const hour = resultHour;
if (hour >= 5 && hour < 12) return 'Morning';
if (hour >= 12 && hour < 18) return 'Afternoon';
if (hour >= 18 && hour < 22) return 'Evening';
return 'Night';
```

### Display
- **Format**: "Morning (7-11am)" or "Afternoon (12-5pm)"
- **Context**: "Your peak focus window"

### Example
If user completed sessions at:
- 7am (3x), 9am (5x), 2pm (2x), 8pm (1x)
- Most frequent = **9am (5 sessions)**
- Display: "Morning (7-11am)"

---

## 5. Top Restorer (Most Effective Content)

### Definition
The content category (Pause/Flow/Renewal) that received the highest effectiveness ratings from the user.

### Calculation Logic

**Data Source**: `practice_sessions` table with `effectiveness_rating`

```sql
SELECT 
  category,
  AVG(effectiveness_rating) as avg_rating,
  COUNT(*) as session_count
FROM practice_sessions
WHERE user_id = $1
  AND completed = true
  AND effectiveness_rating IS NOT NULL
  AND started_at >= $2  -- Last 30 days
GROUP BY category
HAVING COUNT(*) >= 3  -- Minimum 3 sessions for reliability
ORDER BY avg_rating DESC
LIMIT 1
```

### Category Mapping
- `pause` → "Pause Mastery"
- `power-up` → "Flow Mastery"
- `presence` → "Renewal Mastery"

### Display
- **Format**: "Pause Mastery (4.5★)" or "Flow Mastery (4.8★)"
- **Context**: "Your most effective practice type"
- **Minimum**: Requires at least 3 rated sessions in that category

### Example
Ratings by category:
- Pause: 4.5★ (5 sessions)
- Flow: 4.2★ (7 sessions)
- Renewal: 4.8★ (2 sessions - excluded, <3 minimum)
- Top Restorer = **Pause Mastery (4.5★)**

---

## 6. Weekly Insights Snapshot

### Combined Display Layout

```
┌─────────────────────────────────────────────────┐
│  Your Progress This Week                        │
├─────────────────────────────────────────────────┤
│                                                  │
│  ✓ Ritual Streak     │  ◉ Energy Balance       │
│    5 days            │    72% (Strong) ↗       │
│                                                  │
│  ♫ Sessions          │  ⏰ Best Time           │
│    12 sessions       │    Morning (7-11am)     │
│                                                  │
│  ★ Top Restorer                                 │
│    Pause Mastery (4.5★)                         │
│                                                  │
└─────────────────────────────────────────────────┘
```

---

## 7. Implementation Files

| File | Purpose |
|------|---------|
| `src/components/home/InsightProgressCard.tsx` | Main card component displaying all metrics |
| `src/components/home/WeeklyRitualStreak.tsx` | Ritual streak calculation and display |
| `src/utils/mentalFitnessTracking.ts` | Core logic for weekly metric calculations |
| `src/hooks/useMentalFitnessTracking.ts` | React hook for fetching weekly data |

---

## 8. Data Freshness & Caching

### Query Frequency
- **On page load**: Fetch all weekly metrics
- **Auto-refresh**: Every 5 minutes if user is active
- **Manual refresh**: Swipe down on mobile / refresh button

### Caching Strategy
```typescript
useQuery({
  queryKey: ['weekly-insights', userId, weekStart],
  queryFn: () => fetchWeeklyMetrics(userId, weekStart, weekEnd),
  staleTime: 5 * 60 * 1000, // 5 minutes
  cacheTime: 15 * 60 * 1000, // 15 minutes
});
```

---

## 9. Edge Cases & Fallbacks

### No Data Available
- **Ritual Streak**: "Start your first ritual"
- **Energy Balance**: "Complete check-in to see trends"
- **Sessions**: "No sessions yet this week"
- **Best Time**: "Build your rhythm"
- **Top Restorer**: "Complete 3+ sessions to see insights"

### Partial Week Data
- If user joined mid-week, show available days only
- Display "Incomplete week" label
- Do not penalize streak for days before sign-up

### Weekend Behavior
- Streak continues through weekends
- Some users may have lower weekend engagement (expected pattern)
- Consider adding "Weekend Warrior" badge for high weekend activity

---

## 10. Future Enhancements

1. **Trend Visualization**: Add sparkline charts for energy balance trends
2. **Comparison Mode**: "This week vs last week" toggle
3. **Personalized Goals**: Let users set custom streak targets
4. **Adaptive Recommendations**: Suggest content based on Top Restorer insights
5. **Social Features**: Anonymous leaderboards for streak lengths

---

## 11. Testing Checklist

### Ritual Streak
- [ ] Counts only completed rituals (all 3 components)
- [ ] Breaks on first missed day
- [ ] Handles week transitions (Sunday → Monday)
- [ ] Shows "Perfect week!" for 7/7 days

### Energy Balance
- [ ] Averages only non-null values
- [ ] Displays correct tier label
- [ ] Shows trend indicator accurately
- [ ] Handles weeks with partial data

### Sessions Count
- [ ] Counts only completed sessions
- [ ] Excludes skipped/abandoned sessions
- [ ] Updates in real-time after session completion

### Best Time
- [ ] Uses last 30 days for pattern analysis
- [ ] Maps hours to correct time periods
- [ ] Shows "N/A" if <3 sessions total

### Top Restorer
- [ ] Requires minimum 3 rated sessions per category
- [ ] Averages ratings correctly (0-5 scale)
- [ ] Displays category with highest average
- [ ] Shows star rating with 1 decimal

---

**Last Updated**: 2025-01-14  
**Version**: 1.0  
**Authors**: Sanctuary Intelligence Team
