-- Executive Home cards centralized builder.
-- The function is scheduled frequently in UTC and skips internally when the
-- current user-local window has already been built.

CREATE TABLE IF NOT EXISTS public.executive_home_card_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL,
  user_id text,
  local_date date,
  effective_timezone text,
  "window" text CHECK ("window" IN ('morning', 'afternoon', 'evening')),
  day_type text,
  mode text NOT NULL CHECK (mode IN ('scheduled', 'manual_refresh', 'manual_replay', 'backfill', 'dry_run')),
  status text NOT NULL,
  mrs_status text,
  brief_status text,
  plan_status text,
  skipped_reason text,
  error text,
  travel_state jsonb,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS executive_home_card_runs_user_date_idx
  ON public.executive_home_card_runs (user_id, local_date DESC, "window", created_at DESC);

GRANT SELECT ON public.executive_home_card_runs TO authenticated;
GRANT ALL ON public.executive_home_card_runs TO service_role;

ALTER TABLE public.executive_home_card_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own executive home card run logs" ON public.executive_home_card_runs;
CREATE POLICY "Users can read own executive home card run logs"
  ON public.executive_home_card_runs
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'sub') = user_id);

DROP POLICY IF EXISTS "Service role full access to executive home card run logs" ON public.executive_home_card_runs;
CREATE POLICY "Service role full access to executive home card run logs"
  ON public.executive_home_card_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotent cron install. Rollback:
--   SELECT cron.unschedule('build-executive-home-cards');
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
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5aWxjcHZlcmNveXdhd2V5YnBjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTMxNzEsImV4cCI6MjA5MTIyOTE3MX0.3V5grDqIt-bl_Nda3LxsvK0rqLO1CziiiGMLwgixMmQ'
      ),
      body := jsonb_build_object('mode', 'scheduled')
    ) AS request_id$job$
  );
END
$$;

COMMENT ON TABLE public.executive_home_card_runs IS
  'Observability log for centralized Executive Home MRS -> Brief -> Plan builds. UI must read card snapshots, not this table.';
