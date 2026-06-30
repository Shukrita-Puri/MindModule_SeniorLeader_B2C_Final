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
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5aWxjcHZlcmNveXdhd2V5YnBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTMxNzEsImV4cCI6MjA5MTIyOTE3MX0.3V5grDqIt-bl_Nda3LxsvK0rqLO1CziiiGMLwgixMmQ',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5aWxjcHZlcmNveXdhd2V5YnBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTMxNzEsImV4cCI6MjA5MTIyOTE3MX0.3V5grDqIt-bl_Nda3LxsvK0rqLO1CziiiGMLwgixMmQ'
      ),
      body := jsonb_build_object('mode', 'scheduled'),
      timeout_milliseconds := 60000
    ) AS request_id$job$
  );
END
$$;