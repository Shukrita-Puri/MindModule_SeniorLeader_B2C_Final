-- ============================================================================
-- PHASE 1: SECURE OAUTH TOKEN STORAGE
-- ============================================================================

-- Add encrypted token columns to calendar_connections
ALTER TABLE calendar_connections 
  ADD COLUMN encrypted_access_token_id uuid,
  ADD COLUMN encrypted_refresh_token_id uuid;

-- Add encrypted token columns to oura_connections
ALTER TABLE oura_connections 
  ADD COLUMN encrypted_access_token_id uuid,
  ADD COLUMN encrypted_refresh_token_id uuid;

-- Create function to encrypt existing calendar tokens
CREATE OR REPLACE FUNCTION migrate_calendar_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conn RECORD;
  access_secret_id uuid;
  refresh_secret_id uuid;
BEGIN
  FOR conn IN SELECT * FROM calendar_connections WHERE access_token IS NOT NULL LOOP
    -- Store access token in vault
    INSERT INTO vault.secrets (secret, description)
    VALUES (conn.access_token, 'Calendar access token for user ' || conn.user_id)
    RETURNING id INTO access_secret_id;
    
    -- Update connection record with encrypted token reference
    UPDATE calendar_connections
    SET encrypted_access_token_id = access_secret_id
    WHERE id = conn.id;
    
    -- Handle refresh token if exists
    IF conn.refresh_token IS NOT NULL THEN
      INSERT INTO vault.secrets (secret, description)
      VALUES (conn.refresh_token, 'Calendar refresh token for user ' || conn.user_id)
      RETURNING id INTO refresh_secret_id;
      
      UPDATE calendar_connections
      SET encrypted_refresh_token_id = refresh_secret_id
      WHERE id = conn.id;
    END IF;
  END LOOP;
END;
$$;

-- Create function to encrypt existing oura tokens
CREATE OR REPLACE FUNCTION migrate_oura_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conn RECORD;
  access_secret_id uuid;
  refresh_secret_id uuid;
BEGIN
  FOR conn IN SELECT * FROM oura_connections WHERE access_token IS NOT NULL LOOP
    -- Store access token in vault
    INSERT INTO vault.secrets (secret, description)
    VALUES (conn.access_token, 'Oura access token for user ' || conn.user_id)
    RETURNING id INTO access_secret_id;
    
    -- Update connection record with encrypted token reference
    UPDATE oura_connections
    SET encrypted_access_token_id = access_secret_id
    WHERE id = conn.id;
    
    -- Handle refresh token if exists
    IF conn.refresh_token IS NOT NULL THEN
      INSERT INTO vault.secrets (secret, description)
      VALUES (conn.refresh_token, 'Oura refresh token for user ' || conn.user_id)
      RETURNING id INTO refresh_secret_id;
      
      UPDATE oura_connections
      SET encrypted_refresh_token_id = refresh_secret_id
      WHERE id = conn.id;
    END IF;
  END LOOP;
END;
$$;

-- Run migrations to encrypt existing tokens
SELECT migrate_calendar_tokens();
SELECT migrate_oura_tokens();

-- Drop plain text token columns after encryption
ALTER TABLE calendar_connections 
  DROP COLUMN IF EXISTS access_token,
  DROP COLUMN IF EXISTS refresh_token;

ALTER TABLE oura_connections 
  DROP COLUMN IF EXISTS access_token,
  DROP COLUMN IF EXISTS refresh_token;

-- Helper functions to retrieve decrypted tokens
CREATE OR REPLACE FUNCTION get_calendar_access_token(_connection_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token_id uuid;
  decrypted_token text;
BEGIN
  SELECT encrypted_access_token_id INTO token_id
  FROM calendar_connections
  WHERE id = _connection_id AND user_id = auth.uid();
  
  IF token_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  SELECT decrypted_secret INTO decrypted_token
  FROM vault.decrypted_secrets
  WHERE id = token_id;
  
  RETURN decrypted_token;
END;
$$;

CREATE OR REPLACE FUNCTION get_calendar_refresh_token(_connection_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token_id uuid;
  decrypted_token text;
BEGIN
  SELECT encrypted_refresh_token_id INTO token_id
  FROM calendar_connections
  WHERE id = _connection_id AND user_id = auth.uid();
  
  IF token_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  SELECT decrypted_secret INTO decrypted_token
  FROM vault.decrypted_secrets
  WHERE id = token_id;
  
  RETURN decrypted_token;
END;
$$;

CREATE OR REPLACE FUNCTION get_oura_access_token(_connection_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token_id uuid;
  decrypted_token text;
BEGIN
  SELECT encrypted_access_token_id INTO token_id
  FROM oura_connections
  WHERE id = _connection_id AND user_id = auth.uid();
  
  IF token_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  SELECT decrypted_secret INTO decrypted_token
  FROM vault.decrypted_secrets
  WHERE id = token_id;
  
  RETURN decrypted_token;
END;
$$;

CREATE OR REPLACE FUNCTION get_oura_refresh_token(_connection_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token_id uuid;
  decrypted_token text;
BEGIN
  SELECT encrypted_refresh_token_id INTO token_id
  FROM oura_connections
  WHERE id = _connection_id AND user_id = auth.uid();
  
  IF token_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  SELECT decrypted_secret INTO decrypted_token
  FROM vault.decrypted_secrets
  WHERE id = token_id;
  
  RETURN decrypted_token;
END;
$$;

-- ============================================================================
-- PHASE 2: FIX USER ROLE SYSTEM BYPASS
-- ============================================================================

-- Function to assign roles (only callable by admins or system)
CREATE OR REPLACE FUNCTION assign_user_role(_user_id uuid, _role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow if called by authenticated admin
  IF auth.uid() IS NOT NULL AND NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can assign roles';
  END IF;
  
  INSERT INTO user_roles (user_id, role)
  VALUES (_user_id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- Add RLS policy: Only admins can insert roles
CREATE POLICY "Only admins can assign roles"
ON user_roles FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Add RLS policy: Roles cannot be updated (immutable)
CREATE POLICY "Roles cannot be updated"
ON user_roles FOR UPDATE
TO authenticated
USING (false);

-- Add RLS policy: Only admins can delete roles
CREATE POLICY "Only admins can delete roles"
ON user_roles FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- ============================================================================
-- PHASE 3: SECURE USER PROFILE CREATION
-- ============================================================================

-- Add INSERT policy for profiles
CREATE POLICY "Users can only insert own profile"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Update SELECT policy to be more explicit about own profile access
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

CREATE POLICY "Users can view own full profile"
ON profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Create public profiles view without emails for future use
CREATE OR REPLACE VIEW public_profiles AS
SELECT id, full_name, avatar_url, created_at, updated_at
FROM profiles;

-- Grant access to public profiles view
GRANT SELECT ON public_profiles TO authenticated, anon;

-- Add comment explaining the security model
COMMENT ON TABLE calendar_connections IS 'OAuth tokens are encrypted using Supabase Vault. Access via get_calendar_access_token() and get_calendar_refresh_token() functions.';
COMMENT ON TABLE oura_connections IS 'OAuth tokens are encrypted using Supabase Vault. Access via get_oura_access_token() and get_oura_refresh_token() functions.';
COMMENT ON TABLE user_roles IS 'Role assignments are immutable and can only be managed by admins via assign_user_role() function.';
COMMENT ON TABLE profiles IS 'User profiles with restricted INSERT (own only) and SELECT (own only) policies. Use public_profiles view for non-sensitive data.';