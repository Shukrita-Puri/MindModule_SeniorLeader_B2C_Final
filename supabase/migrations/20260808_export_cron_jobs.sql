-- Migration to export and adjust pg_cron jobs for the new 04:30 dawn window
-- Date: 2026-08-08

-- Unschedule existing jobs
select cron.unschedule('build-executive-home-cards-morning');
select cron.unschedule('build-daily-context-morning');

-- Schedule new jobs at 04:30 AM
select cron.schedule(
  'build-executive-home-cards-morning',
  '30 4 * * *',
  $$
    select net.http_post(
        url:='https://iyilcpvercoywaweybpc.supabase.co/functions/v1/build-executive-home-cards',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
        body:=json_build_object('time_window', 'morning')::jsonb
    );
  $$
);

select cron.schedule(
  'build-daily-context-morning',
  '30 4 * * *',
  $$
    select net.http_post(
        url:='https://iyilcpvercoywaweybpc.supabase.co/functions/v1/build-daily-context',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
        body:=json_build_object('time_window', 'morning')::jsonb
    );
  $$
);
