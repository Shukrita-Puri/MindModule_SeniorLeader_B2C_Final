-- Batch C — Atomic dispatch-key claim table.
-- The UNIQUE constraint on dispatch_key is the primary safety mechanism:
-- two concurrent evaluator runs racing on the same decision produce one row.
CREATE TABLE IF NOT EXISTS public.notification_dispatch_claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  dispatch_key TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  slot TEXT,
  local_date TEXT NOT NULL,
  event_reference TEXT,
  week_reference TEXT,
  notification_log_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notification_dispatch_claims_key_unique UNIQUE (dispatch_key)
);

CREATE INDEX IF NOT EXISTS notification_dispatch_claims_user_date_idx
  ON public.notification_dispatch_claims (user_id, local_date);
CREATE INDEX IF NOT EXISTS notification_dispatch_claims_created_at_idx
  ON public.notification_dispatch_claims (created_at DESC);

-- Backend-only: no anon/authenticated grants. Every claim is written by
-- an edge function running under the service role.
GRANT ALL ON public.notification_dispatch_claims TO service_role;

ALTER TABLE public.notification_dispatch_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages dispatch claims"
  ON public.notification_dispatch_claims
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Batch C — Per-device delivery attempts. One row per (notification, device).
-- Parent notification_log continues to carry the "last write wins" state for
-- backward compatibility while consumers migrate to this table.
CREATE TABLE IF NOT EXISTS public.notification_delivery_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_log_id UUID NOT NULL,
  user_id TEXT NOT NULL,
  device_token_id UUID,
  token_hash_prefix TEXT,
  platform TEXT NOT NULL,
  apns_environment TEXT,
  apns_status INTEGER,
  apns_reason TEXT,
  apns_id TEXT,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  permanent_failure BOOLEAN NOT NULL DEFAULT false,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_delivery_attempts_log_idx
  ON public.notification_delivery_attempts (notification_log_id);
CREATE INDEX IF NOT EXISTS notification_delivery_attempts_user_created_idx
  ON public.notification_delivery_attempts (user_id, created_at DESC);

GRANT ALL ON public.notification_delivery_attempts TO service_role;

ALTER TABLE public.notification_delivery_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages delivery attempts"
  ON public.notification_delivery_attempts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
