
-- Add tracking columns to daily_themes for Outer Readiness Brief v3.0
ALTER TABLE public.daily_themes 
  ADD COLUMN IF NOT EXISTS lean_on TEXT,
  ADD COLUMN IF NOT EXISTS watch_for TEXT,
  ADD COLUMN IF NOT EXISTS inner_readiness_score INTEGER,
  ADD COLUMN IF NOT EXISTS archetype TEXT;
