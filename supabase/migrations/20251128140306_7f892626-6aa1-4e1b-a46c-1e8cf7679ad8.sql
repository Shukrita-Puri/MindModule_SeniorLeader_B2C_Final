-- Fix has_role to avoid text = uuid operator mismatch
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id::text
      AND role = _role
  );
$function$;

-- Adjust RLS on sanctuary_content so non-admin users can read active content
-- while only admins can modify it.

-- Drop the old restrictive ALL policy that blocked SELECTs for non-admins
DROP POLICY IF EXISTS "Only admins can modify content" ON public.sanctuary_content;

-- Ensure existing read policy remains: anyone can view active content
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sanctuary_content'
      AND policyname = 'Anyone can view active content'
  ) THEN
    CREATE POLICY "Anyone can view active content" ON public.sanctuary_content
      AS RESTRICTIVE
      FOR SELECT
      USING (is_active = true);
  END IF;
END$$;

-- Create separate restrictive policies for write operations limited to admins
CREATE POLICY "Admins can insert content" ON public.sanctuary_content
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update content" ON public.sanctuary_content
  AS RESTRICTIVE
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete content" ON public.sanctuary_content
  AS RESTRICTIVE
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'));