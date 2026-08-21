-- Schedule the early-morning-sync to run every 15 minutes.
SELECT cron.schedule(
  'early-morning-sync',
  '*/15 * * * *',
  $$SELECT net.http_post(
      url := current_setting('app.settings.edge_function_base_url') || '/early-morning-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', current_setting('app.settings.cron_secret')
      ),
      body := '{}'::jsonb
  )$$
);
