CREATE TABLE public.mastery_plan_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  plan_date date NOT NULL,
  mrs_window text NOT NULL,
  day_kind text,
  horizon_iso text,
  plan_json jsonb,
  horizon_modules jsonb,
  priorities jsonb,
  recommended_practice_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  plan_ledger jsonb,
  source_context_snapshot_id uuid,
  brief_snapshot_id uuid,
  input_signature text,
  status text NOT NULL DEFAULT 'ready',
  error_json jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mastery_plan_snapshots_window_chk
    CHECK (mrs_window IN ('morning','afternoon','evening')),
  CONSTRAINT mastery_plan_snapshots_status_chk
    CHECK (status IN ('ready','error','pending')),
  CONSTRAINT mastery_plan_snapshots_unique_day_window
    UNIQUE (user_id, plan_date, mrs_window)
);

CREATE INDEX mastery_plan_snapshots_user_date_idx
  ON public.mastery_plan_snapshots (user_id, plan_date DESC, mrs_window);

GRANT SELECT ON public.mastery_plan_snapshots TO authenticated;
GRANT ALL ON public.mastery_plan_snapshots TO service_role;

ALTER TABLE public.mastery_plan_snapshots ENABLE ROW LEVEL SECURITY;

-- Auth0 sub-based read policy. Writes are edge-function only (service_role
-- bypasses RLS); no INSERT/UPDATE/DELETE policy for `authenticated` so the
-- app cannot write to this table directly.
CREATE POLICY "Users can view own plan snapshots"
  ON public.mastery_plan_snapshots
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'sub') = user_id);

CREATE TRIGGER mastery_plan_snapshots_set_updated_at
  BEFORE UPDATE ON public.mastery_plan_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();