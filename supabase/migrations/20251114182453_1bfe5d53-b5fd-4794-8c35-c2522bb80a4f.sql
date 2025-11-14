-- Add recommended_practices_count column to track dynamic ritual size
ALTER TABLE daily_ritual_completions 
ADD COLUMN recommended_practices_count integer DEFAULT 3;