
CREATE OR REPLACE FUNCTION public.get_cron_shared_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'CRON_SHARED_SECRET'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_cron_shared_secret() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_cron_shared_secret() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_shared_secret() TO service_role;

COMMENT ON FUNCTION public.get_cron_shared_secret() IS
  'Returns the CRON_SHARED_SECRET from vault. Called only by pg_cron jobs (service_role). Never expose to anon/authenticated.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'build-executive-home-cards') THEN
    PERFORM cron.unschedule('build-executive-home-cards');
  END IF;

  PERFORM cron.schedule(
    'build-executive-home-cards',
    '*/15 * * * *',
    $job$SELECT net.http_post(
      url := 'https://iyilcpvercoywaweybpc.supabase.co/functions/v1/build-executive-home-cards',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', public.get_cron_shared_secret()
      ),
      body := jsonb_build_object('mode', 'scheduled'),
      timeout_milliseconds := 60000
    ) AS request_id$job$
  );
END
$$;
