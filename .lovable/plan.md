

## Plan: Evening Context Enrichment + Wearable Heart-Level Intelligence

### Single file: `supabase/functions/compute-outer-readiness/index.ts`

---

### 1. Fetch Wearable Data (new parallel query)

Add to the existing `Promise.all` block (line ~1009) a query for the latest `wearable_data` row:

```sql
wearable_data WHERE user_id = userId ORDER BY recorded_date DESC LIMIT 1
```

Extract: `hrv`, `resting_heart_rate`, `heart_rate` (peak HR), `sleep_score`, `sleep_duration`. Also fetch today's `energy_snapshots` for `hrv_delta_pct` if available.

Create a `WearableContext` type:
```
{ hrv, rhr, peakHR, sleepScore, sleepDuration, hrvDeltaPct }
```

---

### 2. Expand Tomorrow Fetch to All Evenings (≥18:00)

Change `needTomorrow` logic from:
```
lateEvening || sundayEvening
```
to:
```
hour >= 18 || lateEvening
```

This ensures any evening user (6pm+) gets tomorrow's calendar context.

---

### 3. Return High-Stakes Event Titles from Calendar Query

Modify `getServerCalendarMetrics()` to also select `title` and return a new field:
```
highStakesEvents: string[]  // titles of events with pressure > threshold
```

High-stakes = non-recurring + (attendees > 5 OR organizer + attendees > 2 OR duration > 60min). Return up to 2 titles.

Update `CalendarMetricsResult` interface to include `highStakesEvents: string[]`.

---

### 4. Enrich `getTheme()` Evening Entries

Add parameters: `tomorrowHighStakes: string[]`, `wearable: WearableContext | null`.

For **weekday evenings** (currently generic "Close before tomorrow"):
- If tomorrow has high-stakes events: reference the event name and orient toward restoration
  - e.g. phrase: "Ground before tomorrow." context: "You have [Event Title] tomorrow — tonight is about arriving restored, not prepared."
- If wearable shows elevated HR/low HRV: lead with body signal
  - e.g. "Your heart rate spiked through a demanding day — what you release tonight determines how sharp you are for [event] tomorrow."
- If tomorrow is light + wearable is fine: keep current soft close language

For **Sunday evenings**: keep planning orientation but also reference Monday's specific high-stakes event titles if present.

---

### 5. Enrich `getEveningInsights()` (Lean On / Watch For)

Expand signature to receive: `tomorrowLoad`, `tomorrowPressure`, `tomorrowHighStakes: string[]`, `wearable: WearableContext | null`.

Integrate:
- **Wearable in leanOn**: "Your body carried a heavy day — elevated heart rate through back-to-back stakes. The cool-down tonight is physical, not just mental."
- **Tomorrow high-stakes in watchFor**: "Preparing for [Event] tonight when what you actually need is restoration. You'll be sharper arriving rested than over-rehearsed."
- Keep soft, permission-to-stop tone as Priority 1 unless a high-stakes event tomorrow requires explicit acknowledgment.

---

### 6. Update `getLeanOnWatchFor()` Cascade

Pass wearable context through to `getEveningInsights()` call at P0b (line ~799). Currently it calls:
```ts
getEveningInsights(tier, calendarLoad, calendarPressure)
```
Change to:
```ts
getEveningInsights(tier, calendarLoad, calendarPressure, tomorrowLoad, tomorrowPressure, tomorrowHighStakes, wearableContext)
```

Same for `getSundayEveningInsights()` — add wearable context.

---

### 7. Add Wearable to `dataSources`

Update `buildDataSources()`: if wearable data was present and used, add `'wearable'` to the sources array. This shows users the system is reading their physiological data.

---

### 8. Tone Rules

- **Weekday evenings**: Soft, cool-down, "permission to stop" — unless high-stakes tomorrow, then acknowledge + orient toward restoration
- **Weekend evenings**: Soft, recovery-focused
- **Sunday evenings**: Planning-oriented (unchanged) but enriched with Monday event titles + wearable state
- **Banned words in evening copy**: wellness, mindfulness, relax, well done (preserved from nudge spec)

---

### Summary of What Changes

| Area | Current | After |
|------|---------|-------|
| Wearable data | Not fetched | Fetched + used in evening themes, leanOn/watchFor |
| Tomorrow fetch | Only ≥21:00 or Sunday ≥18:00 | Any evening ≥18:00 |
| Tomorrow events | Load/pressure levels only | Includes high-stakes event titles |
| Weekday evening themes | Generic "Close before tomorrow" | References tomorrow's specific events + body state |
| Evening leanOn/watchFor | Today-only context | Includes tomorrow forward-look + wearable signals |
| Data sources label | No wearable | Shows "wearable" when data present |

