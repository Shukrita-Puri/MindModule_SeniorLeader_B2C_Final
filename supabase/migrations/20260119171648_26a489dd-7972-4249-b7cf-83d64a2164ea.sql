-- Create tiny_wins table for storing user's daily wins from Integrate flow
CREATE TABLE tiny_wins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  session_id UUID REFERENCES dialogue_sessions(id),
  win_content TEXT NOT NULL,
  win_date DATE NOT NULL DEFAULT CURRENT_DATE,
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE tiny_wins ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Service role can manage all tiny wins" ON tiny_wins
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view their own tiny wins" ON tiny_wins
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert their own tiny wins" ON tiny_wins
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- Index for efficient lookups
CREATE INDEX idx_tiny_wins_user_date ON tiny_wins(user_id, win_date DESC);