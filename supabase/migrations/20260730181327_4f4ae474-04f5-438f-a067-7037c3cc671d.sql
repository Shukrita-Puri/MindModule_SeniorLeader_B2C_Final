DROP INDEX IF EXISTS public.idx_inner_readiness_scores_user_date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inner_readiness_scores_user_date_window
  ON public.inner_readiness_scores (user_id, score_date, time_of_day);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_practice_window TEXT DEFAULT 'system_decide';

CREATE INDEX IF NOT EXISTS idx_notification_log_user_sent
  ON public.notification_log (user_id, sent_at DESC);

ALTER TABLE public.onboarding_v8_responses
  ADD COLUMN IF NOT EXISTS linkedin_pdf_base64 TEXT;