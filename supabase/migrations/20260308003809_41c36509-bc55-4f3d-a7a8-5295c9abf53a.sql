
-- Fix overly permissive RLS policies on 3 tables

-- 1. daily_themes: drop permissive policy, add service-role-only + user SELECT
DROP POLICY IF EXISTS "Service role full access to daily_themes" ON public.daily_themes;
CREATE POLICY "Service role full access to daily_themes" ON public.daily_themes
  FOR ALL TO authenticated
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);
CREATE POLICY "Users can read own daily_themes" ON public.daily_themes
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()::text));

-- 2. user_coach_insights: drop permissive policy, add service-role-only + user SELECT
DROP POLICY IF EXISTS "Service role can manage all coach insights" ON public.user_coach_insights;
CREATE POLICY "Service role can manage all coach insights" ON public.user_coach_insights
  FOR ALL TO authenticated
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);
CREATE POLICY "Users can read own coach insights" ON public.user_coach_insights
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()::text));

-- 3. user_integrations: drop permissive policy, add service-role-only + user SELECT
DROP POLICY IF EXISTS "Service role full access" ON public.user_integrations;
CREATE POLICY "Service role full access to user_integrations" ON public.user_integrations
  FOR ALL TO authenticated
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);
CREATE POLICY "Users can read own integrations" ON public.user_integrations
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()::text));
