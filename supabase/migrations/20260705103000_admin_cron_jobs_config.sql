CREATE TABLE IF NOT EXISTS public.admin_cron_job_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_key text UNIQUE NOT NULL,
  job_name text NOT NULL,
  function_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  schedule_mode text NOT NULL DEFAULT 'dispatcher',
  cron_expression text NULL,
  dispatcher_interval_minutes integer NOT NULL DEFAULT 5,
  timezone_mode text NOT NULL DEFAULT 'user_timezone',
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  max_users_per_run integer NOT NULL DEFAULT 100,
  retry_attempts integer NOT NULL DEFAULT 2,
  retry_delay_seconds integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'admin_cron_job_configs_schedule_mode_check'
  ) THEN
    ALTER TABLE public.admin_cron_job_configs
      ADD CONSTRAINT admin_cron_job_configs_schedule_mode_check
      CHECK (schedule_mode IN ('dispatcher'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'admin_cron_job_configs_timezone_mode_check'
  ) THEN
    ALTER TABLE public.admin_cron_job_configs
      ADD CONSTRAINT admin_cron_job_configs_timezone_mode_check
      CHECK (timezone_mode IN ('user_timezone'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS admin_cron_job_configs_enabled_idx
  ON public.admin_cron_job_configs (enabled, job_key);

ALTER TABLE public.admin_cron_job_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to admin_cron_job_configs" ON public.admin_cron_job_configs;
CREATE POLICY "Service role full access to admin_cron_job_configs"
  ON public.admin_cron_job_configs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON public.admin_cron_job_configs TO authenticated;
GRANT ALL ON public.admin_cron_job_configs TO service_role;

DROP TRIGGER IF EXISTS admin_cron_job_configs_updated_at ON public.admin_cron_job_configs;
CREATE TRIGGER admin_cron_job_configs_updated_at
  BEFORE UPDATE ON public.admin_cron_job_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.admin_cron_job_configs (
  job_key,
  job_name,
  function_name,
  enabled,
  schedule_mode,
  cron_expression,
  dispatcher_interval_minutes,
  timezone_mode,
  config_json,
  max_users_per_run,
  retry_attempts,
  retry_delay_seconds
)
VALUES (
  'executive_home_cards',
  'Executive Home Cards',
  'build-executive-home-cards',
  true,
  'dispatcher',
  '*/15 * * * *',
  5,
  'user_timezone',
  jsonb_build_object(
    'windows', jsonb_build_object(
      'morning', '05:00',
      'afternoon', '12:00',
      'evening', '18:00'
    ),
    'allowedDays', jsonb_build_array('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'),
    'runOnWeekends', true,
    'respectTravelTimezone', true,
    'skipIfAlreadyBuilt', true,
    'buildSequence', jsonb_build_array('mrs', 'brief', 'plan'),
    'mode', 'scheduled',
    'dryRun', false
  ),
  100,
  2,
  30
)
ON CONFLICT (job_key) DO UPDATE
SET
  job_name = EXCLUDED.job_name,
  function_name = EXCLUDED.function_name,
  schedule_mode = EXCLUDED.schedule_mode,
  cron_expression = COALESCE(public.admin_cron_job_configs.cron_expression, EXCLUDED.cron_expression),
  dispatcher_interval_minutes = COALESCE(public.admin_cron_job_configs.dispatcher_interval_minutes, EXCLUDED.dispatcher_interval_minutes),
  timezone_mode = EXCLUDED.timezone_mode,
  config_json = public.admin_cron_job_configs.config_json || EXCLUDED.config_json,
  max_users_per_run = COALESCE(public.admin_cron_job_configs.max_users_per_run, EXCLUDED.max_users_per_run),
  retry_attempts = COALESCE(public.admin_cron_job_configs.retry_attempts, EXCLUDED.retry_attempts),
  retry_delay_seconds = COALESCE(public.admin_cron_job_configs.retry_delay_seconds, EXCLUDED.retry_delay_seconds);

ALTER TABLE public.executive_home_card_runs
  ADD COLUMN IF NOT EXISTS job_key text NOT NULL DEFAULT 'executive_home_cards',
  ADD COLUMN IF NOT EXISTS started_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS error_json jsonb NULL,
  ADD COLUMN IF NOT EXISTS trace_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;

UPDATE public.executive_home_card_runs
SET
  job_key = COALESCE(job_key, 'executive_home_cards'),
  started_at = COALESCE(started_at, created_at),
  finished_at = COALESCE(finished_at, CASE WHEN status IN ('success', 'error', 'skipped') THEN created_at ELSE NULL END),
  trace_json = COALESCE(trace_json, '{}'::jsonb),
  retry_count = COALESCE(retry_count, 0)
WHERE job_key IS DISTINCT FROM 'executive_home_cards'
   OR started_at IS NULL
   OR trace_json IS NULL
   OR retry_count IS NULL;

CREATE INDEX IF NOT EXISTS executive_home_card_runs_job_key_idx
  ON public.executive_home_card_runs (job_key, created_at DESC);
