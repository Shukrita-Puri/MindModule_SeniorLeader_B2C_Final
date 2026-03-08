
-- 1. Add display_name and auth_name to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS auth_name text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name text;

-- Backfill existing data
UPDATE profiles SET auth_name = COALESCE(full_name, email), display_name = COALESCE(full_name, email) WHERE auth_name IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_display_name ON profiles(display_name);

-- 2. Create user_referrals table
CREATE TABLE IF NOT EXISTS user_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE,
  referral_code text UNIQUE NOT NULL,
  referral_link text NOT NULL,
  total_signups integer DEFAULT 0,
  total_conversions integer DEFAULT 0,
  credited_months integer DEFAULT 0,
  last_reset_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE user_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on user_referrals" ON user_referrals FOR ALL USING (auth.role() = 'service_role'::text);
CREATE INDEX IF NOT EXISTS idx_user_referrals_code ON user_referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_user_referrals_user ON user_referrals(user_id);

-- 3. Create referral_conversions table
CREATE TABLE IF NOT EXISTS referral_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id text NOT NULL,
  referee_id text NOT NULL UNIQUE,
  referral_code text NOT NULL,
  signed_up_at timestamptz DEFAULT now(),
  converted_to_pro_at timestamptz,
  credited_to_referrer boolean DEFAULT false,
  credited_at timestamptz
);
ALTER TABLE referral_conversions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on referral_conversions" ON referral_conversions FOR ALL USING (auth.role() = 'service_role'::text);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_referrer ON referral_conversions(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_code ON referral_conversions(referral_code);
