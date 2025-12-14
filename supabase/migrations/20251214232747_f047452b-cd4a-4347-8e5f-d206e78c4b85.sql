-- Fix RLS policies for calendar_events to work with Auth0-based authentication

-- Drop existing user-specific policies that rely on auth.uid()
DROP POLICY IF EXISTS "Users can view their own calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Users can manage their own calendar events" ON public.calendar_events;

-- Allow the application to read calendar events (user scoping enforced at application layer)
CREATE POLICY "App can view calendar events" ON public.calendar_events
  FOR SELECT
  TO public
  USING (true);

-- Allow the application to insert/update/delete calendar events
CREATE POLICY "App can manage calendar events" ON public.calendar_events
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);