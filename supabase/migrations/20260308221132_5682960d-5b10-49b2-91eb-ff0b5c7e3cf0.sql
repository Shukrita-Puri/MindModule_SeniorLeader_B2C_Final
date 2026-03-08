-- Drop existing unique constraint on (user_id, ritual_date) 
ALTER TABLE daily_ritual_completions 
  DROP CONSTRAINT IF EXISTS daily_ritual_completions_user_id_ritual_date_key;

-- Backfill any null session_period values to 'morning' to avoid constraint violations
UPDATE daily_ritual_completions 
SET session_period = 'morning' 
WHERE session_period IS NULL;

-- Make session_period NOT NULL with default
ALTER TABLE daily_ritual_completions 
  ALTER COLUMN session_period SET DEFAULT 'morning',
  ALTER COLUMN session_period SET NOT NULL;

-- Add new unique constraint including session_period to support multiple plans per day
ALTER TABLE daily_ritual_completions 
  ADD CONSTRAINT daily_ritual_completions_user_id_ritual_date_period_key 
  UNIQUE (user_id, ritual_date, session_period);