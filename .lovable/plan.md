

# Plan: HRV x Calendar Correlation in JIT Scoring + Phase 2 Recovery Day Stubs

## Summary

Two changes:
1. **Phase 1 (Active)**: Add HRV event-type correlation to JIT scoring in `generate-mastery-plan`, enriching `contextDescription` and boosting scores for events that historically spike the user's HRV. Surface this in JitCarousel UI via a small HRV badge.
2. **Phase 2 (Feature-flagged OFF)**: Write wearable recovery day trigger logic in all 3 edge functions (`compute-inner-readiness`, `compute-outer-readiness`, `generate-mastery-plan`) behind `ENABLE_WEARABLE_RECOVERY_TRIGGER = false`.

## Phase 1: HRV x Calendar Correlation

### Edge Function: `supabase/functions/generate-mastery-plan/index.ts`

**Add 3 new functions (~100 lines total):**

1. **`extractEventType(title: string): string`** — keyword-based classification (board, investor, 1:1, all-hands, client, pitch, team, standup, etc.) returning a canonical type string.

2. **`getHRVEventCorrelations(userId, supabaseClient): Promise<HRVCorrelationMap | null>`**
   - Query `wearable_data` (last 30 days) for `summary_date, hrv`
   - Query `calendar_events` (last 30 days) for `start_time, title`
   - Calculate 30-day baseline HRV mean
   - Group events by `extractEventType`, compute avg HRV deviation per type
   - Return `null` if <7 days of HRV data
   - Only include types with 2+ occurrences

3. **Update `scoreCalendarEvents(events, skippedTypes)`** → add `hrvCorrelations` parameter:
   - After existing scoring, if correlation exists for event type:
     - `avgDeviation > 20%` → `score += 25`, contextDescription = "Your HRV typically elevates X%..."
     - `avgDeviation > 15%` → `score += 20`
     - `avgDeviation > 10%` → `score += 12`
     - `avgDeviation < -10%` → `score -= 5` (low-demand event)
   - Add `hrvCorrelation` field to `ScoredEvent` interface: `{ eventType, avgDeviation, historicalCount }`
   - Append HRV context to `contextDescription` (before the existing "Prepare with targeted practice." suffix)

**Wire into main handler (~5 lines changed):**
- After calendar events fetch (~line 1157): call `getHRVEventCorrelations(req.userId, supabaseClient)`
- Pass result to `scoreCalendarEvents` call at line 1385
- Include `hrvCorrelation` in preEventPlan response object

**Update response types:**
- `ScoredEvent` gets optional `hrvCorrelation` field
- `preEventPlan` response includes `hrvCorrelation` on the event object

### Client: `src/components/home/JitCarousel.tsx`

**Minimal UI addition (~15 lines):**
- Add `hrvCorrelation` to `PreEventPlan` interface
- Below contextDescription (line 216-218), add a small HRV badge when `preEventPlan.hrvCorrelation` exists and `|avgDeviation| > 10`:

```text
┌─────────────────────────────────────────┐
│ Board Meeting Q1 Review    In 2 hrs     │
│                                         │
│ ⚡ HRV +18% · 4 past board meetings    │  ← new badge
│                                         │
│ Upcoming pre board meeting detected...  │
└─────────────────────────────────────────┘
```

- Badge styling: amber bg for elevated (>0), green bg for stable (<0), using existing Tailwind classes
- No new CSS files, no structural changes

### Client: `src/components/home/DailyRitual.tsx`

- Add `hrvCorrelation` to `PreEventPlan` interface (pass-through only, no rendering changes here)

## Phase 2: Wearable Recovery Day (Feature-Flagged OFF)

### `supabase/functions/compute-outer-readiness/index.ts`

**Replace the P-1 stub (~40 lines):**
- Add `checkWearableRecoveryTrigger(userId, supabaseClient)` function:
  - Query `wearable_data` last 7 days
  - Check for 2+ consecutive days with HRV <-20% below mean, OR single day <-30%
  - Return `{ triggered, reason, hrvDeviation, consecutiveDays }` or `null`
- Inside the existing `if (ENABLE_WEARABLE_RECOVERY_TRIGGER)` block: call the function and return Recovery Day theme/leanOn/watchFor if triggered
- Flag stays `false` — no behavior change

### `supabase/functions/compute-inner-readiness/index.ts`

**Add sustained deficit warning to Layer 3 (~20 lines):**
- Add `ENABLE_SUSTAINED_DEFICIT_WARNING = false` flag
- Inside `getLayer3Text`, when flag is true and `recentHRVSamples` available, check for consecutive suppressed days
- Append warning text: "This is the Nth consecutive day your HRV has been suppressed..."
- Flag stays `false` — no behavior change

### `supabase/functions/generate-mastery-plan/index.ts`

**Add recovery day override (~25 lines):**
- Add `ENABLE_WEARABLE_RECOVERY_TRIGGER = false` flag
- Before scenario selection in `generateMasteryPlan`, when flag is true: call same `checkWearableRecoveryTrigger` pattern
- If triggered: force recovery_day scenario, override JIT prep with warning messages, return recovery-only practices
- Flag stays `false` — no behavior change

## Deployment

All 3 edge functions redeployed. No DB migrations needed — `wearable_data` and `calendar_events` tables already exist.

## Files Changed

| File | Change |
|---|---|
| `supabase/functions/generate-mastery-plan/index.ts` | HRV correlation functions + Phase 2 stub |
| `supabase/functions/compute-outer-readiness/index.ts` | Phase 2 recovery trigger (flagged off) |
| `supabase/functions/compute-inner-readiness/index.ts` | Phase 2 sustained deficit warning (flagged off) |
| `src/components/home/JitCarousel.tsx` | HRV badge in event header |
| `src/components/home/DailyRitual.tsx` | Interface update for hrvCorrelation passthrough |

