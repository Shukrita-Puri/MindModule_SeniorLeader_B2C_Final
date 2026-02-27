
-- Create onboarding_progress table for durable step tracking
CREATE TABLE public.onboarding_progress (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  current_step text NOT NULL DEFAULT 'welcome',
  
  -- Step completion timestamps (NULL = not completed)
  welcome_at timestamptz,
  identity_at timestamptz,
  emotional_awareness_at timestamptz,
  stress_response_at timestamptz,
  recovery_patterns_at timestamptz,
  mental_clarity_at timestamptz,
  growth_intention_at timestamptz,
  signup_step_at timestamptz,
  results_at timestamptz,
  payment_at timestamptz,
  context_connection_at timestamptz,
  
  -- Metadata
  selected_plan text,
  context_calendar_enabled boolean DEFAULT false,
  context_watch_enabled boolean DEFAULT false,
  
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_progress FORCE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Service role can manage all onboarding progress"
  ON public.onboarding_progress FOR ALL
  USING (auth.role() = 'service_role'::text);

CREATE POLICY "Users can view own onboarding progress"
  ON public.onboarding_progress FOR SELECT
  USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can insert own onboarding progress"
  ON public.onboarding_progress FOR INSERT
  WITH CHECK ((auth.uid())::text = user_id);

CREATE POLICY "Users can update own onboarding progress"
  ON public.onboarding_progress FOR UPDATE
  USING ((auth.uid())::text = user_id);

-- Index for analytics queries
CREATE INDEX idx_onboarding_progress_funnel 
  ON public.onboarding_progress (signup_step_at, results_at, payment_at, context_connection_at, completed_at);

-- Auto-update updated_at
CREATE TRIGGER update_onboarding_progress_updated_at
  BEFORE UPDATE ON public.onboarding_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
