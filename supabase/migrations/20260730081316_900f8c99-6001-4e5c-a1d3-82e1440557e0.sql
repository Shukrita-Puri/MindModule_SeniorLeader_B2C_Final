-- Onboarding v8 completion: new columns + performance indexes
-- Date: 2026-07-30

-- New columns on onboarding_v8_responses
ALTER TABLE onboarding_v8_responses
  ADD COLUMN IF NOT EXISTS home_country TEXT,
  ADD COLUMN IF NOT EXISTS cos_profile_source TEXT,
  ADD COLUMN IF NOT EXISTS cos_profile_email_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cos_profile_email_sent_at TIMESTAMPTZ;

-- Performance index: cron sweep for pending synthesis
CREATE INDEX IF NOT EXISTS idx_onboarding_cos_pending
  ON onboarding_v8_responses (user_id)
  WHERE completed_at IS NOT NULL AND cos_profile_generated_at IS NULL;

-- Performance index: cron sweep for pending email
CREATE INDEX IF NOT EXISTS idx_onboarding_cos_email
  ON onboarding_v8_responses (user_id)
  WHERE cos_profile_email_scheduled_at IS NOT NULL
    AND cos_profile_email_sent_at IS NULL;

-- Documentation comments
COMMENT ON COLUMN onboarding_v8_responses.cos_profile_source IS 'ai | fallback — distinguishes AI-generated from fallback profiles';
COMMENT ON COLUMN onboarding_v8_responses.home_country IS 'User home country selected during onboarding';