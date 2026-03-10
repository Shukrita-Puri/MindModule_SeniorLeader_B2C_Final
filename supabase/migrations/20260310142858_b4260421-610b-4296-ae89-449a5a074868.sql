-- Add beta tester fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS beta_user boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS beta_expires_at timestamptz DEFAULT NULL;

-- Create function to enforce expired trials (called during profile sync)
CREATE OR REPLACE FUNCTION public.enforce_trial_expiry(p_user_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE profiles
  SET subscription_status = 'canceled',
      subscription_tier = 'none'
  WHERE id = p_user_id
    AND subscription_tier = 'trial'
    AND trial_ends_at IS NOT NULL
    AND trial_ends_at < now()
    AND (subscription_status IS NULL OR subscription_status NOT IN ('active'));
END;
$$;