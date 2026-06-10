CREATE TABLE public.event_classifier_parity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  event_id uuid NULL,
  title_normalised text NOT NULL,
  v1_category text NULL,
  v2_category text NULL,
  v2_subtype_id text NULL,
  v2_confidence text NOT NULL,
  v2_resolved_by text NOT NULL,
  hard_demote_conflict boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.event_classifier_parity_log TO service_role;

ALTER TABLE public.event_classifier_parity_log ENABLE ROW LEVEL SECURITY;

-- Diagnostic table; service_role only (deny-by-default for end users)
CREATE POLICY "service_role_full_access_parity_log"
  ON public.event_classifier_parity_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_event_classifier_parity_log_created_at
  ON public.event_classifier_parity_log (created_at DESC);

CREATE INDEX idx_event_classifier_parity_log_divergence
  ON public.event_classifier_parity_log (created_at DESC)
  WHERE v1_category IS DISTINCT FROM v2_category;

CREATE INDEX idx_event_classifier_parity_log_hard_demote_conflict
  ON public.event_classifier_parity_log (user_id, created_at DESC)
  WHERE hard_demote_conflict = true;