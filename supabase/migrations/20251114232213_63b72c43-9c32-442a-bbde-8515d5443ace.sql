-- Add dynamic practice tracking columns to daily_ritual_completions
ALTER TABLE daily_ritual_completions 
ADD COLUMN IF NOT EXISTS recommended_practice_ids TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS completed_practice_ids TEXT[] DEFAULT '{}';