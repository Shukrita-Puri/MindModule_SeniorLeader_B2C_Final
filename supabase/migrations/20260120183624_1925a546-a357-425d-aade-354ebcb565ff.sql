-- Add source tracking columns to tiny_wins table
ALTER TABLE tiny_wins ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'coach';
ALTER TABLE tiny_wins ADD COLUMN IF NOT EXISTS practice_id TEXT;
ALTER TABLE tiny_wins ADD COLUMN IF NOT EXISTS practice_type TEXT;

-- Add index for source queries
CREATE INDEX IF NOT EXISTS idx_tiny_wins_source ON tiny_wins(source);
CREATE INDEX IF NOT EXISTS idx_tiny_wins_user_source ON tiny_wins(user_id, source);