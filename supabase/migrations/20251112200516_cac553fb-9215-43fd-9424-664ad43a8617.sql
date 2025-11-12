-- Add plan tier and Stripe fields to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_tier text CHECK (plan_tier IN ('pro', 'super_pro'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_status text;

-- Enhance daily_checkins table for skip analytics and data sources
ALTER TABLE daily_checkins ADD COLUMN IF NOT EXISTS data_sources jsonb DEFAULT '{}';
ALTER TABLE daily_checkins ADD COLUMN IF NOT EXISTS energy_balance integer;
ALTER TABLE daily_checkins ADD COLUMN IF NOT EXISTS state_tags text[];

-- Track skip frequency for engagement analytics
CREATE TABLE IF NOT EXISTS checkin_skip_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skip_date date NOT NULL,
  plan_tier text,
  has_wearable boolean DEFAULT false,
  has_calendar boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, skip_date)
);

-- RLS policies for skip events
ALTER TABLE checkin_skip_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own skip events"
  ON checkin_skip_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own skip events"
  ON checkin_skip_events FOR SELECT
  USING (auth.uid() = user_id);