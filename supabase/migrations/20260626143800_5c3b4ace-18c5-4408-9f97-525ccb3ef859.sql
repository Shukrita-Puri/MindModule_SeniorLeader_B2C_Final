-- Phase 2: window-scope daily_context_snapshot
-- Backfill mrs_window so morning/afternoon/evening rows can co-exist.
UPDATE public.daily_context_snapshot
SET mrs_window = COALESCE(mrs_window, last_check_in_window, 'morning')
WHERE mrs_window IS NULL;

-- Set default + NOT NULL now that all rows have a window.
ALTER TABLE public.daily_context_snapshot
  ALTER COLUMN mrs_window SET DEFAULT 'morning';

ALTER TABLE public.daily_context_snapshot
  ALTER COLUMN mrs_window SET NOT NULL;

-- Replace uniqueness from (user_id, local_date) to
-- (user_id, local_date, mrs_window) so each window has its own row.
ALTER TABLE public.daily_context_snapshot
  DROP CONSTRAINT IF EXISTS daily_context_snapshot_user_id_local_date_key;

ALTER TABLE public.daily_context_snapshot
  ADD CONSTRAINT daily_context_snapshot_user_id_local_date_window_key
  UNIQUE (user_id, local_date, mrs_window);

-- Window-aware lookup index (the unique index above already covers most reads,
-- but we keep a dedicated DESC index for date-range scans).
CREATE INDEX IF NOT EXISTS idx_daily_context_snapshot_user_date_window
  ON public.daily_context_snapshot (user_id, local_date DESC, mrs_window);