-- Create tables for mental fitness tracking data migration from localStorage

-- Table for tracking all user engagement events
CREATE TABLE IF NOT EXISTS public.user_engagements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'ritual_start', 'session_start', 'checkin', 'micro_response'
  category TEXT, -- 'pause', 'flow', 'renewal', 'general'
  content_id TEXT,
  content_type TEXT, -- 'soundscape', 'guided', 'micro', 'checkin'
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for daily ritual completion tracking
CREATE TABLE IF NOT EXISTS public.daily_ritual_completions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ritual_date DATE NOT NULL,
  soundscape_completed BOOLEAN DEFAULT false,
  soundscape_completed_at TIMESTAMP WITH TIME ZONE,
  guided_practice_completed BOOLEAN DEFAULT false,
  guided_practice_completed_at TIMESTAMP WITH TIME ZONE,
  micro_exercise_completed BOOLEAN DEFAULT false,
  micro_exercise_completed_at TIMESTAMP WITH TIME ZONE,
  completion_status TEXT NOT NULL DEFAULT 'skipped', -- 'full', 'partial', 'skipped'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, ritual_date)
);

-- Table for mental fitness score history
CREATE TABLE IF NOT EXISTS public.mental_fitness_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score_date DATE NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  ritual_completion_score NUMERIC,
  checkin_consistency_score NUMERIC,
  content_engagement_score NUMERIC,
  streak_bonus NUMERIC,
  current_streak INTEGER DEFAULT 0,
  is_baseline_period BOOLEAN DEFAULT false,
  baseline_avg NUMERIC,
  trend TEXT, -- 'up', 'down', 'stable'
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, score_date)
);

-- Table for practice session history
CREATE TABLE IF NOT EXISTS public.practice_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id TEXT NOT NULL,
  content_type TEXT NOT NULL, -- 'soundscape', 'guided', 'micro'
  category TEXT NOT NULL, -- 'pause', 'flow', 'renewal'
  duration_seconds INTEGER,
  completed BOOLEAN DEFAULT false,
  part_of_ritual BOOLEAN DEFAULT false,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  effectiveness_rating INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for daily check-ins
CREATE TABLE IF NOT EXISTS public.daily_checkins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checkin_date DATE NOT NULL,
  outcome TEXT NOT NULL, -- 'pause', 'power-up', 'presence', 'calm', 'ready'
  skipped BOOLEAN DEFAULT false,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, checkin_date)
);

-- Enable RLS on all tables
ALTER TABLE public.user_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_ritual_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mental_fitness_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_checkins ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_engagements
CREATE POLICY "Users can view their own engagements"
  ON public.user_engagements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own engagements"
  ON public.user_engagements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for daily_ritual_completions
CREATE POLICY "Users can view their own ritual completions"
  ON public.daily_ritual_completions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own ritual completions"
  ON public.daily_ritual_completions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ritual completions"
  ON public.daily_ritual_completions FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for mental_fitness_scores
CREATE POLICY "Users can view their own fitness scores"
  ON public.mental_fitness_scores FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own fitness scores"
  ON public.mental_fitness_scores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own fitness scores"
  ON public.mental_fitness_scores FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for practice_sessions
CREATE POLICY "Users can view their own practice sessions"
  ON public.practice_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own practice sessions"
  ON public.practice_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own practice sessions"
  ON public.practice_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for daily_checkins
CREATE POLICY "Users can view their own checkins"
  ON public.daily_checkins FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own checkins"
  ON public.daily_checkins FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_engagements_user_timestamp 
  ON public.user_engagements(user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_daily_ritual_completions_user_date 
  ON public.daily_ritual_completions(user_id, ritual_date DESC);

CREATE INDEX IF NOT EXISTS idx_mental_fitness_scores_user_date 
  ON public.mental_fitness_scores(user_id, score_date DESC);

CREATE INDEX IF NOT EXISTS idx_practice_sessions_user_started 
  ON public.practice_sessions(user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_daily_checkins_user_date 
  ON public.daily_checkins(user_id, checkin_date DESC);

-- Create function for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for daily_ritual_completions
CREATE TRIGGER update_daily_ritual_completions_updated_at
  BEFORE UPDATE ON public.daily_ritual_completions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add helpful comments
COMMENT ON TABLE public.user_engagements IS 'Tracks all user engagement events across the app (ritual starts, session starts, check-ins, micro responses)';
COMMENT ON TABLE public.daily_ritual_completions IS 'Tracks daily ritual completion status with component-level detail';
COMMENT ON TABLE public.mental_fitness_scores IS 'Stores calculated mental fitness scores with breakdown and trends';
COMMENT ON TABLE public.practice_sessions IS 'Tracks individual practice session history with completion status';
COMMENT ON TABLE public.daily_checkins IS 'Stores daily check-in outcomes and timestamps';