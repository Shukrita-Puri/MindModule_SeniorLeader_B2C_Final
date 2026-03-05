

## Daily Check-In 3-Window System — Implementation Plan

### Current State Assessment

**What exists:**
- `daily_checkins` table with single check-in per day (unique on `user_id, checkin_date`)
- `daily-checkins` EF with 6 actions (GET_CHECKINS, GET_TODAY_CHECKIN, SAVE_CHECKIN, GET_CHECKIN_RANGE, UPDATE_CLARITY_CONFIDENCE, UPDATE_ENERGY_BALANCE)
- Client-side `src/utils/dailyCheckins.ts` with DEV_MODE direct DB access + EF calls
- `DailyCheckIn.tsx` page — saves outcome, navigates to `/check-in-detail`
- `CheckInDetail.tsx` page — saves clarity + confidence
- `compute-inner-readiness` EF — pure scoring function (no DB reads, receives data as body)
- `state-patterns-insights` EF — friction frequency counts per check-in, not per day
- `smart-nudges` EF — no check-in reminder logic
- `generate-mastery-plan` EF — no completion tracking

**What's missing (all from spec):**
1. `time_window` column on `daily_checkins`
2. `inferred_states` table
3. `evening_checkins` table
4. `checkin_patterns` table
5. `mastery_plan_completions` table
6. New EF: `infer-current-state`
7. New EF: `learn-checkin-patterns`
8. 4 new actions in `daily-checkins` EF (GET_MOST_RECENT_CHECKIN_TODAY, GET_CHECKIN_FOR_WINDOW, GET_ALL_CHECKINS_TODAY, INFER_CURRENT_STATE)
9. Client `getCurrentTimeWindow()` utility
10. Client localStorage stores sensitive check-in data (needs removal)

**Security issue found:** `DailyCheckIn.tsx` line 134 stores check-in data in `localStorage`. This must be removed — all state should flow through the EF.

---

### Implementation Plan

#### Phase 1: Database Migration

Create all new tables and modify `daily_checkins`:

1. Add `time_window` column to `daily_checkins` (text, CHECK constraint for 'morning'|'afternoon'|'evening')
2. Backfill existing rows with `time_window = 'morning'`
3. Drop old unique constraint `daily_checkins_user_date_unique`, create new unique index on `(user_id, checkin_date, time_window)`
4. Make `time_window` NOT NULL after backfill
5. Create `inferred_states` table with RLS (service_role only)
6. Create `evening_checkins` table with RLS (service_role only)
7. Create `checkin_patterns` table with RLS (service_role only) — add unique constraint on `(user_id, day_of_week, time_window)` for upsert
8. Create `mastery_plan_completions` table with RLS (service_role only)
9. Add all indexes from spec

#### Phase 2: Update `daily-checkins` Edge Function

Update `supabase/functions/daily-checkins/index.ts`:

- Expand `RequestBody` interface with `timeWindow` and new action types
- Add 4 new case handlers: `GET_MOST_RECENT_CHECKIN_TODAY`, `GET_CHECKIN_FOR_WINDOW`, `GET_ALL_CHECKINS_TODAY`, `INFER_CURRENT_STATE`
- Update `SAVE_CHECKIN` to include `time_window` in upsert (with `onConflict: 'user_id,checkin_date,time_window'`)
- Update `UPDATE_CLARITY_CONFIDENCE` and `UPDATE_ENERGY_BALANCE` to also filter by `time_window` (most recent if not specified)
- `GET_TODAY_CHECKIN` returns most recent today (order by timestamp desc, limit 1) for backward compatibility
- `INFER_CURRENT_STATE` delegates to the new `infer-current-state` EF via internal call

#### Phase 3: Create `infer-current-state` Edge Function

New file: `supabase/functions/infer-current-state/index.ts`

All inference logic server-side:
- Time decay inference (fallback)
- Pattern matching inference (uses `checkin_patterns`)
- AI prediction (uses `google/gemini-2.5-flash-lite` via Lovable AI gateway)
- Hybrid inference (pattern + live signals)
- Stores every inference in `inferred_states` for audit trail
- Reads: `daily_checkins`, `checkin_patterns`, `wearable_data` (if exists), `sanctuary_events`
- Writes: `inferred_states`

Register in `supabase/config.toml`.

#### Phase 4: Create `learn-checkin-patterns` Edge Function

New file: `supabase/functions/learn-checkin-patterns/index.ts`

Pattern learning logic server-side:
- Reads last 60 days of check-ins
- Groups by day-of-week + time-window
- Calculates typical outcome, tier, confidence
- Upserts into `checkin_patterns`
- Triggered after each check-in save (fire-and-forget from `daily-checkins` EF)

Register in `supabase/config.toml`.

#### Phase 5: Update Client-Side Code

**`src/utils/dailyCheckins.ts`:**
- Add `getCurrentTimeWindow()` utility (simple hour-based detection — not sensitive logic)
- Add `time_window` to `CheckinData` interface
- Update `saveCheckin()` to include `time_window: getCurrentTimeWindow()`
- Add `canCheckInNow()` function (calls EF to check if window already has check-in)
- Add `getMostRecentCheckinToday()` function
- Add `getCheckinForWindow()` function
- Update `getTodayCheckin()` to use `GET_MOST_RECENT_CHECKIN_TODAY` action
- DEV_MODE paths updated to include `time_window`

**`src/pages/DailyCheckIn.tsx`:**
- Remove `localStorage.setItem('dailyCheckIn', ...)` (security fix — no sensitive data client-side)
- Pass `time_window` when saving via `saveCheckin()`
- Keep localStorage skip tracking (non-sensitive)

**`src/pages/CheckInDetail.tsx`:**
- Pass `timeWindow` from location state to EF call so UPDATE_CLARITY_CONFIDENCE targets correct window row

#### Phase 6: Update Downstream Consumers

**`supabase/functions/state-patterns-insights/index.ts`:**
- Update friction frequency to count DAYS with at least one low-state check-in (not total low-state check-ins)
- Currently: `lowStates.length / totalCheckins`
- Should be: `Set(lowStateDates).size / Set(allDates).size`

**No changes needed for:**
- `compute-inner-readiness` — pure scoring function, receives data as body, no DB reads. Callers are responsible for passing the correct check-in data (most recent for current window).
- `generate-mastery-plan` — receives data as request body. `mastery_plan_completions` tracking is a future enhancement (not blocking current flow).
- `smart-nudges` — check-in reminder logic is a future enhancement (notification copy + shouldSendCheckinReminder).

---

### Files Changed

| File | Change |
|------|--------|
| **DB Migration** | Add `time_window` to `daily_checkins`, create 4 new tables, update constraints and indexes |
| `supabase/functions/daily-checkins/index.ts` | Add 4 new actions, update SAVE_CHECKIN with time_window, trigger pattern learning |
| `supabase/functions/infer-current-state/index.ts` | **New** — Full inference engine (time decay, pattern, AI, hybrid) |
| `supabase/functions/learn-checkin-patterns/index.ts` | **New** — Pattern learning from historical check-ins |
| `supabase/config.toml` | Register 2 new EFs |
| `src/utils/dailyCheckins.ts` | Add getCurrentTimeWindow, time_window to interface, new query functions |
| `src/pages/DailyCheckIn.tsx` | Remove localStorage sensitive data storage, pass time_window |
| `src/pages/CheckInDetail.tsx` | Pass timeWindow to UPDATE_CLARITY_CONFIDENCE |
| `supabase/functions/state-patterns-insights/index.ts` | Fix friction frequency to count per-day not per-check-in |

