
-- 1. Add missing columns
ALTER TABLE coach_tools_offered ADD COLUMN IF NOT EXISTS checked_at timestamptz;
ALTER TABLE coach_tools_offered ADD COLUMN IF NOT EXISTS user_response text;
ALTER TABLE coach_tools_offered ADD COLUMN IF NOT EXISTS pattern_discovered text;
ALTER TABLE coach_tools_offered ADD COLUMN IF NOT EXISTS was_effective boolean;
ALTER TABLE coach_tools_offered ADD COLUMN IF NOT EXISTS pattern_area text;

ALTER TABLE tiny_wins ADD COLUMN IF NOT EXISTS category text;

ALTER TABLE coach_accountability_tracker ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- 2. Create missing indexes
CREATE INDEX IF NOT EXISTS idx_scenarios_scenario ON coach_scenarios_detected(scenario);
CREATE INDEX IF NOT EXISTS idx_scenarios_resolved ON coach_scenarios_detected(resolved);

CREATE INDEX IF NOT EXISTS idx_tools_user ON coach_tools_offered(user_id);
CREATE INDEX IF NOT EXISTS idx_tools_session ON coach_tools_offered(session_id);
CREATE INDEX IF NOT EXISTS idx_tools_status ON coach_tools_offered(status);
CREATE INDEX IF NOT EXISTS idx_tools_scenario ON coach_tools_offered(scenario);
CREATE INDEX IF NOT EXISTS idx_tools_check_in ON coach_tools_offered(check_in_at);

CREATE INDEX IF NOT EXISTS idx_jit_prefs_user ON jit_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_jit_prefs_type ON jit_preferences(event_type);
CREATE INDEX IF NOT EXISTS idx_jit_prefs_skipped ON jit_preferences(skipped_at DESC);

CREATE INDEX IF NOT EXISTS idx_jit_event_shown ON jit_event_context(shown_in_jit, user_id);

CREATE INDEX IF NOT EXISTS idx_pill_log_clicked ON jit_pill_display_log(clicked);

CREATE INDEX IF NOT EXISTS idx_carousel_cards_completed ON jit_carousel_cards(completed, user_id);

-- 3. Create increment_pattern_observation function
CREATE OR REPLACE FUNCTION public.increment_pattern_observation(p_pattern_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE coach_pattern_observations
  SET observation_count = COALESCE(observation_count, 1) + 1,
      last_observed_at = now()
  WHERE id = p_pattern_id;
END;
$$;

-- 4. Add missing user SELECT RLS policies
CREATE POLICY "Users can view own tools"
  ON coach_tools_offered FOR SELECT
  USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can view own carousel cards"
  ON jit_carousel_cards FOR SELECT
  USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can view own pill logs"
  ON jit_pill_display_log FOR SELECT
  USING ((auth.uid())::text = user_id);
