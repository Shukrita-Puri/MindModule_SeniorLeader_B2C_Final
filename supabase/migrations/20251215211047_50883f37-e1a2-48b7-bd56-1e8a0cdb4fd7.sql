-- Create session_feedback table to persist dialogue reflection feedback
CREATE TABLE session_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  session_id UUID REFERENCES dialogue_sessions(id) ON DELETE CASCADE,
  resonance TEXT NOT NULL,
  deeper_focus TEXT,
  next_session_focus TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE session_feedback ENABLE ROW LEVEL SECURITY;

-- Policy: Users can insert their own feedback
CREATE POLICY "Users can insert own feedback" ON session_feedback
  FOR INSERT WITH CHECK (true);

-- Policy: Users can read their own feedback  
CREATE POLICY "Users can read own feedback" ON session_feedback
  FOR SELECT USING (true);