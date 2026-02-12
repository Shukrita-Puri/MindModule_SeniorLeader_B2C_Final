
-- Create jit_preferences table
CREATE TABLE public.jit_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_type TEXT,
  action TEXT NOT NULL,
  event_title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.jit_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own jit_preferences"
  ON public.jit_preferences FOR SELECT
  USING (user_id = auth.jwt()->>'sub');

CREATE POLICY "Users can insert their own jit_preferences"
  ON public.jit_preferences FOR INSERT
  WITH CHECK (user_id = auth.jwt()->>'sub');

CREATE POLICY "Users can delete their own jit_preferences"
  ON public.jit_preferences FOR DELETE
  USING (user_id = auth.jwt()->>'sub');

-- Create behavior_logs table
CREATE TABLE public.behavior_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  context_event_id UUID,
  event_title TEXT,
  behavior_type TEXT NOT NULL,
  control_level TEXT,
  energy_after TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.behavior_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own behavior_logs"
  ON public.behavior_logs FOR SELECT
  USING (user_id = auth.jwt()->>'sub');

CREATE POLICY "Users can insert their own behavior_logs"
  ON public.behavior_logs FOR INSERT
  WITH CHECK (user_id = auth.jwt()->>'sub');

CREATE POLICY "Users can update their own behavior_logs"
  ON public.behavior_logs FOR UPDATE
  USING (user_id = auth.jwt()->>'sub');

CREATE POLICY "Users can delete their own behavior_logs"
  ON public.behavior_logs FOR DELETE
  USING (user_id = auth.jwt()->>'sub');

-- Create calendar_event_classifications table
CREATE TABLE public.calendar_event_classifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  calendar_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  stakes_level TEXT NOT NULL DEFAULT 'low',
  classified_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_event_classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own calendar_event_classifications"
  ON public.calendar_event_classifications FOR SELECT
  USING (user_id = auth.jwt()->>'sub');

CREATE POLICY "Users can insert their own calendar_event_classifications"
  ON public.calendar_event_classifications FOR INSERT
  WITH CHECK (user_id = auth.jwt()->>'sub');

CREATE POLICY "Users can update their own calendar_event_classifications"
  ON public.calendar_event_classifications FOR UPDATE
  USING (user_id = auth.jwt()->>'sub');

CREATE POLICY "Users can delete their own calendar_event_classifications"
  ON public.calendar_event_classifications FOR DELETE
  USING (user_id = auth.jwt()->>'sub');

-- Add clarity_level and confidence_level to daily_checkins
ALTER TABLE public.daily_checkins
  ADD COLUMN IF NOT EXISTS clarity_level INTEGER,
  ADD COLUMN IF NOT EXISTS confidence_level INTEGER;
