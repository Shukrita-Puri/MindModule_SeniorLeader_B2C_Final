-- Dialogue Room Tables for Meta Skills Coach System

-- 1. Scenario Definitions (pre-defined scenarios)
CREATE TABLE public.scenario_definitions (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL, -- 'academic_confidence', 'social_navigation', 'growth_opportunity'
  title TEXT NOT NULL,
  description TEXT,
  context_type TEXT NOT NULL DEFAULT 'scenario', -- 'scenario', 'debate', 'academic', 'personal'
  difficulty_level TEXT DEFAULT 'intermediate', -- 'beginner', 'intermediate', 'advanced'
  target_meta_skills JSONB DEFAULT '[]'::jsonb,
  scenario_context JSONB DEFAULT '{}'::jsonb, -- scenario-specific setup
  created_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);

-- 2. Persona Definitions (AI personas for scenarios)
CREATE TABLE public.persona_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL, -- 'interviewer', 'networking_contact', 'peer', etc.
  personality_traits JSONB DEFAULT '[]'::jsonb,
  communication_style TEXT, -- 'formal', 'casual', 'challenging', 'supportive'
  challenge_level INTEGER DEFAULT 5, -- 1-10 scale
  background_context TEXT,
  scenario_ids TEXT[] DEFAULT '{}', -- which scenarios this persona can be used in
  created_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);

-- 3. Dialogue Sessions (main session tracking)
CREATE TABLE public.dialogue_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  scenario_id TEXT REFERENCES public.scenario_definitions(id),
  persona_id TEXT REFERENCES public.persona_definitions(id),
  context_type TEXT NOT NULL DEFAULT 'scenario', -- 'scenario', 'debate', 'academic', 'personal'
  scenario_context JSONB DEFAULT '{}'::jsonb, -- runtime context
  coach_personality TEXT DEFAULT 'supportive', -- 'supportive', 'challenging', 'direct'
  session_status TEXT DEFAULT 'active', -- 'active', 'paused', 'completed', 'abandoned'
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  total_messages INTEGER DEFAULT 0,
  total_interventions INTEGER DEFAULT 0,
  meta_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Dialogue Messages (conversation transcript)
CREATE TABLE public.dialogue_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.dialogue_sessions(id) ON DELETE CASCADE,
  message_index INTEGER NOT NULL,
  sender_type TEXT NOT NULL, -- 'user', 'persona', 'coach', 'system'
  content TEXT NOT NULL,
  emotion_displayed TEXT, -- for persona messages
  audio_url TEXT, -- if voice message
  timestamp TIMESTAMPTZ DEFAULT now(),
  meta_data JSONB DEFAULT '{}'::jsonb
);

-- 5. Detected Signals (rule-based detection output per message)
CREATE TABLE public.detected_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.dialogue_sessions(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.dialogue_messages(id) ON DELETE CASCADE,
  sentiment JSONB DEFAULT '{}'::jsonb, -- { score, label, confidence, intensity }
  emotions JSONB DEFAULT '[]'::jsonb, -- [{ type, confidence, indicators }]
  ei_behaviors JSONB DEFAULT '{}'::jsonb, -- { empathy, self_regulation, perspective_taking, etc. }
  skill_gaps JSONB DEFAULT '[]'::jsonb, -- [{ meta_skill, sub_skill, confidence, indicators }]
  skill_strengths JSONB DEFAULT '[]'::jsonb,
  conversation_flow JSONB DEFAULT '{}'::jsonb, -- { response_type, topic_shift, questions_asked }
  risk_assessment JSONB DEFAULT '{}'::jsonb, -- { escalation_risk, intervention_urgency }
  coaching_readiness JSONB DEFAULT '{}'::jsonb, -- { openness_score, breakthrough_potential }
  raw_signals JSONB DEFAULT '{}'::jsonb, -- full detection output for analytics
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Dialogue Interventions (coach interventions)
CREATE TABLE public.dialogue_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.dialogue_sessions(id) ON DELETE CASCADE,
  triggered_by_message_id UUID REFERENCES public.dialogue_messages(id),
  intervention_type TEXT NOT NULL, -- 'observation', 'framework', 'wisdom', 'challenge', 'encouragement'
  meta_skill_target TEXT, -- which meta-skill this addresses
  sub_skill_target TEXT,
  observation TEXT,
  framework_used TEXT, -- 'stoic', 'cbt', 'mindfulness', 'high_performer', etc.
  wisdom_source JSONB, -- { category, quote, attribution, context }
  action_suggested TEXT,
  coach_personality TEXT, -- which personality delivered this
  user_acknowledged BOOLEAN DEFAULT false,
  displayed_at TIMESTAMPTZ DEFAULT now(),
  dismissed_at TIMESTAMPTZ,
  meta_data JSONB DEFAULT '{}'::jsonb
);

-- 7. Dialogue Skill Events (skill gap/strength tracking)
CREATE TABLE public.dialogue_skill_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.dialogue_sessions(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.dialogue_messages(id),
  event_type TEXT NOT NULL, -- 'gap_detected', 'strength_demonstrated', 'improvement_shown'
  meta_skill TEXT NOT NULL,
  sub_skill TEXT,
  cluster TEXT, -- 'self_mastery', 'social_mastery'
  confidence NUMERIC(3,2),
  indicators TEXT[],
  context_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Dialogue Analytics (post-session AI analysis)
CREATE TABLE public.dialogue_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.dialogue_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  strengths_identified JSONB DEFAULT '[]'::jsonb,
  growth_areas JSONB DEFAULT '[]'::jsonb,
  key_moments JSONB DEFAULT '[]'::jsonb, -- pivotal conversation moments
  meta_skill_scores JSONB DEFAULT '{}'::jsonb, -- scores per meta-skill
  overall_performance_score NUMERIC(5,2),
  ai_summary TEXT,
  recommendations JSONB DEFAULT '[]'::jsonb,
  transcript_highlights JSONB DEFAULT '[]'::jsonb,
  generated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.scenario_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.persona_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dialogue_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dialogue_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detected_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dialogue_interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dialogue_skill_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dialogue_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Scenario/Persona definitions: public read
CREATE POLICY "Anyone can view active scenarios" ON public.scenario_definitions
  FOR SELECT USING (is_active = true);

CREATE POLICY "Anyone can view active personas" ON public.persona_definitions
  FOR SELECT USING (is_active = true);

-- User-specific data policies
CREATE POLICY "Users can view own sessions" ON public.dialogue_sessions
  FOR SELECT USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can insert own sessions" ON public.dialogue_sessions
  FOR INSERT WITH CHECK ((auth.uid())::text = user_id);

CREATE POLICY "Users can update own sessions" ON public.dialogue_sessions
  FOR UPDATE USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can view messages from own sessions" ON public.dialogue_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM dialogue_sessions WHERE id = session_id AND (auth.uid())::text = user_id)
  );

CREATE POLICY "Users can insert messages to own sessions" ON public.dialogue_messages
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM dialogue_sessions WHERE id = session_id AND (auth.uid())::text = user_id)
  );

CREATE POLICY "Users can view signals from own sessions" ON public.detected_signals
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM dialogue_sessions WHERE id = session_id AND (auth.uid())::text = user_id)
  );

CREATE POLICY "Users can insert signals to own sessions" ON public.detected_signals
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM dialogue_sessions WHERE id = session_id AND (auth.uid())::text = user_id)
  );

CREATE POLICY "Users can view interventions from own sessions" ON public.dialogue_interventions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM dialogue_sessions WHERE id = session_id AND (auth.uid())::text = user_id)
  );

CREATE POLICY "Users can insert interventions to own sessions" ON public.dialogue_interventions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM dialogue_sessions WHERE id = session_id AND (auth.uid())::text = user_id)
  );

CREATE POLICY "Users can update interventions in own sessions" ON public.dialogue_interventions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM dialogue_sessions WHERE id = session_id AND (auth.uid())::text = user_id)
  );

CREATE POLICY "Users can view skill events from own sessions" ON public.dialogue_skill_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM dialogue_sessions WHERE id = session_id AND (auth.uid())::text = user_id)
  );

CREATE POLICY "Users can insert skill events to own sessions" ON public.dialogue_skill_events
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM dialogue_sessions WHERE id = session_id AND (auth.uid())::text = user_id)
  );

CREATE POLICY "Users can view own analytics" ON public.dialogue_analytics
  FOR SELECT USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can insert own analytics" ON public.dialogue_analytics
  FOR INSERT WITH CHECK ((auth.uid())::text = user_id);

-- Service role policies for edge functions
CREATE POLICY "Service role can manage scenarios" ON public.scenario_definitions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage personas" ON public.persona_definitions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage all sessions" ON public.dialogue_sessions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage all messages" ON public.dialogue_messages
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage all signals" ON public.detected_signals
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage all interventions" ON public.dialogue_interventions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage all skill events" ON public.dialogue_skill_events
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage all analytics" ON public.dialogue_analytics
  FOR ALL USING (auth.role() = 'service_role');

-- Create indexes for performance
CREATE INDEX idx_dialogue_sessions_user ON public.dialogue_sessions(user_id);
CREATE INDEX idx_dialogue_sessions_status ON public.dialogue_sessions(session_status);
CREATE INDEX idx_dialogue_messages_session ON public.dialogue_messages(session_id);
CREATE INDEX idx_dialogue_messages_timestamp ON public.dialogue_messages(timestamp);
CREATE INDEX idx_detected_signals_session ON public.detected_signals(session_id);
CREATE INDEX idx_dialogue_interventions_session ON public.dialogue_interventions(session_id);
CREATE INDEX idx_dialogue_skill_events_session ON public.dialogue_skill_events(session_id);
CREATE INDEX idx_dialogue_analytics_user ON public.dialogue_analytics(user_id);