
-- Add session_period to daily_ritual_completions for per-period progress tracking
ALTER TABLE public.daily_ritual_completions 
ADD COLUMN IF NOT EXISTS session_period text;

-- Add dismissed to jit_preferences to distinguish snooze from permanent dismiss
ALTER TABLE public.jit_preferences 
ADD COLUMN IF NOT EXISTS dismissed boolean DEFAULT false;
