-- Idempotency ledger for App Store Server Notifications V2
CREATE TABLE IF NOT EXISTS public.apple_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_uuid text NOT NULL,
  notification_type text NOT NULL,
  notification_subtype text,
  original_transaction_id text,
  transaction_id text,
  user_id text,
  environment text,
  signed_date timestamp with time zone,
  processed_at timestamp with time zone,
  status text NOT NULL DEFAULT 'received',
  detail jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS apple_notification_events_uuid_unique
  ON public.apple_notification_events (notification_uuid);
CREATE INDEX IF NOT EXISTS apple_notification_events_user_idx
  ON public.apple_notification_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS apple_notification_events_original_idx
  ON public.apple_notification_events (original_transaction_id);

GRANT ALL ON public.apple_notification_events TO service_role;

ALTER TABLE public.apple_notification_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages apple notification events" ON public.apple_notification_events;
CREATE POLICY "Service role manages apple notification events"
  ON public.apple_notification_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS apple_notification_events_set_updated_at ON public.apple_notification_events;
CREATE TRIGGER apple_notification_events_set_updated_at
  BEFORE UPDATE ON public.apple_notification_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Additional Apple lifecycle fields on profiles (Stripe columns untouched)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS apple_last_notification_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS apple_last_notification_type text,
  ADD COLUMN IF NOT EXISTS apple_grace_period_expires_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS apple_cancellation_date timestamp with time zone,
  ADD COLUMN IF NOT EXISTS apple_transaction_id text;

CREATE INDEX IF NOT EXISTS profiles_apple_original_txn_idx
  ON public.profiles (apple_original_transaction_id);

-- Store grace period + renewal info on the transaction ledger
ALTER TABLE public.apple_transactions
  ADD COLUMN IF NOT EXISTS grace_period_expires_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS renewal_product_id text,
  ADD COLUMN IF NOT EXISTS notification_uuid text,
  ADD COLUMN IF NOT EXISTS signed_date timestamp with time zone;