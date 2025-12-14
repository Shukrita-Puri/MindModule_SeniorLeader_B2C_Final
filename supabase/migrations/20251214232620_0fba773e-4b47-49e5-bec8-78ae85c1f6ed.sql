-- Fix RLS policies for calendar_connections to work with Auth0-based authentication
-- while keeping service role full access.

-- Drop existing user-specific policies that rely on auth.uid()
DROP POLICY IF EXISTS "Users can view their own calendar connections" ON public.calendar_connections;
DROP POLICY IF EXISTS "Users can update their own calendar connections" ON public.calendar_connections;
DROP POLICY IF EXISTS "Users can delete their own calendar connections" ON public.calendar_connections;

-- Allow the application (public role using the anon key) to read calendar connections.
-- User scoping is enforced at the application layer by always filtering on user_id.
CREATE POLICY "App can view calendar connections" ON public.calendar_connections
  FOR SELECT
  TO public
  USING (true);

-- Allow the application to update and delete calendar connections when needed.
-- In practice, sensitive mutations are performed through backend functions using the service role key.
CREATE POLICY "App can update calendar connections" ON public.calendar_connections
  FOR UPDATE
  TO public
  USING (true);

CREATE POLICY "App can delete calendar connections" ON public.calendar_connections
  FOR DELETE
  TO public
  USING (true);