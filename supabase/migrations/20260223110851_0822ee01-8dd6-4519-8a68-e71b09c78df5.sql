
-- Add last_login_at to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS last_login_at timestamp with time zone;
