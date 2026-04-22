-- Allow multiple check-ins per time window so each assessment appears in Recent
ALTER TABLE public.daily_checkins
  DROP CONSTRAINT IF EXISTS daily_checkins_user_id_checkin_date_time_window_key;

-- Helpful index for "latest in window" lookups now that duplicates are allowed
CREATE INDEX IF NOT EXISTS idx_daily_checkins_user_date_window_ts
  ON public.daily_checkins (user_id, checkin_date, time_window, timestamp DESC);