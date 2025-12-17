-- Drop overly permissive policies on calendar_connections
DROP POLICY IF EXISTS "App can delete calendar connections" ON public.calendar_connections;
DROP POLICY IF EXISTS "App can update calendar connections" ON public.calendar_connections;
DROP POLICY IF EXISTS "App can view calendar connections" ON public.calendar_connections;

-- Create secure policies that restrict access to user's own data
CREATE POLICY "Users can view their own calendar connections" 
ON public.calendar_connections 
FOR SELECT 
USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can update their own calendar connections" 
ON public.calendar_connections 
FOR UPDATE 
USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can delete their own calendar connections" 
ON public.calendar_connections 
FOR DELETE 
USING ((auth.uid())::text = user_id);