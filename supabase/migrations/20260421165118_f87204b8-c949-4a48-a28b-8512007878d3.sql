ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS healthkit_anchor TEXT;