-- Coach Intervention Outcomes table for learning which interventions work best
CREATE TABLE public.coach_intervention_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  session_id UUID REFERENCES public.dialogue_sessions(id) ON DELETE SET NULL,
  intervention_type TEXT NOT NULL,
  intervention_content TEXT NOT NULL,
  content_id TEXT,
  content_type TEXT,
  user_response_type TEXT,
  effectiveness_rating INTEGER,
  follow_up_state TEXT,
  context_state TEXT,
  context_tags TEXT[],
  success_weight DECIMAL(4,2) DEFAULT 1.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.coach_intervention_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own intervention outcomes"
ON public.coach_intervention_outcomes
FOR SELECT
USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own intervention outcomes"
ON public.coach_intervention_outcomes
FOR INSERT
WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own intervention outcomes"
ON public.coach_intervention_outcomes
FOR UPDATE
USING (auth.uid()::text = user_id);

CREATE POLICY "Dev user can manage intervention outcomes"
ON public.coach_intervention_outcomes
FOR ALL
USING (user_id = 'dev-user-123');

-- Indexes for fast queries
CREATE INDEX idx_intervention_outcomes_user_type ON public.coach_intervention_outcomes(user_id, intervention_type);
CREATE INDEX idx_intervention_outcomes_content ON public.coach_intervention_outcomes(user_id, content_id);
CREATE INDEX idx_intervention_outcomes_success ON public.coach_intervention_outcomes(user_id, success_weight DESC);