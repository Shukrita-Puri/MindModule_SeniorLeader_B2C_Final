
-- 1. Add time_window column to daily_checkins (nullable first for backfill)
ALTER TABLE daily_checkins 
  ADD COLUMN time_window text;

-- 2. Backfill existing rows as 'morning'
UPDATE daily_checkins 
  SET time_window = 'morning' 
  WHERE time_window IS NULL;

-- 3. Make time_window NOT NULL with CHECK constraint (using trigger instead of CHECK for safety)
ALTER TABLE daily_checkins 
  ALTER COLUMN time_window SET NOT NULL,
  ALTER COLUMN time_window SET DEFAULT 'morning';

-- 4. Add validation trigger for time_window values
CREATE OR REPLACE FUNCTION validate_time_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.time_window NOT IN ('morning', 'afternoon', 'evening') THEN
    RAISE EXCEPTION 'time_window must be morning, afternoon, or evening';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_time_window
  BEFORE INSERT OR UPDATE ON daily_checkins
  FOR EACH ROW EXECUTE FUNCTION validate_time_window();

-- 5. Drop old unique constraint and create new one
ALTER TABLE daily_checkins 
  DROP CONSTRAINT IF EXISTS daily_checkins_user_date_unique;

CREATE UNIQUE INDEX daily_checkins_user_date_window 
  ON daily_checkins(user_id, checkin_date, time_window);

-- 6. Add index for time-based queries
CREATE INDEX idx_checkins_user_date_window 
  ON daily_checkins(user_id, checkin_date, time_window);

-- 7. Create inferred_states table
CREATE TABLE inferred_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  inferred_at timestamptz NOT NULL,
  inferred_for_date date NOT NULL,
  inferred_for_window text NOT NULL,
  inferred_tier text NOT NULL,
  inferred_score integer NOT NULL,
  inferred_outcome text,
  confidence_score integer NOT NULL,
  inference_method text NOT NULL,
  based_on jsonb NOT NULL,
  actual_checkin_id uuid REFERENCES daily_checkins(id),
  accuracy_score integer,
  used_for text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE inferred_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage inferred_states"
  ON inferred_states FOR ALL
  USING (auth.role() = 'service_role'::text);

CREATE INDEX idx_inferred_states_user ON inferred_states(user_id);
CREATE INDEX idx_inferred_states_date_window ON inferred_states(inferred_for_date, inferred_for_window);
CREATE INDEX idx_inferred_states_method ON inferred_states(inference_method);

-- 8. Create evening_checkins table
CREATE TABLE evening_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  checkin_date date NOT NULL,
  tiny_win_captured boolean DEFAULT false,
  tiny_win_id uuid REFERENCES tiny_wins(id),
  reflection_completed boolean DEFAULT false,
  reflection_text text,
  evening_state text,
  timestamp timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT evening_checkins_user_date_unique UNIQUE (user_id, checkin_date)
);

ALTER TABLE evening_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage evening_checkins"
  ON evening_checkins FOR ALL
  USING (auth.role() = 'service_role'::text);

CREATE INDEX idx_evening_checkins_user ON evening_checkins(user_id);
CREATE INDEX idx_evening_checkins_date ON evening_checkins(checkin_date);

-- 9. Create checkin_patterns table
CREATE TABLE checkin_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  pattern_type text NOT NULL,
  pattern_description text,
  day_of_week integer,
  time_window text,
  typical_outcome text,
  typical_tier text,
  observation_count integer DEFAULT 1,
  confidence_score numeric,
  last_observed_at timestamptz,
  prediction_accuracy numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT checkin_patterns_user_dow_window UNIQUE (user_id, day_of_week, time_window)
);

ALTER TABLE checkin_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage checkin_patterns"
  ON checkin_patterns FOR ALL
  USING (auth.role() = 'service_role'::text);

CREATE INDEX idx_checkin_patterns_user ON checkin_patterns(user_id);
CREATE INDEX idx_checkin_patterns_dow ON checkin_patterns(day_of_week);
CREATE INDEX idx_checkin_patterns_window ON checkin_patterns(time_window);

-- 10. Create mastery_plan_completions table
CREATE TABLE mastery_plan_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  plan_date date NOT NULL,
  plan_type text NOT NULL,
  based_on_window text,
  practices_assigned text[],
  total_practices integer NOT NULL,
  practices_completed text[] DEFAULT '{}',
  completion_percentage integer DEFAULT 0,
  completed_at timestamptz,
  is_complete boolean DEFAULT false,
  calendar_event_id uuid REFERENCES calendar_events(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE mastery_plan_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage mastery_plan_completions"
  ON mastery_plan_completions FOR ALL
  USING (auth.role() = 'service_role'::text);

CREATE INDEX idx_plan_completions_user_date ON mastery_plan_completions(user_id, plan_date);
CREATE INDEX idx_plan_completions_complete ON mastery_plan_completions(is_complete);
