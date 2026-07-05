ALTER TABLE public.calendar_connections
  ADD COLUMN IF NOT EXISTS consecutive_delay_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.calendar_connections.consecutive_delay_count IS
  'Consecutive transient/rate-limited sync outcomes on this connection. Increments on each sync_delayed, resets to 0 on a successful sync or non-transient outcome. Drives exponential backoff when the provider omits Retry-After.';