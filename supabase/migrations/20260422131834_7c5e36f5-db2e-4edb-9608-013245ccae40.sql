-- Drop the stale unique INDEX (previous migration tried DROP CONSTRAINT, which no-ops)
DROP INDEX IF EXISTS public.daily_checkins_user_date_window;

-- Safety: also drop the constraint name in case it exists in any environment
ALTER TABLE public.daily_checkins
  DROP CONSTRAINT IF EXISTS daily_checkins_user_id_checkin_date_time_window_key;