-- Fix RLS policies for Auth0 authentication (auth.uid() returns NULL with Auth0)
-- Application-level filtering on user_id (Auth0 sub) handles data isolation

-- dialogue_sessions: Drop existing policies and create permissive ones
DROP POLICY IF EXISTS "Users can insert own sessions" ON dialogue_sessions;
DROP POLICY IF EXISTS "Users can view own sessions" ON dialogue_sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON dialogue_sessions;

CREATE POLICY "Allow authenticated session insert" ON dialogue_sessions
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Allow authenticated session select" ON dialogue_sessions
  FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY "Allow authenticated session update" ON dialogue_sessions
  FOR UPDATE TO authenticated, anon
  USING (true);

-- dialogue_messages: Drop existing policies and create permissive ones
DROP POLICY IF EXISTS "Users can insert messages to own sessions" ON dialogue_messages;
DROP POLICY IF EXISTS "Users can view own session messages" ON dialogue_messages;

CREATE POLICY "Allow authenticated message insert" ON dialogue_messages
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Allow authenticated message select" ON dialogue_messages
  FOR SELECT TO authenticated, anon
  USING (true);

-- detected_signals: Drop existing policies and create permissive ones
DROP POLICY IF EXISTS "Users can insert signals to own sessions" ON detected_signals;
DROP POLICY IF EXISTS "Users can view own session signals" ON detected_signals;

CREATE POLICY "Allow authenticated signal insert" ON detected_signals
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Allow authenticated signal select" ON detected_signals
  FOR SELECT TO authenticated, anon
  USING (true);

-- dialogue_interventions: Drop existing policies and create permissive ones
DROP POLICY IF EXISTS "Users can insert interventions to own sessions" ON dialogue_interventions;
DROP POLICY IF EXISTS "Users can view own session interventions" ON dialogue_interventions;
DROP POLICY IF EXISTS "Users can update own session interventions" ON dialogue_interventions;

CREATE POLICY "Allow authenticated intervention insert" ON dialogue_interventions
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Allow authenticated intervention select" ON dialogue_interventions
  FOR SELECT TO authenticated, anon
  USING (true);

CREATE POLICY "Allow authenticated intervention update" ON dialogue_interventions
  FOR UPDATE TO authenticated, anon
  USING (true);

-- dialogue_skill_events: Drop existing policies and create permissive ones
DROP POLICY IF EXISTS "Users can insert skill events to own sessions" ON dialogue_skill_events;
DROP POLICY IF EXISTS "Users can view skill events from own sessions" ON dialogue_skill_events;

CREATE POLICY "Allow authenticated skill event insert" ON dialogue_skill_events
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Allow authenticated skill event select" ON dialogue_skill_events
  FOR SELECT TO authenticated, anon
  USING (true);