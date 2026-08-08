-- Idempotent re-schedule of the morning backend jobs to 04:30 (UTC server time).
--
-- Safe to run repeatedly:
--   * every legacy morning job is unscheduled only if it exists
--   * the two new jobs are unscheduled first, then recreated
--
-- Run this with the insert/data tool (it embeds the project URL + anon key),
-- NOT as a schema migration.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_job   text;
  v_url   text := 'https://iyilcpvercoywaweybpc.supabase.co/functions/v1/';
  v_anon  text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5aWxjcHZlcmNveXdhd2V5YnBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTMxNzEsImV4cCI6MjA5MTIyOTE3MX0.3V5grDqIt-bl_Nda3LxsvK0rqLO1CziiiGMLwgixMmQ';
  v_secret text;
BEGIN
  -- 1. Unschedule legacy / superseded morning jobs (only if present).
  FOR v_job IN
    SELECT jobname
    FROM cron.job
    WHERE jobname IS NOT NULL
      AND (
        jobname ILIKE '%executive-home%'
        OR jobname ILIKE '%executive_home%'
        OR jobname ILIKE '%daily-context%'
        OR jobname ILIKE '%daily_context%'
        OR jobname ILIKE '%morning%'
      )
  LOOP
    PERFORM cron.unschedule(v_job);
    RAISE NOTICE 'unscheduled %', v_job;
  END LOOP;

  SELECT public.get_cron_shared_secret() INTO v_secret;

  -- 2. Create the new 04:30 schedules.
  PERFORM cron.schedule(
    'build-daily-context-morning',
    '30 4 * * *',
    format(
      $cmd$
      SELECT net.http_post(
        url := %L,
        headers := %L::jsonb,
        body := jsonb_build_object('window', 'morning', 'source', 'cron', 'time', now())
      );
      $cmd$,
      v_url || 'build-daily-context',
      jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', v_anon,
        'Authorization', 'Bearer ' || v_anon,
        'x-cron-secret', coalesce(v_secret, '')
      )::text
    )
  );

  PERFORM cron.schedule(
    'build-executive-home-cards-morning',
    '30 4 * * *',
    format(
      $cmd$
      SELECT net.http_post(
        url := %L,
        headers := %L::jsonb,
        body := jsonb_build_object('window', 'morning', 'source', 'cron', 'time', now())
      );
      $cmd$,
      v_url || 'build-executive-home-cards',
      jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', v_anon,
        'Authorization', 'Bearer ' || v_anon,
        'x-cron-secret', coalesce(v_secret, '')
      )::text
    )
  );
END;
$$;

COMMIT;

-- Verify:
-- SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobname;