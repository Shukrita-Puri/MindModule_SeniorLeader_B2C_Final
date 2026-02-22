
-- 1. Create probing effectiveness table
CREATE TABLE public.coach_probing_effectiveness (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  session_id uuid NOT NULL REFERENCES dialogue_sessions(id) ON DELETE CASCADE,
  message_id uuid REFERENCES dialogue_messages(id) ON DELETE SET NULL,
  probe_question text,
  probe_type text,
  user_response text,
  led_to_insight boolean,
  insight_markers text[],
  effectiveness_score integer,
  why_effective text,
  user_state_at_time text,
  topic_area text,
  pattern_area text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_probe_effectiveness_user ON coach_probing_effectiveness(user_id);
CREATE INDEX idx_probe_effectiveness_type ON coach_probing_effectiveness(probe_type);
CREATE INDEX idx_probe_effectiveness_score ON coach_probing_effectiveness(effectiveness_score);

-- 2. Create breakthrough moments table
CREATE TABLE public.coach_breakthrough_moments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  session_id uuid NOT NULL REFERENCES dialogue_sessions(id) ON DELETE CASCADE,
  message_id uuid REFERENCES dialogue_messages(id) ON DELETE SET NULL,
  breakthrough_content text,
  breakthrough_type text,
  preceded_by_probe boolean DEFAULT false,
  probe_question text,
  was_acted_on boolean,
  action_taken text,
  checked_at timestamptz,
  impact_score integer,
  pattern_area text,
  meta_skill text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_breakthrough_user ON coach_breakthrough_moments(user_id);
CREATE INDEX idx_breakthrough_session ON coach_breakthrough_moments(session_id);
CREATE INDEX idx_breakthrough_acted ON coach_breakthrough_moments(was_acted_on);

-- 3. Enable RLS
ALTER TABLE public.coach_probing_effectiveness ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_breakthrough_moments ENABLE ROW LEVEL SECURITY;

-- 4. Service-role-only RLS policies (matching existing coach tables pattern)
CREATE POLICY "Service role can manage all probing effectiveness"
  ON public.coach_probing_effectiveness FOR ALL
  USING (auth.role() = 'service_role'::text);

CREATE POLICY "Service role can manage all breakthrough moments"
  ON public.coach_breakthrough_moments FOR ALL
  USING (auth.role() = 'service_role'::text);
