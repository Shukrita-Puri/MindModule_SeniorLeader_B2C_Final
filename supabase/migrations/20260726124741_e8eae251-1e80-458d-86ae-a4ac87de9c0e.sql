-- 1. Provider-aware entitlement fields on profiles (additive; Stripe untouched)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_provider text,
  ADD COLUMN IF NOT EXISTS apple_original_transaction_id text,
  ADD COLUMN IF NOT EXISTS apple_product_id text,
  ADD COLUMN IF NOT EXISTS apple_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS apple_environment text,
  ADD COLUMN IF NOT EXISTS apple_auto_renew boolean,
  ADD COLUMN IF NOT EXISTS apple_revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS apple_last_verified_at timestamptz;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_subscription_provider_chk;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_provider_chk
  CHECK (subscription_provider IS NULL OR subscription_provider IN ('stripe','apple','beta','manual'));

CREATE INDEX IF NOT EXISTS profiles_apple_original_txn_idx
  ON public.profiles (apple_original_transaction_id)
  WHERE apple_original_transaction_id IS NOT NULL;

-- Backfill: anyone with an existing Stripe subscription is provider='stripe'
UPDATE public.profiles
SET subscription_provider = 'stripe'
WHERE subscription_provider IS NULL
  AND (stripe_subscription_id IS NOT NULL OR stripe_customer_id IS NOT NULL);

-- 2. Idempotent Apple transaction ledger
CREATE TABLE IF NOT EXISTS public.apple_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  transaction_id text NOT NULL,
  original_transaction_id text NOT NULL,
  product_id text NOT NULL,
  environment text,
  purchase_date timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  is_upgraded boolean NOT NULL DEFAULT false,
  auto_renew_status boolean,
  notification_type text,
  notification_subtype text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS apple_transactions_txn_unique
  ON public.apple_transactions (transaction_id);
CREATE INDEX IF NOT EXISTS apple_transactions_user_idx
  ON public.apple_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS apple_transactions_original_idx
  ON public.apple_transactions (original_transaction_id);

GRANT SELECT ON public.apple_transactions TO authenticated;
GRANT ALL ON public.apple_transactions TO service_role;

ALTER TABLE public.apple_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages apple transactions" ON public.apple_transactions;
CREATE POLICY "Service role manages apple transactions"
ON public.apple_transactions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP TRIGGER IF EXISTS apple_transactions_set_updated_at ON public.apple_transactions;
CREATE TRIGGER apple_transactions_set_updated_at
BEFORE UPDATE ON public.apple_transactions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();