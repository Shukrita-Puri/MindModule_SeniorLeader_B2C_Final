
-- Dedupe historical scheduled rows (keep most recent per user/date/window).
DELETE FROM public.executive_home_card_runs a
USING public.executive_home_card_runs b
WHERE a.mode = 'scheduled'
  AND b.mode = 'scheduled'
  AND a.user_id = b.user_id
  AND a.local_date = b.local_date
  AND a."window" = b."window"
  AND (a.created_at, a.id) < (b.created_at, b.id);

CREATE UNIQUE INDEX IF NOT EXISTS executive_home_card_runs_scheduled_unique_idx
  ON public.executive_home_card_runs (user_id, local_date, "window")
  WHERE mode = 'scheduled';
