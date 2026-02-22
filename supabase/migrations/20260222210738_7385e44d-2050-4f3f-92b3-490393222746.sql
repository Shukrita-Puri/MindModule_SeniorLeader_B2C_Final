
-- ============================================================
-- Phase 2: Coach Memory & Database Architecture
-- ============================================================

-- 1. Enable pgvector extension (for future semantic search)
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ============================================================
-- 2. Add missing columns to existing tables
-- ============================================================

-- dialogue_sessions: session metadata
ALTER TABLE public.dialogue_sessions 
  ADD COLUMN IF NOT EXISTS session_title text,
  ADD COLUMN IF NOT EXISTS dominant_pattern text,
  ADD COLUMN IF NOT EXISTS flow_type text,
  ADD COLUMN IF NOT EXISTS inner_readiness_score integer,
  ADD COLUMN IF NOT EXISTS inner_readiness_tier text,
  ADD COLUMN IF NOT EXISTS practices_recommended text[],
  ADD COLUMN IF NOT EXISTS practices_completed text[],
  ADD COLUMN IF NOT EXISTS commitments_made text[];

-- dialogue_messages: message classification
ALTER TABLE public.dialogue_messages
  ADD COLUMN IF NOT EXISTS message_type text,
  ADD COLUMN IF NOT EXISTS referenced_practice_id text,
  ADD COLUMN IF NOT EXISTS sentiment_score numeric,
  ADD COLUMN IF NOT EXISTS key_themes text[];

-- user_coach_insights: expanded insight tracking
ALTER TABLE public.user_coach_insights
  ADD COLUMN IF NOT EXISTS pattern_area text,
  ADD COLUMN IF NOT EXISTS meta_skill text,
  ADD COLUMN IF NOT EXISTS check_in_date date,
  ADD COLUMN IF NOT EXISTS resolution_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS resolution_note text;

-- tiny_wins: coach linkage
ALTER TABLE public.tiny_wins
  ADD COLUMN IF NOT EXISTS coach_acknowledgment text,
  ADD COLUMN IF NOT EXISTS meta_skill_demonstrated text,
  ADD COLUMN IF NOT EXISTS pattern_area text;

-- ============================================================
-- 3. Create new tables
-- ============================================================

-- coach_session_summaries
CREATE TABLE IF NOT EXISTS public.coach_session_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  session_id uuid NOT NULL REFERENCES public.dialogue_sessions(id) ON DELETE CASCADE,
  summary_text text NOT NULL,
  key_topics text[],
  dominant_pattern text,
  emotional_arc text,
  commitments_made text[],
  practices_recommended text[],
  wisdom_referenced text[],
  breakthrough_moment text,
  recurring_themes text[],
  new_themes text[],
  session_quality_score integer,
  created_at timestamptz DEFAULT now(),
  UNIQUE(session_id)
);

ALTER TABLE public.coach_session_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage all coach session summaries"
  ON public.coach_session_summaries FOR ALL
  USING (auth.role() = 'service_role'::text);

CREATE INDEX IF NOT EXISTS idx_coach_summaries_user ON public.coach_session_summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_coach_summaries_pattern ON public.coach_session_summaries(dominant_pattern);
CREATE INDEX IF NOT EXISTS idx_coach_summaries_topics ON public.coach_session_summaries USING gin(key_topics);

-- coach_memory_index (embedding column deferred)
CREATE TABLE IF NOT EXISTS public.coach_memory_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  session_id uuid NOT NULL REFERENCES public.dialogue_sessions(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.dialogue_messages(id) ON DELETE SET NULL,
  memory_type text NOT NULL,
  memory_content text NOT NULL,
  memory_context text,
  importance_score integer DEFAULT 5,
  access_count integer DEFAULT 0,
  last_accessed_at timestamptz,
  pattern_area text,
  meta_skill text,
  key_themes text[],
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.coach_memory_index ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage all coach memory index"
  ON public.coach_memory_index FOR ALL
  USING (auth.role() = 'service_role'::text);

CREATE INDEX IF NOT EXISTS idx_memory_user ON public.coach_memory_index(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_type ON public.coach_memory_index(memory_type);
CREATE INDEX IF NOT EXISTS idx_memory_pattern ON public.coach_memory_index(pattern_area);
CREATE INDEX IF NOT EXISTS idx_memory_themes ON public.coach_memory_index USING gin(key_themes);

-- coach_accountability_tracker
CREATE TABLE IF NOT EXISTS public.coach_accountability_tracker (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  session_id uuid NOT NULL REFERENCES public.dialogue_sessions(id) ON DELETE CASCADE,
  commitment_text text NOT NULL,
  commitment_type text,
  target_practice_id text,
  target_frequency text,
  target_duration_days integer,
  committed_at timestamptz DEFAULT now(),
  check_in_due_date timestamptz,
  status text DEFAULT 'pending',
  times_checked integer DEFAULT 0,
  last_checked_at timestamptz,
  completion_evidence text,
  was_helpful boolean,
  outcome_note text,
  pattern_area text,
  meta_skill text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.coach_accountability_tracker ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage all coach accountability tracker"
  ON public.coach_accountability_tracker FOR ALL
  USING (auth.role() = 'service_role'::text);

CREATE INDEX IF NOT EXISTS idx_accountability_user ON public.coach_accountability_tracker(user_id);
CREATE INDEX IF NOT EXISTS idx_accountability_status ON public.coach_accountability_tracker(status);
CREATE INDEX IF NOT EXISTS idx_accountability_check_due ON public.coach_accountability_tracker(check_in_due_date);

-- coach_pattern_observations
CREATE TABLE IF NOT EXISTS public.coach_pattern_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  session_id uuid REFERENCES public.dialogue_sessions(id) ON DELETE SET NULL,
  pattern_type text NOT NULL,
  pattern_description text NOT NULL,
  pattern_context text,
  first_observed_at timestamptz DEFAULT now(),
  last_observed_at timestamptz DEFAULT now(),
  observation_count integer DEFAULT 1,
  is_improving boolean,
  improvement_evidence text,
  pattern_area text,
  meta_skill text,
  related_themes text[],
  was_named_to_user boolean DEFAULT false,
  named_at timestamptz,
  user_acknowledged boolean,
  is_active boolean DEFAULT true,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.coach_pattern_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage all coach pattern observations"
  ON public.coach_pattern_observations FOR ALL
  USING (auth.role() = 'service_role'::text);

CREATE INDEX IF NOT EXISTS idx_pattern_user ON public.coach_pattern_observations(user_id);
CREATE INDEX IF NOT EXISTS idx_pattern_active ON public.coach_pattern_observations(is_active);
CREATE INDEX IF NOT EXISTS idx_pattern_type ON public.coach_pattern_observations(pattern_type);
CREATE INDEX IF NOT EXISTS idx_pattern_themes ON public.coach_pattern_observations USING gin(related_themes);
