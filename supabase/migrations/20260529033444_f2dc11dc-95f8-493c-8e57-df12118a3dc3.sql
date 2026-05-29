CREATE TABLE public.wearable_signal_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  window_days int NOT NULL,
  engine_version int NOT NULL,
  sleep_score_day_count int NOT NULL DEFAULT 0,
  rhr_day_count int NOT NULL DEFAULT 0,
  hrv_day_count int NOT NULL DEFAULT 0,
  hr_samples_day_count int NOT NULL DEFAULT 0,
  rhr_recovered_day_count int NOT NULL DEFAULT 0,
  rhr_window_bucket_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_days_with_hr int NOT NULL DEFAULT 0,
  gate_reasons jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_wsd_user_computed ON public.wearable_signal_diagnostics (user_id, computed_at DESC);

GRANT SELECT ON public.wearable_signal_diagnostics TO authenticated;
GRANT ALL ON public.wearable_signal_diagnostics TO service_role;

ALTER TABLE public.wearable_signal_diagnostics ENABLE ROW LEVEL SECURITY;

-- Users may read only their own diagnostic rows. user_id holds the Auth0 sub.
CREATE POLICY "users read own diagnostics"
  ON public.wearable_signal_diagnostics
  FOR SELECT
  TO authenticated
  USING (user_id = (auth.jwt() ->> 'sub'));

-- Writes are exclusively service-role (edge function).
