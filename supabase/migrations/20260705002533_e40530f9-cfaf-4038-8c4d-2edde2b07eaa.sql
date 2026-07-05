CREATE TABLE public.wearable_reconciliation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  summary_date date NOT NULL,
  metric text NOT NULL,
  winning_source text,
  losing_source text,
  winning_updated_at timestamptz,
  losing_updated_at timestamptz,
  delta_hours numeric,
  reason text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.wearable_reconciliation_log TO service_role;

ALTER TABLE public.wearable_reconciliation_log ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated: deny-by-default. Service role bypasses RLS.

CREATE INDEX idx_wearable_reconciliation_log_user_date
  ON public.wearable_reconciliation_log (user_id, summary_date DESC);

CREATE INDEX idx_wearable_reconciliation_log_created_at
  ON public.wearable_reconciliation_log (created_at DESC);