-- Fix RLS policies for dialogue tables - restrict access to session owner only

-- 1. Fix dialogue_sessions policies
DROP POLICY IF EXISTS "Users can view own sessions by user_id" ON public.dialogue_sessions;
DROP POLICY IF EXISTS "Users can update own sessions by user_id" ON public.dialogue_sessions;

CREATE POLICY "Users can view own sessions"
ON public.dialogue_sessions
FOR SELECT
USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can update own sessions"
ON public.dialogue_sessions
FOR UPDATE
USING ((auth.uid())::text = user_id);

-- Fix INSERT policy to enforce ownership
DROP POLICY IF EXISTS "Authenticated users can insert sessions" ON public.dialogue_sessions;

CREATE POLICY "Users can insert own sessions"
ON public.dialogue_sessions
FOR INSERT
WITH CHECK ((auth.uid())::text = user_id);

-- 2. Fix dialogue_messages policies (restrict by session ownership)
DROP POLICY IF EXISTS "Users can view messages" ON public.dialogue_messages;
DROP POLICY IF EXISTS "Authenticated users can insert messages" ON public.dialogue_messages;

CREATE POLICY "Users can view own session messages"
ON public.dialogue_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.dialogue_sessions
    WHERE dialogue_sessions.id = dialogue_messages.session_id
    AND (auth.uid())::text = dialogue_sessions.user_id
  )
);

CREATE POLICY "Users can insert messages to own sessions"
ON public.dialogue_messages
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.dialogue_sessions
    WHERE dialogue_sessions.id = dialogue_messages.session_id
    AND (auth.uid())::text = dialogue_sessions.user_id
  )
);

-- 3. Fix detected_signals policies (restrict by session ownership)
DROP POLICY IF EXISTS "Users can view signals" ON public.detected_signals;
DROP POLICY IF EXISTS "Authenticated users can insert signals" ON public.detected_signals;

CREATE POLICY "Users can view own session signals"
ON public.detected_signals
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.dialogue_sessions
    WHERE dialogue_sessions.id = detected_signals.session_id
    AND (auth.uid())::text = dialogue_sessions.user_id
  )
);

CREATE POLICY "Users can insert signals to own sessions"
ON public.detected_signals
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.dialogue_sessions
    WHERE dialogue_sessions.id = detected_signals.session_id
    AND (auth.uid())::text = dialogue_sessions.user_id
  )
);

-- 4. Fix dialogue_interventions policies (restrict by session ownership)
DROP POLICY IF EXISTS "Users can view interventions" ON public.dialogue_interventions;
DROP POLICY IF EXISTS "Users can update interventions" ON public.dialogue_interventions;
DROP POLICY IF EXISTS "Authenticated users can insert interventions" ON public.dialogue_interventions;

CREATE POLICY "Users can view own session interventions"
ON public.dialogue_interventions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.dialogue_sessions
    WHERE dialogue_sessions.id = dialogue_interventions.session_id
    AND (auth.uid())::text = dialogue_sessions.user_id
  )
);

CREATE POLICY "Users can update own session interventions"
ON public.dialogue_interventions
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.dialogue_sessions
    WHERE dialogue_sessions.id = dialogue_interventions.session_id
    AND (auth.uid())::text = dialogue_sessions.user_id
  )
);

CREATE POLICY "Users can insert interventions to own sessions"
ON public.dialogue_interventions
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.dialogue_sessions
    WHERE dialogue_sessions.id = dialogue_interventions.session_id
    AND (auth.uid())::text = dialogue_sessions.user_id
  )
);

-- 5. Create secure vault storage functions for calendar tokens
CREATE OR REPLACE FUNCTION public.store_calendar_access_token(_connection_id uuid, _token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  secret_id uuid;
  existing_secret_id uuid;
BEGIN
  -- Get existing secret ID if any
  SELECT encrypted_access_token_id INTO existing_secret_id
  FROM calendar_connections
  WHERE id = _connection_id;
  
  -- Delete old secret if exists
  IF existing_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = existing_secret_id;
  END IF;
  
  -- Store new token in vault
  INSERT INTO vault.secrets (secret, description)
  VALUES (_token, 'Calendar access token for connection ' || _connection_id)
  RETURNING id INTO secret_id;
  
  -- Update connection with new secret reference
  UPDATE calendar_connections
  SET encrypted_access_token_id = secret_id,
      access_token = NULL  -- Clear plaintext token
  WHERE id = _connection_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.store_calendar_refresh_token(_connection_id uuid, _token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  secret_id uuid;
  existing_secret_id uuid;
BEGIN
  -- Get existing secret ID if any
  SELECT encrypted_refresh_token_id INTO existing_secret_id
  FROM calendar_connections
  WHERE id = _connection_id;
  
  -- Delete old secret if exists
  IF existing_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = existing_secret_id;
  END IF;
  
  -- Store new token in vault
  INSERT INTO vault.secrets (secret, description)
  VALUES (_token, 'Calendar refresh token for connection ' || _connection_id)
  RETURNING id INTO secret_id;
  
  -- Update connection with new secret reference
  UPDATE calendar_connections
  SET encrypted_refresh_token_id = secret_id,
      refresh_token = NULL  -- Clear plaintext token
  WHERE id = _connection_id;
END;
$$;

-- Clear any existing plaintext tokens (migrate to vault)
-- Note: This will require re-authentication for existing connections
UPDATE calendar_connections
SET access_token = NULL, refresh_token = NULL
WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL;