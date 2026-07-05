ALTER TABLE public.calendar_connections
  ADD COLUMN IF NOT EXISTS retry_after_seconds integer,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

CREATE INDEX IF NOT EXISTS calendar_connections_next_retry_at_idx
  ON public.calendar_connections (next_retry_at)
  WHERE next_retry_at IS NOT NULL;

COMMENT ON COLUMN public.calendar_connections.retry_after_seconds IS
  'Provider-supplied Retry-After hint (or bounded default) from the most recent sync_delayed outcome. Cleared on successful sync.';
COMMENT ON COLUMN public.calendar_connections.next_retry_at IS
  'Absolute UTC timestamp at which the scheduler is allowed to retry this connection. Set on sync_delayed; cleared on successful sync.';