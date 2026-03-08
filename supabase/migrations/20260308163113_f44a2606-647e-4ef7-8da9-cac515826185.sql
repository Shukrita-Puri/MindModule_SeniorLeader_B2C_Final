
-- FUNCTION 1: Atomic increment for signup/conversion counters
CREATE OR REPLACE FUNCTION public.increment_referral_stats(
  p_referrer_id text,
  p_increment_signups boolean DEFAULT false,
  p_increment_conversions boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE user_referrals
  SET 
    total_signups = CASE 
      WHEN p_increment_signups THEN COALESCE(total_signups, 0) + 1 
      ELSE total_signups 
    END,
    total_conversions = CASE 
      WHEN p_increment_conversions THEN COALESCE(total_conversions, 0) + 1 
      ELSE total_conversions 
    END
  WHERE user_id = p_referrer_id;
END;
$$;

-- FUNCTION 2: Atomic credit referrer (with cap + 90-day reset)
CREATE OR REPLACE FUNCTION public.credit_referrer_atomic(
  p_referrer_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_credited integer;
  v_last_reset timestamptz;
  v_three_months_ago timestamptz;
  v_new_credited integer;
  v_new_reset timestamptz;
BEGIN
  v_three_months_ago := now() - interval '90 days';
  
  SELECT COALESCE(credited_months, 0), COALESCE(last_reset_at, now())
  INTO v_current_credited, v_last_reset
  FROM user_referrals
  WHERE user_id = p_referrer_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('credited', false, 'reason', 'referrer_not_found');
  END IF;
  
  IF v_last_reset < v_three_months_ago THEN
    v_new_credited := 0;
    v_new_reset := now();
  ELSE
    v_new_credited := v_current_credited;
    v_new_reset := v_last_reset;
  END IF;
  
  IF v_new_credited >= 6 THEN
    RETURN jsonb_build_object(
      'credited', false,
      'reason', 'at_cap',
      'current_credited', v_new_credited
    );
  END IF;
  
  v_new_credited := v_new_credited + 1;
  
  UPDATE user_referrals
  SET 
    credited_months = v_new_credited,
    last_reset_at = v_new_reset
  WHERE user_id = p_referrer_id;
  
  RETURN jsonb_build_object(
    'credited', true,
    'new_credited', v_new_credited,
    'reset_occurred', v_last_reset < v_three_months_ago
  );
END;
$$;

-- FUNCTION 3: Extend subscription period end on profiles table
CREATE OR REPLACE FUNCTION public.extend_subscription(
  p_user_id text,
  p_months integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE profiles
  SET subscription_current_period_end = COALESCE(subscription_current_period_end, now()) + (p_months || ' months')::interval
  WHERE id = p_user_id
    AND subscription_status = 'active';
END;
$$;
