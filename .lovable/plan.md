

## Fix Plan: Google Calendar Data Flow — localStorage → DB Migration

### What's Broken

`localStorage('calendarEvents')` is never written anywhere in the app, but **4 files read from it**, always getting `[]`. This breaks calendar load/pressure metrics across the energy state engine, outer readiness, mastery plan, and event tracking.

Additionally, `calendar_events` has **no user-facing RLS policy** — only a service-role restrictive policy. This means `DailyRitual.tsx` and `PostEventReflection.tsx` client-side reads are also silently returning `[]` for authenticated users.

### Storage Decision: What Goes Where

| Data | Storage | Reason |
|------|---------|--------|
| Calendar events (titles, times, attendees) | **Server (DB)** | Already there via `sync-calendar` EF. Sensitive scheduling data. |
| Calendar load/pressure metrics | **Computed client-side** from DB-fetched events | Non-sensitive derived metrics, acceptable on client |
| Wearable data (HRV, readiness) | **localStorage** (existing) | Ephemeral signal cache, acceptable per architecture standard |
| Oura data | **localStorage** (existing) | Same — ephemeral signal cache |

### Changes (4 files + 1 DB migration)

#### 1. DB Migration: Add SELECT RLS policy on `calendar_events`

```sql
CREATE POLICY "Users can view own calendar events"
ON public.calendar_events
FOR SELECT
USING (user_id = (auth.jwt() ->> 'sub'::text));
```

This unblocks all client-side reads (`DailyRitual.tsx`, `PostEventReflection.tsx`, and the new `energyStateEngine.ts` fetch).

#### 2. `src/utils/energyStateEngine.ts` — Replace localStorage with DB fetch

Replace line 159's `localStorage.getItem('calendarEvents')` with a direct Supabase query:
- Fetch upcoming events (next 4 hours) for the current `userId`
- Query: `supabase.from('calendar_events').select(...).eq('user_id', userId).gte('start_time', now).lte('start_time', fourHoursLater)`
- Falls back to `[]` if no userId or query fails
- `getCalendarMetrics()` then computes load/pressure from real data instead of empty array

This fixes the cascade to `compute-outer-readiness` and `generate-mastery-plan`.

#### 3. `src/utils/sanctuaryEventTracking.ts` — Accept `calendarEvents` as optional param

Change `getEnrichedContextData(checkInOutcome?)` to `getEnrichedContextData(checkInOutcome?, calendarEvents?)`:
- If `calendarEvents` param provided, use it
- Otherwise return empty array (no more localStorage read)
- Callers already have calendar data from their own fetches

#### 4. `src/utils/historicalPhysiologicalTracking.ts` — Accept `calendarEvents` as optional param

Same pattern: `autoRecordPhysiologyForCalendarEvents(calendarEvents?)`:
- Accept pre-fetched events instead of reading localStorage
- Callers pass events from their context

#### 5. `src/utils/intelligenceEngine.ts` — Already deprecated, remove localStorage reads

Replace the two `localStorage.getItem('calendarEvents')` calls (lines 214, 516) with empty arrays. File is deprecated and being phased out.

### Auth Path Verification

- **RLS policy** uses `auth.jwt() ->> 'sub'` which matches the Auth0 `sub` claim stored as `user_id` (TEXT) in `calendar_events`
- **energyStateEngine.ts** already receives `userId` as parameter — will use it for the DB query
- **DailyRitual.tsx** and **PostEventReflection.tsx** already query with `.eq('user_id', user.id)` — will work once RLS policy exists
- **DEV_MODE** path in energyStateEngine uses `DEV_USER.id` — will also work with the RLS policy

### Files Changed

| File | Change |
|------|--------|
| DB migration | Add `calendar_events` SELECT RLS policy |
| `src/utils/energyStateEngine.ts` | Replace localStorage calendar read with Supabase query |
| `src/utils/sanctuaryEventTracking.ts` | Accept `calendarEvents` as optional param, remove localStorage read |
| `src/utils/historicalPhysiologicalTracking.ts` | Accept `calendarEvents` as optional param, remove localStorage read |
| `src/utils/intelligenceEngine.ts` | Replace localStorage reads with empty arrays (deprecated file) |

