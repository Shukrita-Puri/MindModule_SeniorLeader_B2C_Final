ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS watch_connection_status text DEFAULT 'disconnected',
  ADD COLUMN IF NOT EXISTS watch_sync_status text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS watch_last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS watch_last_sample_at timestamptz,
  ADD COLUMN IF NOT EXISTS watch_last_error text,
  ADD COLUMN IF NOT EXISTS watch_last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS watch_disconnected_at timestamptz,
  ADD COLUMN IF NOT EXISTS watch_status_updated_at timestamptz DEFAULT now();

UPDATE public.user_integrations
SET
  watch_connection_status = CASE
    WHEN watch_type IS NOT NULL THEN COALESCE(watch_connection_status, 'connected')
    ELSE COALESCE(watch_connection_status, 'disconnected')
  END,
  watch_sync_status = COALESCE(watch_sync_status, 'unknown'),
  watch_status_updated_at = COALESCE(watch_status_updated_at, updated_at, now())
WHERE
  watch_connection_status IS NULL
  OR watch_sync_status IS NULL
  OR watch_status_updated_at IS NULL;
