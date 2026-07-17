ALTER TABLE public.onboarding_v8_responses
  ADD COLUMN IF NOT EXISTS preferred_practice_window text;

ALTER TABLE public.onboarding_v8_responses
  DROP CONSTRAINT IF EXISTS onboarding_v8_preferred_practice_window_check;

ALTER TABLE public.onboarding_v8_responses
  ADD CONSTRAINT onboarding_v8_preferred_practice_window_check
  CHECK (
    preferred_practice_window IS NULL OR
    preferred_practice_window IN ('Morning', 'Evening')
  );