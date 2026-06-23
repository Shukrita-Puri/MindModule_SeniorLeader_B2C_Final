CREATE TABLE IF NOT EXISTS public.notification_evaluator_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluator text NOT NULL DEFAULT 'smart-nudges',
  evaluator_version text NOT NULL,
  environment text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  processed_user_count integer NOT NULL DEFAULT 0,
  qualified_count integer NOT NULL DEFAULT 0,
  shipped_count integer NOT NULL DEFAULT 0,
  apns_attempted_count integer NOT NULL DEFAULT 0,
  apns_succeeded_count integer NOT NULL DEFAULT 0,
  apns_failed_count integer NOT NULL DEFAULT 0,
  top_level_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.notification_evaluator_runs TO authenticated;
GRANT ALL ON public.notification_evaluator_runs TO service_role;

ALTER TABLE public.notification_evaluator_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.notification_evaluator_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.notification_evaluator_runs(id) ON DELETE CASCADE,
  evaluator text NOT NULL DEFAULT 'smart-nudges',
  evaluator_version text NOT NULL,
  user_id text NOT NULL,
  local_date date,
  local_hour integer,
  timezone_offset integer,
  outcome text NOT NULL,
  notification_type text,
  variant_id text,
  notification_log_id uuid,
  apns_status integer,
  apns_reason text,
  token_prefix text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.notification_evaluator_traces TO authenticated;
GRANT ALL ON public.notification_evaluator_traces TO service_role;

ALTER TABLE public.notification_evaluator_traces ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notification_evaluator_traces'
      AND policyname = 'Users can view own evaluator traces'
  ) THEN
    CREATE POLICY "Users can view own evaluator traces"
      ON public.notification_evaluator_traces
      FOR SELECT
      TO authenticated
      USING (auth.uid()::text = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notification_evaluator_runs'
      AND policyname = 'Users can view runs with their traces'
  ) THEN
    CREATE POLICY "Users can view runs with their traces"
      ON public.notification_evaluator_runs
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.notification_evaluator_traces t
          WHERE t.run_id = notification_evaluator_runs.id
            AND t.user_id = auth.uid()::text
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS notification_evaluator_runs_started_idx
  ON public.notification_evaluator_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS notification_evaluator_traces_user_created_idx
  ON public.notification_evaluator_traces (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notification_evaluator_traces_run_idx
  ON public.notification_evaluator_traces (run_id);

CREATE INDEX IF NOT EXISTS notification_evaluator_traces_outcome_idx
  ON public.notification_evaluator_traces (outcome, created_at DESC);

CREATE INDEX IF NOT EXISTS notification_evaluator_traces_week_ahead_idx
  ON public.notification_evaluator_traces (user_id, local_date DESC, outcome)
  WHERE outcome LIKE 'week_ahead%';