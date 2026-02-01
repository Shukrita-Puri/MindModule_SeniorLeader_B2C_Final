-- Add psychological dimension columns to tiny_wins table
ALTER TABLE public.tiny_wins ADD COLUMN IF NOT EXISTS sentiment TEXT;
ALTER TABLE public.tiny_wins ADD COLUMN IF NOT EXISTS primary_emotion TEXT;
ALTER TABLE public.tiny_wins ADD COLUMN IF NOT EXISTS secondary_emotion TEXT;
ALTER TABLE public.tiny_wins ADD COLUMN IF NOT EXISTS agency_type TEXT;
ALTER TABLE public.tiny_wins ADD COLUMN IF NOT EXISTS regulation_level TEXT;
ALTER TABLE public.tiny_wins ADD COLUMN IF NOT EXISTS growth_signal TEXT;
ALTER TABLE public.tiny_wins ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;

-- Add index for efficient querying by dimension
CREATE INDEX IF NOT EXISTS idx_tiny_wins_primary_emotion ON public.tiny_wins (primary_emotion);
CREATE INDEX IF NOT EXISTS idx_tiny_wins_agency_type ON public.tiny_wins (agency_type);
CREATE INDEX IF NOT EXISTS idx_tiny_wins_growth_signal ON public.tiny_wins (growth_signal);