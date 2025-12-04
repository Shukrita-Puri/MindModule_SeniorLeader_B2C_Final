-- Add columns for direct token storage (vault not accessible via REST API)
ALTER TABLE public.calendar_connections 
ADD COLUMN IF NOT EXISTS access_token TEXT,
ADD COLUMN IF NOT EXISTS refresh_token TEXT;