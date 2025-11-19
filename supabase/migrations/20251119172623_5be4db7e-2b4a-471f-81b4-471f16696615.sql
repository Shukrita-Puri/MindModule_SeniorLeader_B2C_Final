-- Remove deprecated subscription columns
ALTER TABLE profiles 
  DROP COLUMN IF EXISTS plan_tier,
  DROP COLUMN IF EXISTS stripe_customer_id,
  DROP COLUMN IF EXISTS stripe_subscription_id;

-- Ensure subscription_status column exists with correct type
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'subscription_status'
  ) THEN
    ALTER TABLE profiles ADD COLUMN subscription_status TEXT;
  END IF;
END $$;

-- Ensure subscription_plan column exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'subscription_plan'
  ) THEN
    ALTER TABLE profiles ADD COLUMN subscription_plan TEXT;
  END IF;
END $$;

-- Add constraint for valid subscription_status values
ALTER TABLE profiles 
  DROP CONSTRAINT IF EXISTS profiles_subscription_status_check;

ALTER TABLE profiles 
  ADD CONSTRAINT profiles_subscription_status_check 
  CHECK (subscription_status IN ('active', 'inactive', 'trial') OR subscription_status IS NULL);

-- Set default values for existing users
UPDATE profiles 
SET 
  subscription_status = COALESCE(subscription_status, 'trial'),
  subscription_plan = COALESCE(subscription_plan, 'monthly')
WHERE subscription_status IS NULL OR subscription_plan IS NULL;

-- Remove plan_tier from checkin_skip_events if it exists
ALTER TABLE checkin_skip_events 
  DROP COLUMN IF EXISTS plan_tier;