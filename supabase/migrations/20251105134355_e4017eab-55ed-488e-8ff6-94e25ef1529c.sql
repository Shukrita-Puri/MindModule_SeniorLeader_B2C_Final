-- Sprint 1 & 2: Core Backend Tables for Event Tracking and Memory

-- Table: sanctuary_events (stores all sanctuary interaction events)
CREATE TABLE public.sanctuary_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('session_start', 'session_complete', 'session_pause', 'session_skip')),
  content_id TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('soundbath', 'guided-practice', 'micro-practice')),
  category TEXT NOT NULL CHECK (category IN ('pause', 'power-up', 'presence')),
  tags TEXT[] DEFAULT '{}',
  duration_seconds INTEGER,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  context_data JSONB DEFAULT '{}',
  effectiveness_rating INTEGER CHECK (effectiveness_rating >= 1 AND effectiveness_rating <= 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sanctuary_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own events"
ON public.sanctuary_events FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own events"
ON public.sanctuary_events FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_sanctuary_events_user_id ON public.sanctuary_events(user_id);
CREATE INDEX idx_sanctuary_events_timestamp ON public.sanctuary_events(timestamp DESC);
CREATE INDEX idx_sanctuary_events_content_type ON public.sanctuary_events(content_type);
CREATE INDEX idx_sanctuary_events_tags ON public.sanctuary_events USING GIN(tags);

-- Table: user_preferences (learned patterns and preferences)
CREATE TABLE public.user_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  preferred_times JSONB DEFAULT '{}',
  effective_content_types JSONB DEFAULT '{}',
  favorite_content_ids TEXT[] DEFAULT '{}',
  energy_patterns JSONB DEFAULT '{}',
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own preferences"
ON public.user_preferences FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
ON public.user_preferences FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
ON public.user_preferences FOR UPDATE
USING (auth.uid() = user_id);

-- Table: energy_snapshots (computed energy states over time)
CREATE TABLE public.energy_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  energy_balance DECIMAL(5,2),
  dominant_state TEXT,
  pause_percentage DECIMAL(5,2),
  powerup_percentage DECIMAL(5,2),
  presence_percentage DECIMAL(5,2),
  total_sessions INTEGER DEFAULT 0,
  oura_readiness DECIMAL(5,2),
  calendar_density INTEGER,
  computed_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);

-- Enable RLS
ALTER TABLE public.energy_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own snapshots"
ON public.energy_snapshots FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own snapshots"
ON public.energy_snapshots FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own snapshots"
ON public.energy_snapshots FOR UPDATE
USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_energy_snapshots_user_date ON public.energy_snapshots(user_id, snapshot_date DESC);

-- Sprint 4: Calendar Integration Tables

-- Table: calendar_connections (OAuth tokens for calendar)
CREATE TABLE public.calendar_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  last_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own calendar connections"
ON public.calendar_connections FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own calendar connections"
ON public.calendar_connections FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own calendar connections"
ON public.calendar_connections FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own calendar connections"
ON public.calendar_connections FOR DELETE
USING (auth.uid() = user_id);

-- Table: calendar_events (event metadata)
CREATE TABLE public.calendar_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  title TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  attendees_count INTEGER DEFAULT 0,
  is_organizer BOOLEAN DEFAULT false,
  is_recurring BOOLEAN DEFAULT false,
  event_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, external_id)
);

-- Enable RLS
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own calendar events"
ON public.calendar_events FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own calendar events"
ON public.calendar_events FOR ALL
USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_calendar_events_user_time ON public.calendar_events(user_id, start_time DESC);

-- Sprint 4: Oura Integration Tables

-- Table: oura_connections (OAuth tokens for Oura)
CREATE TABLE public.oura_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  last_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.oura_connections ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own oura connections"
ON public.oura_connections FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own oura connections"
ON public.oura_connections FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own oura connections"
ON public.oura_connections FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own oura connections"
ON public.oura_connections FOR DELETE
USING (auth.uid() = user_id);

-- Table: oura_daily_data (daily summaries)
CREATE TABLE public.oura_daily_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary_date DATE NOT NULL,
  readiness_score INTEGER,
  sleep_score INTEGER,
  activity_score INTEGER,
  hrv DECIMAL(6,2),
  resting_heart_rate INTEGER,
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, summary_date)
);

-- Enable RLS
ALTER TABLE public.oura_daily_data ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own oura data"
ON public.oura_daily_data FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own oura data"
ON public.oura_daily_data FOR ALL
USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_oura_daily_data_user_date ON public.oura_daily_data(user_id, summary_date DESC);