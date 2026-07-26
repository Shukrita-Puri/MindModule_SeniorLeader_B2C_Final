CREATE OR REPLACE FUNCTION public.delete_my_user_data(_user_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  counts jsonb;
  v_secret uuid;
BEGIN
  IF _user_id IS NULL OR length(trim(_user_id)) = 0 THEN
    RAISE EXCEPTION 'delete_my_user_data: _user_id required';
  END IF;

  -- Purge encrypted integration tokens from the vault before the owning
  -- rows are deleted, otherwise the secrets are orphaned forever.
  FOR v_secret IN
    SELECT encrypted_access_token_id FROM public.calendar_connections
      WHERE user_id = _user_id AND encrypted_access_token_id IS NOT NULL
    UNION ALL
    SELECT encrypted_refresh_token_id FROM public.calendar_connections
      WHERE user_id = _user_id AND encrypted_refresh_token_id IS NOT NULL
    UNION ALL
    SELECT encrypted_access_token_id FROM public.oura_connections
      WHERE user_id = _user_id AND encrypted_access_token_id IS NOT NULL
    UNION ALL
    SELECT encrypted_refresh_token_id FROM public.oura_connections
      WHERE user_id = _user_id AND encrypted_refresh_token_id IS NOT NULL
  LOOP
    DELETE FROM vault.secrets WHERE id = v_secret;
  END LOOP;

  -- Reuse the audited bulk purge (deletes every public-schema row keyed on
  -- user_id, plus the profile).
  counts := public.admin_delete_user_data(_user_id);

  RETURN counts;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_my_user_data(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_user_data(text) TO service_role;