ALTER TABLE public.calendar_connections
  ADD COLUMN IF NOT EXISTS sync_status text,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_error_reason text,
  ADD COLUMN IF NOT EXISTS last_error_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_sync_delayed_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS calendar_connections_sync_status_idx
  ON public.calendar_connections (sync_status);