

## Plan: actually allow repeated Daily Check-Ins (root-cause fix)

### Root cause (audit findings)

End-to-end audit of the save path uncovered four real blockers, not one:

1. **Stale unique index in the live database.**
   The earlier "fix" migration ran `DROP CONSTRAINT IF EXISTS daily_checkins_user_date_window` — but `daily_checkins_user_date_window` was created as a **UNIQUE INDEX**, not a constraint. The DROP silently no-ops. Production still has:
   ```
   CREATE UNIQUE INDEX daily_checkins_user_date_window
     ON public.daily_checkins (user_id, checkin_date, time_window)
   ```
   Every second check-in in the same window throws Postgres error 23505 → edge function returns 500 → client sees a silent failure. **This is the primary block.**

2. **Legacy `upsert` path still in the codebase.**
   `supabase/functions/user-events/index.ts` still implements `SAVE_CHECKIN` with `.upsert(..., { onConflict: 'user_id,checkin_date' })`. It's exposed via `useMentalFitnessTracking.saveCheckIn`. Even though the live Daily Check-In page (`DailyCheckIn.tsx`) no longer calls it, it's a loaded gun — any future call collapses entries and re-asserts one-per-day semantics.

3. **Update endpoints fan out across duplicates.**
   `UPDATE_CLARITY_CONFIDENCE` and `UPDATE_ENERGY_BALANCE` in `daily-checkins/index.ts` filter by `(user_id, checkin_date, time_window)` only. Once duplicates exist, both endpoints update **every** matching row (and `.maybeSingle()` throws when >1 row is returned). Sliders/energy writes silently misfire.

4. **`GET_CHECKIN_FOR_WINDOW` will error on duplicates.**
   It uses `.maybeSingle()` which throws `PGRST116` when more than one row matches. Becomes broken the moment duplicates exist.

### What will be changed

#### 1) Migration: actually drop the unique index + keep duplicate-friendly indexes

New migration:
```sql
-- Drop the stale unique INDEX (previous migration tried DROP CONSTRAINT, which no-ops)
DROP INDEX IF EXISTS public.daily_checkins_user_date_window;

-- Safety: also drop the constraint name in case it exists in any environment
ALTER TABLE public.daily_checkins
  DROP CONSTRAINT IF EXISTS daily_checkins_user_id_checkin_date_time_window_key;

-- Keep the non-unique lookup index (already present)
-- idx_daily_checkins_user_date_window_ts already exists — used for "latest per window"
```
This is the only structural fix needed. Reads continue to use the existing non-unique indexes.

#### 2) Edge function `daily-checkins/index.ts` — make updates target the **latest** row

- `UPDATE_CLARITY_CONFIDENCE`: select the latest matching row id (`order timestamp desc limit 1`), then `.update(...).eq('id', latestId)`. Falls back gracefully if none exist.
- `UPDATE_ENERGY_BALANCE`: same pattern — resolve the latest row id for `(user_id, checkin_date, time_window)` (or for the date when window is missing), then update by `id`.
- `GET_CHECKIN_FOR_WINDOW`: replace `.maybeSingle()` with `.order('timestamp', { ascending: false }).limit(1).maybeSingle()` — returns the latest in-window check-in safely even with duplicates.
- `GET_TODAY_CHECKIN` / `GET_MOST_RECENT_CHECKIN_TODAY`: already correct (latest-wins).
- `SAVE_CHECKIN`: stays as a plain `INSERT`. No change needed.

#### 3) Retire the legacy upsert path

- Remove the `SAVE_CHECKIN` case from `supabase/functions/user-events/index.ts` (or replace its body with a 410 "Gone — use daily-checkins SAVE_CHECKIN" response to surface any stragglers).
- Remove `saveCheckIn` from `src/hooks/useMentalFitnessTracking.ts` and its `DailyCheckIn` interface. No active caller exists; the only importer (`SoundscapePlayer`) does not call it.

#### 4) No frontend visual changes

- `src/pages/DailyCheckIn.tsx`, `src/pages/CheckInDetail.tsx`, all home/insights surfaces — untouched.
- `src/utils/dailyCheckins.ts` — unchanged; it already does plain `.insert()` in DEV and routes to the canonical edge function in prod.

### What stays the same

- Daily Check-In UI, slider design, layout, copy, CTAs.
- "Latest check-in wins" remains the read rule on home/plan/insights surfaces (already implemented via `order timestamp desc limit 1`).
- Pattern learning trigger, downstream analytics, energy state engine — untouched.
- RLS policies — already correct (insert allowed `WITH CHECK auth.uid() = user_id`); no change.

### Files touched

- `supabase/migrations/<new>_drop_daily_checkins_unique_index.sql` (new)
- `supabase/functions/daily-checkins/index.ts` (update three handlers)
- `supabase/functions/user-events/index.ts` (remove `SAVE_CHECKIN` case)
- `src/hooks/useMentalFitnessTracking.ts` (remove `saveCheckIn` + `DailyCheckIn` type)

### Verification after implementation

**Schema**
- Confirm `daily_checkins_user_date_window` is gone from `pg_indexes`.
- Confirm no unique constraint on `(user_id, checkin_date, time_window)` in `pg_constraint`.

**Writes**
- First check-in today (morning) → row inserted.
- Second check-in today (morning) → second row inserted, no 23505.
- Third check-in today (afternoon) → third row inserted.
- DEV-mode insert path verified the same way.

**Reads**
- `GET_TODAY_CHECKIN` / `GET_MOST_RECENT_CHECKIN_TODAY` return the most recent of the three.
- `GET_CHECKIN_FOR_WINDOW(today, 'morning')` returns the latest morning row (no PGRST116).
- `GET_ALL_CHECKINS_TODAY` returns all three ordered by timestamp.
- Home dashboard, energy state, plan generation, insights — still display latest state.

**Updates**
- `UPDATE_CLARITY_CONFIDENCE` after submitting two morning check-ins updates only the **latest** morning row's clarity/confidence/mental_sharpness — first row stays untouched.
- `UPDATE_ENERGY_BALANCE` (called by energyStateEngine) writes to the latest row only.

### Residual risks / honest call-outs

- The legacy `useMentalFitnessTracking.saveCheckIn` removal is safe based on a full project search showing zero callers, but if any unindexed runtime path exists it would now throw a TypeScript error at build — surfaced loudly, not silently.
- Historical rows previously merged via the old upsert remain merged; this fix is forward-only. No data backfill is attempted (and shouldn't be — there's no signal to reconstruct).
- "Latest check-in wins" for plan/state generation is intentionally preserved. If product later wants average-of-window or first-of-window semantics, that's a separate change in the read paths only.
- Pattern-learning function (`learn-checkin-patterns`) already aggregates via grouping/mode — duplicates in the same window are handled gracefully.

