-- Phase 2: Saved Debriefs table
CREATE TABLE public.saved_debriefs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id UUID REFERENCES public.dialogue_sessions(id),
  title TEXT,
  scenario_domain TEXT,
  scenario_context TEXT,
  persona_type TEXT,
  duration_seconds INTEGER,
  debrief_summary JSONB DEFAULT '{}'::jsonb,
  transcript_json JSONB DEFAULT '[]'::jsonb,
  strengths JSONB DEFAULT '[]'::jsonb,
  development_areas JSONB DEFAULT '[]'::jsonb,
  frameworks_used JSONB DEFAULT '[]'::jsonb,
  personal_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_debriefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own saved debriefs"
ON public.saved_debriefs FOR SELECT
USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can insert their own saved debriefs"
ON public.saved_debriefs FOR INSERT
WITH CHECK ((auth.uid())::text = user_id);

CREATE POLICY "Users can update their own saved debriefs"
ON public.saved_debriefs FOR UPDATE
USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can delete their own saved debriefs"
ON public.saved_debriefs FOR DELETE
USING ((auth.uid())::text = user_id);

-- Phase 4: Achievement Definitions table
CREATE TABLE public.achievement_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL, -- 'archetype', 'mastery', 'certificate'
  cluster TEXT, -- 'self_mastery', 'social_mastery', or null for general
  icon_name TEXT,
  badge_color TEXT,
  threshold_scenarios INTEGER DEFAULT 5,
  threshold_skill_progress INTEGER,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.achievement_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view achievement definitions"
ON public.achievement_definitions FOR SELECT
USING (is_active = true);

-- Phase 4: User Achievements table
CREATE TABLE public.user_achievements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL REFERENCES public.achievement_definitions(id),
  earned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  scenarios_at_earn INTEGER,
  skill_progress_at_earn NUMERIC,
  shared_to_linkedin BOOLEAN DEFAULT false,
  shared_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own achievements"
ON public.user_achievements FOR SELECT
USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can insert their own achievements"
ON public.user_achievements FOR INSERT
WITH CHECK ((auth.uid())::text = user_id);

CREATE POLICY "Users can update their own achievements"
ON public.user_achievements FOR UPDATE
USING ((auth.uid())::text = user_id);

-- Phase 5: Certificate Requests table
CREATE TABLE public.certificate_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL REFERENCES public.achievement_definitions(id),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  mailing_address TEXT NOT NULL,
  city TEXT,
  country TEXT,
  postal_code TEXT,
  request_status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'shipped', 'delivered'
  tracking_number TEXT,
  notes TEXT,
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  shipped_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.certificate_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own certificate requests"
ON public.certificate_requests FOR SELECT
USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can insert their own certificate requests"
ON public.certificate_requests FOR INSERT
WITH CHECK ((auth.uid())::text = user_id);

-- Insert default achievement definitions
INSERT INTO public.achievement_definitions (id, name, description, category, cluster, badge_color, threshold_scenarios, threshold_skill_progress, display_order) VALUES
-- Self Mastery Archetypes (5 scenarios)
('self_mastery_initiate', 'Awareness Initiate', 'Beginning your journey of self-mastery through mindful practice', 'archetype', 'self_mastery', '#10B981', 5, NULL, 1),
('self_mastery_practitioner', 'Emotional Navigator', 'Developing skill in navigating emotional complexity', 'archetype', 'self_mastery', '#059669', 10, NULL, 2),
('self_mastery_adept', 'Regulation Adept', 'Demonstrating consistent self-regulation under pressure', 'archetype', 'self_mastery', '#047857', 20, NULL, 3),

-- Social Mastery Archetypes (5 scenarios)
('social_mastery_initiate', 'Connection Initiate', 'Beginning your journey of social mastery', 'archetype', 'social_mastery', '#6366F1', 5, NULL, 4),
('social_mastery_practitioner', 'Empathy Practitioner', 'Developing skill in understanding others', 'archetype', 'social_mastery', '#4F46E5', 10, NULL, 5),
('social_mastery_adept', 'Influence Adept', 'Demonstrating consistent social intelligence', 'archetype', 'social_mastery', '#4338CA', 20, NULL, 6),

-- Mastery Badges (20 scenarios + 70% skill progress)
('self_mastery_badge', 'Self Mastery Badge', 'Achieved proficiency in self-regulation and emotional intelligence', 'mastery', 'self_mastery', '#065F46', 20, 70, 7),
('social_mastery_badge', 'Social Mastery Badge', 'Achieved proficiency in social intelligence and influence', 'mastery', 'social_mastery', '#3730A3', 20, 70, 8),

-- Physical Certificates (50+ scenarios + 85% skill progress)
('self_mastery_certificate', 'Self Mastery Certificate', 'Elite certification in self-mastery practices', 'certificate', 'self_mastery', '#064E3B', 50, 85, 9),
('social_mastery_certificate', 'Social Mastery Certificate', 'Elite certification in social mastery practices', 'certificate', 'social_mastery', '#312E81', 50, 85, 10);