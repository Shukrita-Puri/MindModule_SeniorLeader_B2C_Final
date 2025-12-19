-- Phase 1 Cleanup: Remove vestigial auth.uid() policies that don't work with Auth0
-- Access is now via Edge Functions (service role) only for these tables

-- calendar_connections: remove auth.uid() policies (already has service role policy)
DROP POLICY IF EXISTS "Users can view their own calendar connections" ON public.calendar_connections;
DROP POLICY IF EXISTS "Users can insert their own calendar connections" ON public.calendar_connections;
DROP POLICY IF EXISTS "Users can update their own calendar connections" ON public.calendar_connections;
DROP POLICY IF EXISTS "Users can delete their own calendar connections" ON public.calendar_connections;

-- calendar_events: remove auth.uid() policies (already has service role policy)
DROP POLICY IF EXISTS "Users can view their own calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Users can insert their own calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Users can update their own calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Users can delete their own calendar events" ON public.calendar_events;

-- dialogue_analytics: remove auth.uid() policies (already has service role policy)
DROP POLICY IF EXISTS "Users can view own analytics" ON public.dialogue_analytics;
DROP POLICY IF EXISTS "Users can insert own analytics" ON public.dialogue_analytics;

-- Add service role policies for practice_sessions and daily_ritual_completions
-- First, add service role policies so edge functions can access them
CREATE POLICY "Service role can manage all practice sessions"
ON public.practice_sessions
FOR ALL
USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage all ritual completions"
ON public.daily_ritual_completions
FOR ALL
USING (auth.role() = 'service_role');

-- Add service role policies for user_engagements and checkin_skip_events
CREATE POLICY "Service role can manage all user engagements"
ON public.user_engagements
FOR ALL
USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage all checkin skip events"
ON public.checkin_skip_events
FOR ALL
USING (auth.role() = 'service_role');

-- Add service role policy for daily_checkins
CREATE POLICY "Service role can manage all daily checkins"
ON public.daily_checkins
FOR ALL
USING (auth.role() = 'service_role');

-- Add service role policy for user_achievements (for the new edge function)
CREATE POLICY "Service role can manage all user achievements"
ON public.user_achievements
FOR ALL
USING (auth.role() = 'service_role');

-- Add service role policy for certificate_requests
CREATE POLICY "Service role can manage all certificate requests"
ON public.certificate_requests
FOR ALL
USING (auth.role() = 'service_role');