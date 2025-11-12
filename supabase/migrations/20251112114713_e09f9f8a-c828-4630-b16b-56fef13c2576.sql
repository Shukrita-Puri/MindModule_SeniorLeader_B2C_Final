-- Create micro intervention events tracking table
CREATE TABLE micro_intervention_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Event tracking
  event_type TEXT NOT NULL CHECK (event_type IN ('nudge_sent', 'nudge_clicked', 'nudge_dismissed', 'nudge_ignored')),
  intervention_id TEXT NOT NULL,
  intervention_type TEXT NOT NULL,

  -- Context
  trigger_event_id TEXT,
  trigger_reason TEXT,
  timing_window TEXT,
  urgency_level TEXT CHECK (urgency_level IN ('critical', 'high', 'medium', 'low')),

  -- Recommended content
  recommended_content_id TEXT,
  recommended_content_type TEXT,

  -- Response tracking
  time_to_action_seconds INTEGER,
  dismissed_reason TEXT,

  -- Metadata
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  context_data JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE micro_intervention_events ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own intervention events"
  ON micro_intervention_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own intervention events"
  ON micro_intervention_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Indexes for analytics queries
CREATE INDEX idx_micro_intervention_user_timestamp 
  ON micro_intervention_events(user_id, timestamp DESC);
CREATE INDEX idx_micro_intervention_type 
  ON micro_intervention_events(intervention_type, event_type);

-- Create content usage analytics materialized view
CREATE MATERIALIZED VIEW content_usage_analytics AS
SELECT 
  user_id,
  content_id,
  content_type,
  category,

  -- Play metrics
  COUNT(*) FILTER (WHERE event_type = 'session_start') AS play_count,
  COUNT(*) FILTER (WHERE event_type = 'session_complete') AS completion_count,
  COUNT(*) FILTER (WHERE event_type = 'session_skip') AS skip_count,

  -- Completion rate
  CASE 
    WHEN COUNT(*) FILTER (WHERE event_type = 'session_start') > 0 
    THEN (COUNT(*) FILTER (WHERE event_type = 'session_complete')::FLOAT / 
          COUNT(*) FILTER (WHERE event_type = 'session_start')::FLOAT * 100)
    ELSE 0 
  END AS completion_rate_percent,

  -- Skip rate
  CASE 
    WHEN COUNT(*) FILTER (WHERE event_type = 'session_start') > 0 
    THEN (COUNT(*) FILTER (WHERE event_type = 'session_skip')::FLOAT / 
          COUNT(*) FILTER (WHERE event_type = 'session_start')::FLOAT * 100)
    ELSE 0 
  END AS skip_rate_percent,

  -- Average session duration
  AVG(duration_seconds) FILTER (WHERE event_type = 'session_complete') AS avg_session_length_seconds,

  -- Last played
  MAX(timestamp) AS last_played_at,

  -- Date calculated
  CURRENT_DATE AS calculated_date

FROM sanctuary_events
WHERE event_type IN ('session_start', 'session_complete', 'session_skip')
GROUP BY user_id, content_id, content_type, category;

-- Index for analytics queries
CREATE INDEX idx_content_analytics_user ON content_usage_analytics(user_id, play_count DESC);