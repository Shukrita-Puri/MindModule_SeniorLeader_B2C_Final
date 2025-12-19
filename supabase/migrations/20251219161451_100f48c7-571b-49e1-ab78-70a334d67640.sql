-- Cleanup: Remove auth.uid() policies that don't work with Auth0
-- Access is via Edge Functions (service role) only

-- dialogue_interventions: remove auth.uid() policies
DROP POLICY IF EXISTS "Users can insert their own dialogue interventions" ON public.dialogue_interventions;
DROP POLICY IF EXISTS "Users can update their own dialogue interventions" ON public.dialogue_interventions;
DROP POLICY IF EXISTS "Users can view their own dialogue interventions" ON public.dialogue_interventions;

-- detected_signals: remove auth.uid() policies
DROP POLICY IF EXISTS "Users can insert their own detected signals" ON public.detected_signals;
DROP POLICY IF EXISTS "Users can view their own detected signals" ON public.detected_signals;