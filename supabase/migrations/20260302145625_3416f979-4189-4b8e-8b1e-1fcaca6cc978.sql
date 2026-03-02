
-- Add subscription columns to profiles table
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_tier text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS subscription_currency text DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_cancel_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_canceled_at timestamptz;

-- Subscription events log
CREATE TABLE IF NOT EXISTS subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  event_type text NOT NULL,
  from_tier text,
  to_tier text,
  stripe_event_id text,
  stripe_event_type text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_user ON subscription_events(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_type ON subscription_events(event_type);
CREATE INDEX IF NOT EXISTS idx_subscription_events_created ON subscription_events(created_at DESC);

-- Cancellation feedback
CREATE TABLE IF NOT EXISTS cancellation_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  reason text NOT NULL,
  reason_details text,
  retention_offer_shown text,
  retention_offer_accepted boolean DEFAULT false,
  canceled_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cancellation_feedback_user ON cancellation_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_cancellation_feedback_reason ON cancellation_feedback(reason);

-- RLS: service-role-only access (consistent with Auth0 pattern)
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cancellation_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to subscription events"
  ON subscription_events FOR ALL
  USING (auth.role() = 'service_role'::text);

CREATE POLICY "Service role full access to cancellation feedback"
  ON cancellation_feedback FOR ALL
  USING (auth.role() = 'service_role'::text);
