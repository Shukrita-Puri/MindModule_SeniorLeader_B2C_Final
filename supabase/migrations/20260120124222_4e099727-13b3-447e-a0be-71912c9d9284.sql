-- Create user_coach_insights table for storing extracted preferences from coach conversations
CREATE TABLE public.user_coach_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  insight_type TEXT NOT NULL CHECK (insight_type IN ('preference', 'goal', 'feedback', 'challenge')),
  insight_content TEXT NOT NULL,
  content_reference TEXT,
  source_session_id UUID REFERENCES public.dialogue_sessions(id) ON DELETE SET NULL,
  extracted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for fast lookups
CREATE INDEX idx_coach_insights_user_active ON public.user_coach_insights(user_id, is_active) WHERE is_active = true;
CREATE INDEX idx_coach_insights_session ON public.user_coach_insights(source_session_id);
CREATE INDEX idx_coach_insights_type ON public.user_coach_insights(user_id, insight_type) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.user_coach_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Service role can manage all coach insights (matches existing Auth0 pattern)
CREATE POLICY "Service role can manage all coach insights"
  ON public.user_coach_insights FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create trigger for automatic updated_at timestamps
CREATE TRIGGER update_coach_insights_updated_at
  BEFORE UPDATE ON public.user_coach_insights
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();