
CREATE TABLE IF NOT EXISTS public.admin_cron_job_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_key text UNIQUE NOT NULL,
  job_name text NOT NULL,
  description text NULL,
  function_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  schedule_mode text NOT NULL DEFAULT 'dispatcher',
  cron_expression text NULL,
  dispatcher_interval_minutes integer NOT NULL DEFAULT 5,
  timezone_mode text NOT NULL DEFAULT 'user_timezone',
  timezone text NOT NULL DEFAULT 'UTC',
  run_windows jsonb NOT NULL DEFAULT '[]'::jsonb,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  max_users_per_run integer NOT NULL DEFAULT 100,
  retry_attempts integer NOT NULL DEFAULT 2,
  retry_delay_seconds integer NOT NULL DEFAULT 30,
  last_updated_by text NULL,
  last_updated_by_email text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure new columns exist even if table pre-existed.
ALTER TABLE public.admin_cron_job_configs
  ADD COLUMN IF NOT EXISTS description text NULL,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS run_windows jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_updated_by text NULL,
  ADD COLUMN IF NOT EXISTS last_updated_by_email text NULL;

CREATE INDEX IF NOT EXISTS admin_cron_job_configs_enabled_idx
  ON public.admin_cron_job_configs (enabled, job_key);

GRANT SELECT ON public.admin_cron_job_configs TO authenticated;
GRANT ALL ON public.admin_cron_job_configs TO service_role;

ALTER TABLE public.admin_cron_job_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to admin_cron_job_configs" ON public.admin_cron_job_configs;
CREATE POLICY "Service role full access to admin_cron_job_configs"
  ON public.admin_cron_job_configs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS admin_cron_job_configs_updated_at ON public.admin_cron_job_configs;
CREATE TRIGGER admin_cron_job_configs_updated_at
  BEFORE UPDATE ON public.admin_cron_job_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed Executive Home Cards job.
INSERT INTO public.admin_cron_job_configs (
  job_key, job_name, description, function_name, enabled,
  schedule_mode, cron_expression, dispatcher_interval_minutes,
  timezone_mode, timezone, run_windows, config_json,
  max_users_per_run, retry_attempts, retry_delay_seconds
) VALUES (
  'executive_home_cards',
  'Executive Home Cards',
  'Builds Executive Home MRS, Brief, and Plan cards for each user at their local morning/afternoon/evening windows.',
  'build-executive-home-cards',
  true,
  'dispatcher',
  '*/5 * * * *',
  5,
  'user_timezone',
  'UTC',
  jsonb_build_array('morning','afternoon','evening'),
  jsonb_build_object(
    'windows', jsonb_build_object('morning','05:00','afternoon','12:00','evening','18:00'),
    'allowedDays', jsonb_build_array('sun','mon','tue','wed','thu','fri','sat'),
    'runOnWeekends', true,
    'respectTravelTimezone', true,
    'skipIfAlreadyBuilt', true,
    'buildSequence', jsonb_build_array('mrs','brief','plan'),
    'mode', 'scheduled',
    'dryRun', false
  ),
  100, 2, 30
) ON CONFLICT (job_key) DO NOTHING;

-- Seed Notification Evaluator job.
INSERT INTO public.admin_cron_job_configs (
  job_key, job_name, description, function_name, enabled,
  schedule_mode, cron_expression, dispatcher_interval_minutes,
  timezone_mode, timezone, run_windows, config_json,
  max_users_per_run, retry_attempts, retry_delay_seconds
) VALUES (
  'notification_evaluator',
  'Notification Evaluator',
  'Evaluates and sends scheduled push notifications (smart-nudges) on the notification cron tick.',
  'smart-nudges',
  true,
  'dispatcher',
  '*/5 * * * *',
  5,
  'user_timezone',
  'UTC',
  '[]'::jsonb,
  jsonb_build_object('mode','scheduled'),
  500, 0, 0
) ON CONFLICT (job_key) DO NOTHING;

-- Ensure executive_home_card_runs has the columns the runtime & admin UI use.
ALTER TABLE public.executive_home_card_runs
  ADD COLUMN IF NOT EXISTS job_key text NOT NULL DEFAULT 'executive_home_cards',
  ADD COLUMN IF NOT EXISTS started_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS error_json jsonb NULL,
  ADD COLUMN IF NOT EXISTS trace_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS executive_home_card_runs_job_key_idx
  ON public.executive_home_card_runs (job_key, created_at DESC);
