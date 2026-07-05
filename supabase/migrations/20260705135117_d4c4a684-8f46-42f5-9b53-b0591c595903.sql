ALTER TABLE public.calendar_connections
  ADD COLUMN IF NOT EXISTS webhook_client_state TEXT,
  ADD COLUMN IF NOT EXISTS webhook_last_error TEXT,
  ADD COLUMN IF NOT EXISTS webhook_last_error_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS webhook_last_registered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS calendar_connections_provider_webhook_expiration_idx
  ON public.calendar_connections (provider, webhook_expiration)
  WHERE webhook_expiration IS NOT NULL;