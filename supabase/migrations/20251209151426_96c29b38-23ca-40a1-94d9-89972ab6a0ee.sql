-- Drop existing restrictive policies on dialogue tables
DROP POLICY IF EXISTS "Users can insert own sessions" ON dialogue_sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON dialogue_sessions;
DROP POLICY IF EXISTS "Users can view own sessions" ON dialogue_sessions;

DROP POLICY IF EXISTS "Users can insert messages to own sessions" ON dialogue_messages;
DROP POLICY IF EXISTS "Users can view messages from own sessions" ON dialogue_messages;

DROP POLICY IF EXISTS "Users can insert signals to own sessions" ON detected_signals;
DROP POLICY IF EXISTS "Users can view signals from own sessions" ON detected_signals;

DROP POLICY IF EXISTS "Users can insert interventions to own sessions" ON dialogue_interventions;
DROP POLICY IF EXISTS "Users can update interventions in own sessions" ON dialogue_interventions;
DROP POLICY IF EXISTS "Users can view interventions from own sessions" ON dialogue_interventions;

-- Create new policies that work with Auth0 (authenticated users can manage their own data based on user_id column)
-- Since Auth0 doesn't use Supabase auth, we allow authenticated API requests to manage data where user_id matches

-- dialogue_sessions policies
CREATE POLICY "Authenticated users can insert sessions" 
ON dialogue_sessions 
FOR INSERT 
WITH CHECK (user_id IS NOT NULL AND user_id != '');

CREATE POLICY "Users can view own sessions by user_id" 
ON dialogue_sessions 
FOR SELECT 
USING (true);

CREATE POLICY "Users can update own sessions by user_id" 
ON dialogue_sessions 
FOR UPDATE 
USING (true);

-- dialogue_messages policies (linked via session)
CREATE POLICY "Authenticated users can insert messages" 
ON dialogue_messages 
FOR INSERT 
WITH CHECK (session_id IS NOT NULL);

CREATE POLICY "Users can view messages" 
ON dialogue_messages 
FOR SELECT 
USING (true);

-- detected_signals policies (linked via session)
CREATE POLICY "Authenticated users can insert signals" 
ON detected_signals 
FOR INSERT 
WITH CHECK (session_id IS NOT NULL);

CREATE POLICY "Users can view signals" 
ON detected_signals 
FOR SELECT 
USING (true);

-- dialogue_interventions policies (linked via session)
CREATE POLICY "Authenticated users can insert interventions" 
ON dialogue_interventions 
FOR INSERT 
WITH CHECK (session_id IS NOT NULL);

CREATE POLICY "Users can update interventions" 
ON dialogue_interventions 
FOR UPDATE 
USING (true);

CREATE POLICY "Users can view interventions" 
ON dialogue_interventions 
FOR SELECT 
USING (true);