ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS referral_code_used text,
  ADD COLUMN IF NOT EXISTS referral_code_entered_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_referral_code_used 
  ON profiles(referral_code_used);