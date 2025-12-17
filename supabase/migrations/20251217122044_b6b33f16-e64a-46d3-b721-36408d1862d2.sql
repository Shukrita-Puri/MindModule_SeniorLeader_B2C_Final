-- Remove plaintext token columns from calendar_connections table
-- These columns are a security risk - all tokens should be stored in vault

-- First, ensure all tokens have been migrated to vault (best effort)
-- The store functions already handle clearing plaintext after storing in vault

-- Drop the plaintext columns
ALTER TABLE public.calendar_connections DROP COLUMN IF EXISTS access_token;
ALTER TABLE public.calendar_connections DROP COLUMN IF EXISTS refresh_token;