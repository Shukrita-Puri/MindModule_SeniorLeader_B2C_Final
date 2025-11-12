-- Drop the public_profiles view that grants access to anonymous users
-- This view uses SECURITY DEFINER-like behavior which bypasses RLS
DROP VIEW IF EXISTS public_profiles;

-- Revoke any remaining grants (defensive cleanup)
-- Note: This will error if view doesn't exist, but that's fine
DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON public_profiles FROM authenticated, anon';
EXCEPTION
  WHEN undefined_table THEN
    NULL; -- Ignore error if view doesn't exist
END
$$;

-- Add comment on profiles table to clarify access pattern
COMMENT ON TABLE profiles IS 'User profiles with RLS protection. Users can only view their own profile via auth.uid() = id policy. For cross-user visibility, query this table directly with proper authentication.';