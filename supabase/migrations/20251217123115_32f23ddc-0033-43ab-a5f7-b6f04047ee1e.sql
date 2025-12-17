-- Fix calendar_events RLS policies to restrict access to user's own events only
-- Drop overly permissive policies
DROP POLICY IF EXISTS "App can view calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "App can manage calendar events" ON public.calendar_events;

-- Create restrictive policies that only allow users to access their own calendar events
CREATE POLICY "Users can view their own calendar events" 
ON public.calendar_events 
FOR SELECT 
USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can insert their own calendar events" 
ON public.calendar_events 
FOR INSERT 
WITH CHECK ((auth.uid())::text = user_id);

CREATE POLICY "Users can update their own calendar events" 
ON public.calendar_events 
FOR UPDATE 
USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can delete their own calendar events" 
ON public.calendar_events 
FOR DELETE 
USING ((auth.uid())::text = user_id);

-- Keep service role policy for edge functions
-- (Service role can manage all calendar events policy already exists)