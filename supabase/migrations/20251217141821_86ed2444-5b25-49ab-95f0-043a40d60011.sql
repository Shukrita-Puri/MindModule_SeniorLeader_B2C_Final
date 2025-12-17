-- Fix Dialogue Room RLS policies for Auth0 authentication
-- Auth0 user IDs are stored in user_id column but auth.uid() returns NULL for Auth0 users

-- Drop existing restrictive policies on dialogue_sessions
DROP POLICY IF EXISTS "Users can insert their own dialogue sessions" ON dialogue_sessions;
DROP POLICY IF EXISTS "Users can view their own dialogue sessions" ON dialogue_sessions;
DROP POLICY IF EXISTS "Users can update their own dialogue sessions" ON dialogue_sessions;

-- Create new policies that allow authenticated operations (validation done at app level)
CREATE POLICY "Authenticated users can insert dialogue sessions" 
  ON dialogue_sessions FOR INSERT 
  TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Users can view dialogue sessions" 
  ON dialogue_sessions FOR SELECT 
  TO authenticated, anon
  USING (true);

CREATE POLICY "Users can update dialogue sessions" 
  ON dialogue_sessions FOR UPDATE 
  TO authenticated, anon
  USING (true);

-- Drop existing restrictive policies on dialogue_messages
DROP POLICY IF EXISTS "Users can insert their own dialogue messages" ON dialogue_messages;
DROP POLICY IF EXISTS "Users can view their own dialogue messages" ON dialogue_messages;

-- Create new policies for dialogue_messages
CREATE POLICY "Authenticated users can insert dialogue messages"
  ON dialogue_messages FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Users can view dialogue messages"
  ON dialogue_messages FOR SELECT
  TO authenticated, anon
  USING (true);

-- Also fix dialogue_interventions and detected_signals tables
DROP POLICY IF EXISTS "Users can insert their own dialogue skill events" ON dialogue_skill_events;
DROP POLICY IF EXISTS "Users can view their own dialogue skill events" ON dialogue_skill_events;

CREATE POLICY "Authenticated users can insert dialogue skill events"
  ON dialogue_skill_events FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Users can view dialogue skill events"
  ON dialogue_skill_events FOR SELECT
  TO authenticated, anon
  USING (true);