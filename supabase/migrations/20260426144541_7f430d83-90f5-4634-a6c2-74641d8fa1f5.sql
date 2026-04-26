CREATE TABLE IF NOT EXISTS public.causality_findings (
  user_id text NOT NULL,
  computed_for_date date NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, computed_for_date)
);

CREATE INDEX IF NOT EXISTS idx_causality_findings_user_recent
  ON public.causality_findings (user_id, computed_for_date DESC);

ALTER TABLE public.causality_findings ENABLE ROW LEVEL SECURITY;

-- Deny-by-default: no policies created. Service role bypasses RLS and is the only writer/reader.
-- Aligns with mem://security/rls-auth0-access-protocol — Auth0 tokens cannot satisfy auth.uid().

DROP TRIGGER IF EXISTS set_causality_findings_updated_at ON public.causality_findings;
CREATE TRIGGER set_causality_findings_updated_at
  BEFORE UPDATE ON public.causality_findings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();