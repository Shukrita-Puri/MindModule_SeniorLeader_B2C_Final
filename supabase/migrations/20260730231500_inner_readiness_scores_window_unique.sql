-- Migration: Add time_of_day to unique index for inner_readiness_scores
-- Enables window-level historical tracking (morning, afternoon, evening) per user per date.

DROP INDEX IF EXISTS public.idx_inner_readiness_scores_user_date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inner_readiness_scores_user_date_window
  ON public.inner_readiness_scores (user_id, score_date, time_of_day);
