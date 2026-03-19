ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS watch_connection_status text DEFAULT 'disconnected',
  ADD COLUMN IF NOT EXISTS watch_sync_status text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS watch_last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS watch_last_sample_at timestamptz,
  ADD COLUMN IF NOT EXISTS watch_last_error text,
  ADD COLUMN IF NOT EXISTS watch_last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS watch_disconnected_at timestamptz,
  ADD COLUMN IF NOT EXISTS watch_status_updated_at timestamptz DEFAULT now()