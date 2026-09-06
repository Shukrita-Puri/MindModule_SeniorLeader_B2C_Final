UPDATE travel_state
SET state = 'not_travelling'
WHERE state = 'location_unknown'
  AND (last_location_at IS NULL OR last_location_at < now() - interval '2 days');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'travel-state-sync-hourly') THEN
    PERFORM cron.unschedule('travel-state-sync-hourly');
  END IF;

  PERFORM cron.schedule(
    'travel-state-sync-hourly',
    '0 * * * *',
    format(
      $cmd$SELECT net.http_post(
        url := %L,
        headers := %L::jsonb,
        body := jsonb_build_object('mode', 'scheduled')
      );$cmd$,
      'https://iyilcpvercoywaweybpc.supabase.co/functions/v1/travel-state-sync',
      jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', coalesce(public.get_cron_shared_secret(), '')
      )::text
    )
  );
END;
$$;