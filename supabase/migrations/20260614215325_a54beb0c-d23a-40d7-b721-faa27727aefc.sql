
ALTER TABLE public.daily_context_snapshot
  ADD COLUMN IF NOT EXISTS mrs_window text,
  ADD COLUMN IF NOT EXISTS morning_baseline_score integer,
  ADD COLUMN IF NOT EXISTS check_in_count_today integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_check_in_window text,
  ADD COLUMN IF NOT EXISTS weight_provenance jsonb;

ALTER TABLE public.daily_context_snapshot
  DROP CONSTRAINT IF EXISTS daily_context_snapshot_mrs_window_check;

ALTER TABLE public.daily_context_snapshot
  ADD CONSTRAINT daily_context_snapshot_mrs_window_check
  CHECK (mrs_window IS NULL OR mrs_window IN ('morning','afternoon','evening'));

ALTER TABLE public.daily_context_snapshot
  DROP CONSTRAINT IF EXISTS daily_context_snapshot_last_check_in_window_check;

ALTER TABLE public.daily_context_snapshot
  ADD CONSTRAINT daily_context_snapshot_last_check_in_window_check
  CHECK (last_check_in_window IS NULL OR last_check_in_window IN ('morning','afternoon','evening'));
