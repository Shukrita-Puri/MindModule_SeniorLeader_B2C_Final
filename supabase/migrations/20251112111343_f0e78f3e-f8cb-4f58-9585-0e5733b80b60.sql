-- Create content_relevance_feedback table for post-practice ratings
CREATE TABLE IF NOT EXISTS content_relevance_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- What was rated
  content_id TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('soundbath', 'guided-practice', 'micro-practice')),
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('star_rating', 'thumbs_up', 'thumbs_down', 'report_issue')),
  
  -- Star rating (1-5)
  star_rating INTEGER CHECK (star_rating >= 1 AND star_rating <= 5),
  
  -- Context when feedback was given
  session_id UUID,
  trigger_context TEXT,
  
  -- Detailed feedback
  feedback_text TEXT CHECK (char_length(feedback_text) <= 500),
  feedback_reason TEXT,
  
  -- Metadata
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  context_data JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE content_relevance_feedback ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own feedback"
  ON content_relevance_feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own feedback"
  ON content_relevance_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Indexes for analytics queries
CREATE INDEX idx_content_feedback_user_content 
  ON content_relevance_feedback(user_id, content_id, timestamp DESC);
  
CREATE INDEX idx_content_feedback_type 
  ON content_relevance_feedback(content_type, feedback_type);

CREATE INDEX idx_content_feedback_rating 
  ON content_relevance_feedback(star_rating) WHERE star_rating IS NOT NULL;