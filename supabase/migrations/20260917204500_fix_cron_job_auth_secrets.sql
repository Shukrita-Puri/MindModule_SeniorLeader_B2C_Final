-- Recreate pg_cron scheduled jobs with x-cron-secret header from vault.
-- Resolves 403 Forbidden errors caused by missing credentials.
-- Matches working pattern from travel-state-sync-hourly (job 17) and recovery push (job 18).

DO $$
DECLARE
  v_secret text;
  v_base_url text := 'https://iyilcpvercoywaweybpc.supabase.co/functions/v1/';
BEGIN
  SELECT public.get_cron_shared_secret() INTO v_secret;

  -- 1. refresh-calendar-tokens (every 10 minutes)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-calendar-tokens') THEN
    PERFORM cron.unschedule('refresh-calendar-tokens');
  END IF;

  PERFORM cron.schedule(
    'refresh-calendar-tokens',
    '*/10 * * * *',
    format(
      $cmd$SELECT net.http_post(
        url := %L,
        headers := %L::jsonb,
        body := jsonb_build_object('mode', 'scheduled')
      );$cmd$,
      v_base_url || 'refresh-calendar-tokens',
      jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', coalesce(v_secret, '')
      )::text
    )
  );

  -- 2. sync-calendar-scheduled (every 30 minutes)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-calendar-scheduled') THEN
    PERFORM cron.unschedule('sync-calendar-scheduled');
  END IF;

  PERFORM cron.schedule(
    'sync-calendar-scheduled',
    '*/30 * * * *',
    format(
      $cmd$SELECT net.http_post(
        url := %L,
        headers := %L::jsonb,
        body := jsonb_build_object('mode', 'scheduled')
      );$cmd$,
      v_base_url || 'sync-calendar-scheduled',
      jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', coalesce(v_secret, '')
      )::text
    )
  );

  -- 3. register-calendar-watch-daily (daily at 03:00 UTC)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'register-calendar-watch-daily') THEN
    PERFORM cron.unschedule('register-calendar-watch-daily');
  END IF;

  PERFORM cron.schedule(
    'register-calendar-watch-daily',
    '0 3 * * *',
    format(
      $cmd$SELECT net.http_post(
        url := %L,
        headers := %L::jsonb,
        body := '{}'::jsonb
      );$cmd$,
      v_base_url || 'register-calendar-watch',
      jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', coalesce(v_secret, '')
      )::text
    )
  );

  -- 4. oura-sync-every-15m (every 15 minutes)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'oura-sync-every-15m') THEN
    PERFORM cron.unschedule('oura-sync-every-15m');
  END IF;

  PERFORM cron.schedule(
    'oura-sync-every-15m',
    '*/15 * * * *',
    format(
      $cmd$SELECT net.http_post(
        url := %L,
        headers := %L::jsonb,
        body := jsonb_build_object('mode', 'scheduled')
      );$cmd$,
      v_base_url || 'oura-sync-fanout',
      jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', coalesce(v_secret, '')
      )::text
    )
  );

  -- 5. process-orphaned-sessions (every 10 minutes)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-orphaned-sessions') THEN
    PERFORM cron.unschedule('process-orphaned-sessions');
  END IF;

  PERFORM cron.schedule(
    'process-orphaned-sessions',
    '*/10 * * * *',
    format(
      $cmd$SELECT net.http_post(
        url := %L,
        headers := %L::jsonb,
        body := jsonb_build_object('mode', 'scheduled')
      );$cmd$,
      v_base_url || 'process-orphaned-sessions',
      jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', coalesce(v_secret, '')
      )::text
    )
  );

  -- 6. build-executive-home-cards (every 15 minutes)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'build-executive-home-cards') THEN
    PERFORM cron.unschedule('build-executive-home-cards');
  END IF;

  PERFORM cron.schedule(
    'build-executive-home-cards',
    '*/15 * * * *',
    format(
      $cmd$SELECT net.http_post(
        url := %L,
        headers := %L::jsonb,
        body := jsonb_build_object('mode', 'scheduled'),
        timeout_milliseconds := 60000
      );$cmd$,
      v_base_url || 'build-executive-home-cards',
      jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', coalesce(v_secret, '')
      )::text
    )
  );

  -- 7. build-executive-home-cards-morning (daily at 04:30 UTC)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'build-executive-home-cards-morning') THEN
    PERFORM cron.unschedule('build-executive-home-cards-morning');
  END IF;

  PERFORM cron.schedule(
    'build-executive-home-cards-morning',
    '30 4 * * *',
    format(
      $cmd$SELECT net.http_post(
        url := %L,
        headers := %L::jsonb,
        body := jsonb_build_object('mode', 'scheduled', 'time_window', 'morning'),
        timeout_milliseconds := 60000
      );$cmd$,
      v_base_url || 'build-executive-home-cards',
      jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', coalesce(v_secret, '')
      )::text
    )
  );

  -- 8. build-daily-context-morning (daily at 04:30 UTC)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'build-daily-context-morning') THEN
    PERFORM cron.unschedule('build-daily-context-morning');
  END IF;

  PERFORM cron.schedule(
    'build-daily-context-morning',
    '30 4 * * *',
    format(
      $cmd$SELECT net.http_post(
        url := %L,
        headers := %L::jsonb,
        body := jsonb_build_object('mode', 'scheduled', 'time_window', 'morning'),
        timeout_milliseconds := 60000
      );$cmd$,
      v_base_url || 'build-daily-context',
      jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', coalesce(v_secret, '')
      )::text
    )
  );

END;
$$;
