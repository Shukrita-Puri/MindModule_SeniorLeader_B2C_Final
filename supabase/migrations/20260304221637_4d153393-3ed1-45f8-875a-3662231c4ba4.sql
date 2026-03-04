
-- B1. Add missing columns to jit_preferences
ALTER TABLE public.jit_preferences
  ADD COLUMN IF NOT EXISTS skipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS event_start_time timestamptz,
  ADD COLUMN IF NOT EXISTS minutes_before_event integer;

-- B2. Create coach_scenarios_detected table
CREATE TABLE IF NOT EXISTS public.coach_scenarios_detected (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  scenario text NOT NULL,
  dimension text,
  event_types text[],
  detected_at timestamptz DEFAULT now(),
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_reason text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.coach_scenarios_detected ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage coach_scenarios_detected"
  ON public.coach_scenarios_detected FOR ALL
  USING (auth.role() = 'service_role'::text);

CREATE INDEX IF NOT EXISTS idx_scenarios_event_types 
  ON public.coach_scenarios_detected USING gin(event_types);
CREATE INDEX IF NOT EXISTS idx_scenarios_user 
  ON public.coach_scenarios_detected(user_id);

-- B3. Create jit_event_context table
CREATE TABLE IF NOT EXISTS public.jit_event_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  calendar_event_id uuid,
  event_title text NOT NULL,
  event_type text NOT NULL,
  event_start timestamptz NOT NULL,
  event_duration_minutes integer,
  attendee_count integer DEFAULT 0,
  user_is_organizer boolean DEFAULT false,
  is_recurring boolean DEFAULT false,
  is_during_prime_hours boolean DEFAULT false,
  has_prior_event_within_15min boolean DEFAULT false,
  urgency_score integer,
  scenario_match_score integer,
  accountability_score integer,
  scale_score integer,
  context_score integer,
  coach_boost_score integer,
  skip_penalty integer,
  final_score integer,
  has_coach_context boolean DEFAULT false,
  coach_scenario text,
  coach_dimension text,
  has_pending_tool boolean DEFAULT false,
  expressed_concern boolean DEFAULT false,
  context_statement text,
  shown_in_jit boolean DEFAULT false,
  dismissed_by_user boolean DEFAULT false,
  completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.jit_event_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage jit_event_context"
  ON public.jit_event_context FOR ALL
  USING (auth.role() = 'service_role'::text);

CREATE INDEX IF NOT EXISTS idx_jit_event_user ON public.jit_event_context(user_id);
CREATE INDEX IF NOT EXISTS idx_jit_event_start ON public.jit_event_context(event_start);
CREATE INDEX IF NOT EXISTS idx_jit_event_score ON public.jit_event_context(final_score DESC);
CREATE INDEX IF NOT EXISTS idx_jit_event_type ON public.jit_event_context(event_type);

-- B4. Create jit_carousel_cards table
CREATE TABLE IF NOT EXISTS public.jit_carousel_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  event_id uuid REFERENCES public.jit_event_context(id),
  card_type text NOT NULL,
  card_position integer,
  practice_id text,
  practice_category text,
  coach_tool_name text,
  coach_context_statement text,
  shown_at timestamptz DEFAULT now(),
  tapped boolean DEFAULT false,
  tapped_at timestamptz,
  completed boolean DEFAULT false,
  completed_at timestamptz
);

ALTER TABLE public.jit_carousel_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage jit_carousel_cards"
  ON public.jit_carousel_cards FOR ALL
  USING (auth.role() = 'service_role'::text);

CREATE INDEX IF NOT EXISTS idx_carousel_cards_user ON public.jit_carousel_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_carousel_cards_event ON public.jit_carousel_cards(event_id);

-- B5. Create jit_pill_display_log table
CREATE TABLE IF NOT EXISTS public.jit_pill_display_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  pill_type text NOT NULL,
  pill_label text NOT NULL,
  event_id uuid REFERENCES public.jit_event_context(id),
  displayed_at timestamptz DEFAULT now(),
  clicked boolean DEFAULT false,
  clicked_at timestamptz,
  inner_readiness_score integer,
  time_of_day text
);

ALTER TABLE public.jit_pill_display_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage jit_pill_display_log"
  ON public.jit_pill_display_log FOR ALL
  USING (auth.role() = 'service_role'::text);

CREATE INDEX IF NOT EXISTS idx_pill_log_user ON public.jit_pill_display_log(user_id);
CREATE INDEX IF NOT EXISTS idx_pill_log_displayed ON public.jit_pill_display_log(displayed_at DESC);

-- B6. Create get_event_type_skip_count DB function
CREATE OR REPLACE FUNCTION public.get_event_type_skip_count(
  p_user_id text, p_event_type text, p_days_back integer
) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(COUNT(*)::integer, 0) FROM jit_preferences
  WHERE user_id = p_user_id
    AND event_type = p_event_type
    AND created_at >= (now() - (p_days_back || ' days')::interval);
$$;
