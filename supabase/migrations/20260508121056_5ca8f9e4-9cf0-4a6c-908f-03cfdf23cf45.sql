
-- Add provider column to calendar_events for multi-provider scoping
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS provider text;
UPDATE public.calendar_events SET provider = 'google' WHERE provider IS NULL;
ALTER TABLE public.calendar_events ALTER COLUMN provider SET DEFAULT 'google';
ALTER TABLE public.calendar_events ALTER COLUMN provider SET NOT NULL;

-- Drop old uniqueness on (user_id, external_id) and replace with provider-scoped uniqueness
ALTER TABLE public.calendar_events DROP CONSTRAINT IF EXISTS calendar_events_user_external_unique;
ALTER TABLE public.calendar_events DROP CONSTRAINT IF EXISTS calendar_events_user_id_external_id_key;
DROP INDEX IF EXISTS public.calendar_events_user_external_unique;
DROP INDEX IF EXISTS public.calendar_events_user_id_external_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_user_provider_external_key
  ON public.calendar_events (user_id, provider, external_id);

CREATE INDEX IF NOT EXISTS idx_calendar_events_user_provider_time
  ON public.calendar_events (user_id, provider, start_time DESC);

-- Allow 'apple' as a calendar_connections provider (native iOS EventKit)
ALTER TABLE public.calendar_connections DROP CONSTRAINT IF EXISTS calendar_connections_provider_check;
ALTER TABLE public.calendar_connections
  ADD CONSTRAINT calendar_connections_provider_check
  CHECK (provider = ANY (ARRAY['google'::text, 'microsoft'::text, 'apple'::text]));
