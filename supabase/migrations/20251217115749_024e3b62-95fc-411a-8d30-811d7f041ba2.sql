-- Ensure RLS is enabled on profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop any existing overly permissive policies
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;

-- Create restrictive policies: users can only access their own profile
CREATE POLICY "Users can view their own profile"
ON public.profiles
FOR SELECT
USING ((auth.uid())::text = id);

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
USING ((auth.uid())::text = id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
WITH CHECK ((auth.uid())::text = id);

-- Allow service role full access for admin operations
CREATE POLICY "Service role can manage all profiles"
ON public.profiles
FOR ALL
USING (auth.role() = 'service_role');