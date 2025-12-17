-- Remove duplicate INSERT policy
DROP POLICY IF EXISTS "Users can only insert own profile" ON public.profiles;

-- Remove duplicate UPDATE policy  
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Remove duplicate SELECT policy
DROP POLICY IF EXISTS "Users can view own full profile" ON public.profiles;