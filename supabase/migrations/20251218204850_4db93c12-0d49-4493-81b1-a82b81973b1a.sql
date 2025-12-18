-- Add encrypted token storage columns to calendar_connections
ALTER TABLE public.calendar_connections
  ADD COLUMN IF NOT EXISTS access_token_enc TEXT,
  ADD COLUMN IF NOT EXISTS refresh_token_enc TEXT,
  ADD COLUMN IF NOT EXISTS token_iv TEXT,
  ADD COLUMN IF NOT EXISTS token_enc_v INTEGER DEFAULT 1;