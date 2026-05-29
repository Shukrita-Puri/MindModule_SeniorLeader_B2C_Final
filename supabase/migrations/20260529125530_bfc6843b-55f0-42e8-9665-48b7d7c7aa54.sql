-- LinkedIn-first onboarding: add profile context columns + new onboarding milestones

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS linkedin_raw_markdown text,
  ADD COLUMN IF NOT EXISTS leadership_context jsonb,
  ADD COLUMN IF NOT EXISTS inferred_priorities text[],
  ADD COLUMN IF NOT EXISTS confirmed_priorities text[],
  ADD COLUMN IF NOT EXISTS linkedin_analyzed_at timestamptz,
  ADD COLUMN IF NOT EXISTS linkedin_intake_mode text;  -- 'scrape' | 'manual'

ALTER TABLE public.onboarding_progress
  ADD COLUMN IF NOT EXISTS pricing_at timestamptz,
  ADD COLUMN IF NOT EXISTS linkedin_at timestamptz,
  ADD COLUMN IF NOT EXISTS context_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS connections_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;