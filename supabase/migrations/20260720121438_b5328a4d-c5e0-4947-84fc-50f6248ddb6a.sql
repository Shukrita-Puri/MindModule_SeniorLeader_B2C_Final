
-- 1) Revoke EXECUTE on all SECURITY DEFINER functions in public from anon/authenticated.
-- Keep service_role (edge functions) and postgres. Individual functions that
-- must remain callable by end users (e.g. has_role via RLS) run under
-- service_role or as part of policies; direct RPC exposure is not required.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated;',
                   r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role;',
                   r.proname, r.args);
  END LOOP;
END$$;

-- 2) Storage: drop the broad SELECT policy that lets any client list every
-- file in the public content-assets bucket. Public buckets serve files via
-- their public URLs without needing a SELECT policy, so direct object
-- access is unaffected.
DROP POLICY IF EXISTS "Public can view content assets" ON storage.objects;

-- 3) calendar_quota_cooldowns: scope SELECT to service_role only. This is
-- internal calendar-sync operational state and should never be readable by
-- end users.
DROP POLICY IF EXISTS "calendar_quota_cooldowns read for authenticated" ON public.calendar_quota_cooldowns;
REVOKE SELECT ON public.calendar_quota_cooldowns FROM authenticated, anon;
GRANT ALL ON public.calendar_quota_cooldowns TO service_role;
