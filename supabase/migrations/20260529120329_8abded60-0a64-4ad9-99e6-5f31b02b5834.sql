
-- Oura Ring connection table mirrors the calendar_connections pattern:
-- vault-encrypted tokens, RLS deny-by-default, service-role only writes.
CREATE TABLE IF NOT EXISTS public.oura_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  -- Vault references
  encrypted_access_token_id uuid,
  encrypted_refresh_token_id uuid,
  access_token_expires_at timestamptz,
  -- Sync lifecycle
  last_sync timestamptz,
  last_sample_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  connection_status text NOT NULL DEFAULT 'connected',
  sync_status text NOT NULL DEFAULT 'unknown',
  -- OAuth state nonce (used by start->callback)
  oauth_state text,
  oauth_state_expires_at timestamptz,
  -- Bookkeeping
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS oura_connections_user_active_idx
  ON public.oura_connections(user_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS oura_connections_user_idx
  ON public.oura_connections(user_id);

-- GRANTs (auth-only table: never anon)
GRANT SELECT ON public.oura_connections TO authenticated;
GRANT ALL ON public.oura_connections TO service_role;

ALTER TABLE public.oura_connections ENABLE ROW LEVEL SECURITY;

-- Users may read their own row (status display) but never write — service role only.
CREATE POLICY "Users can read own oura connection"
  ON public.oura_connections FOR SELECT
  TO authenticated
  USING (user_id = (auth.uid())::text);

CREATE POLICY "Service role full access oura connections"
  ON public.oura_connections FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER update_oura_connections_updated_at
  BEFORE UPDATE ON public.oura_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Token storage helpers reuse the same vault pattern as calendar tokens.
CREATE OR REPLACE FUNCTION public.store_oura_access_token(_connection_id uuid, _token text, _expires_at timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  secret_id uuid;
  existing_secret_id uuid;
BEGIN
  SELECT encrypted_access_token_id INTO existing_secret_id
  FROM oura_connections WHERE id = _connection_id;

  IF existing_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = existing_secret_id;
  END IF;

  INSERT INTO vault.secrets (secret, description)
  VALUES (_token, 'Oura access token for connection ' || _connection_id)
  RETURNING id INTO secret_id;

  UPDATE oura_connections
  SET encrypted_access_token_id = secret_id,
      access_token_expires_at = _expires_at,
      updated_at = now()
  WHERE id = _connection_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.store_oura_refresh_token(_connection_id uuid, _token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  secret_id uuid;
  existing_secret_id uuid;
BEGIN
  SELECT encrypted_refresh_token_id INTO existing_secret_id
  FROM oura_connections WHERE id = _connection_id;

  IF existing_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = existing_secret_id;
  END IF;

  INSERT INTO vault.secrets (secret, description)
  VALUES (_token, 'Oura refresh token for connection ' || _connection_id)
  RETURNING id INTO secret_id;

  UPDATE oura_connections
  SET encrypted_refresh_token_id = secret_id,
      updated_at = now()
  WHERE id = _connection_id;
END;
$$;
