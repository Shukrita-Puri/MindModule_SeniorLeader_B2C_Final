ALTER TABLE public.onboarding_v8_responses
  ADD COLUMN IF NOT EXISTS cos_profile_email_html text,
  ADD COLUMN IF NOT EXISTS cos_profile_email_text text,
  ADD COLUMN IF NOT EXISTS cos_profile_email_subject text;