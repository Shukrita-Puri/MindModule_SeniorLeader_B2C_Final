-- 1. Add founding_member fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS founding_member boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS founding_member_granted_at timestamptz NULL;

-- 2. Create atomic try_assign_founding_member function
CREATE OR REPLACE FUNCTION public.try_assign_founding_member(p_user_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_already boolean;
  v_count integer;
BEGIN
  SELECT founding_member INTO v_already
  FROM profiles
  WHERE id = p_user_id;

  IF v_already IS TRUE THEN
    RETURN true;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('founding_member_cap'));
  
  SELECT COUNT(*) INTO v_count
  FROM profiles
  WHERE founding_member = true;

  IF v_count >= 100 THEN
    RETURN false;
  END IF;

  UPDATE profiles
  SET founding_member = true,
      founding_member_granted_at = now()
  WHERE id = p_user_id;

  RETURN true;
END;
$$;