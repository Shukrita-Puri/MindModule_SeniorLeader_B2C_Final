
-- 1. Drop restrictive CHECK constraint on user_coach_insights.insight_type
-- First find and drop any CHECK constraints on insight_type
DO $$ 
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
  WHERE c.conrelid = 'public.user_coach_insights'::regclass
    AND c.contype = 'c'
    AND a.attname = 'insight_type';
  
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.user_coach_insights DROP CONSTRAINT %I', constraint_name);
    RAISE NOTICE 'Dropped constraint: %', constraint_name;
  END IF;
END $$;

-- 2. Add missing columns to coach_tools_offered
ALTER TABLE public.coach_tools_offered
  ADD COLUMN IF NOT EXISTS tool_description text,
  ADD COLUMN IF NOT EXISTS commitment_timeframe text,
  ADD COLUMN IF NOT EXISTS scenario text,
  ADD COLUMN IF NOT EXISTS check_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';

-- 3. Add missing columns to coach_scenarios_detected
ALTER TABLE public.coach_scenarios_detected
  ADD COLUMN IF NOT EXISTS session_id uuid,
  ADD COLUMN IF NOT EXISTS confidence_score numeric,
  ADD COLUMN IF NOT EXISTS evidence text;
