
CREATE TABLE public.onboarding_v8_responses (
  user_id text PRIMARY KEY,

  -- Leadership context (Step 1)
  linkedin_url text,
  writing_urls text[] NOT NULL DEFAULT '{}',
  freetext_context text,

  -- Cognitive load (Step 1 continued)
  stakes_chips text[] NOT NULL DEFAULT '{}',
  load_chips text[] NOT NULL DEFAULT '{}',
  burden_chips text[] NOT NULL DEFAULT '{}',

  -- Protect goals (Step 2)
  goals text[] NOT NULL DEFAULT '{}',

  -- Brief preferences (Step 3)
  brief_timing text,
  reset_modality text,
  weekend_signals text,

  -- Permissions (Step 4)
  calendar_selections text[] NOT NULL DEFAULT '{}',
  wearable_selections text[] NOT NULL DEFAULT '{}',

  -- Scraped source content
  linkedin_scrape jsonb,
  writing_scrapes jsonb,

  -- Generated COS profile
  cos_profile jsonb,
  cos_profile_html text,
  cos_profile_status text NOT NULL DEFAULT 'pending', -- pending | in_progress | ready | failed
  cos_profile_error text,
  cos_profile_generated_at timestamptz,

  -- Step completion ledger
  step_status jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.onboarding_v8_responses TO authenticated;
GRANT ALL ON public.onboarding_v8_responses TO service_role;

ALTER TABLE public.onboarding_v8_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v8 onboarding: users select own"
  ON public.onboarding_v8_responses FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

CREATE POLICY "v8 onboarding: users insert own"
  ON public.onboarding_v8_responses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "v8 onboarding: users update own"
  ON public.onboarding_v8_responses FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "v8 onboarding: users delete own"
  ON public.onboarding_v8_responses FOR DELETE
  TO authenticated
  USING (auth.uid()::text = user_id);

CREATE TRIGGER set_onboarding_v8_responses_updated_at
BEFORE UPDATE ON public.onboarding_v8_responses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
