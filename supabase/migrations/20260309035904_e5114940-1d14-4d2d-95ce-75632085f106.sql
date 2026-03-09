-- Create physiological_events table for storing wearable-correlated event data
-- Migrates from localStorage to server-side storage for medium-sensitivity data

CREATE TABLE IF NOT EXISTS public.physiological_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  event_title TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'meeting',
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  hrv INTEGER,
  resting_heart_rate INTEGER,
  sleep_score INTEGER,
  readiness_score INTEGER,
  activity_level TEXT CHECK (activity_level IN ('low', 'moderate', 'high')),
  source TEXT NOT NULL CHECK (source IN ('oura', 'apple-watch')),
  stress_level TEXT NOT NULL DEFAULT 'medium' CHECK (stress_level IN ('low', 'medium', 'high')),
  recovery_status TEXT NOT NULL DEFAULT 'moderate' CHECK (recovery_status IN ('critical', 'low', 'moderate', 'optimal')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_physiological_events_user_id ON public.physiological_events(user_id);
CREATE INDEX idx_physiological_events_created_at ON public.physiological_events(created_at DESC);
CREATE INDEX idx_physiological_events_event_type ON public.physiological_events(event_type);

-- Enable RLS
ALTER TABLE public.physiological_events ENABLE ROW LEVEL SECURITY;

-- Service role only write policy (deny-by-default pattern)
-- Read allowed for user's own data
CREATE POLICY "Users can view their own physiological events"
ON public.physiological_events
FOR SELECT
TO authenticated
USING (auth.uid()::text = user_id);

-- Writes via service role only (edge functions)
CREATE POLICY "Service role can manage physiological events"
ON public.physiological_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);