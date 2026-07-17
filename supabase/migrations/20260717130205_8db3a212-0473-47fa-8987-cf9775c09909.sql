CREATE OR REPLACE FUNCTION public.admin_delete_user_data(_user_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  counts jsonb := '{}'::jsonb;
  n integer;
  r record;
BEGIN
  IF _user_id IS NULL OR length(trim(_user_id)) = 0 THEN
    RAISE EXCEPTION 'admin_delete_user_data: _user_id required';
  END IF;

  DELETE FROM public.dialogue_messages
    WHERE session_id IN (SELECT id FROM public.dialogue_sessions WHERE user_id::text = _user_id);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('dialogue_messages', n);

  DELETE FROM public.dialogue_interventions
    WHERE session_id IN (SELECT id FROM public.dialogue_sessions WHERE user_id::text = _user_id);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('dialogue_interventions', n);

  DELETE FROM public.dialogue_skill_events
    WHERE session_id IN (SELECT id FROM public.dialogue_sessions WHERE user_id::text = _user_id);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('dialogue_skill_events', n);

  DELETE FROM public.detected_signals
    WHERE session_id IN (SELECT id FROM public.dialogue_sessions WHERE user_id::text = _user_id);
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('detected_signals', n);

  DELETE FROM public.referral_conversions
    WHERE referrer_id::text = _user_id OR referee_id::text = _user_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('referral_conversions', n);

  FOR r IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'user_id'
      AND table_name <> 'referral_conversions'
    GROUP BY table_name
    ORDER BY table_name
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE user_id::text = $1', r.table_name)
      USING _user_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    counts := counts || jsonb_build_object(r.table_name, n);
  END LOOP;

  DELETE FROM public.profiles WHERE id::text = _user_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('profiles', n);

  RETURN counts;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_delete_user_data(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_user_data(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_data(text) TO service_role;