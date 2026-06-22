CREATE TABLE public.weekly_plan_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  week_start_date date NOT NULL,
  week_end_date date NOT NULL,
  source text NOT NULL DEFAULT 'sunday_week_ahead',
  priorities jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_plan jsonb,
  user_edits jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1,
  CONSTRAINT weekly_plan_snapshots_unique_week UNIQUE (user_id, week_start_date, source)
);

CREATE INDEX weekly_plan_snapshots_user_week_idx
  ON public.weekly_plan_snapshots (user_id, week_start_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_plan_snapshots TO authenticated;
GRANT ALL ON public.weekly_plan_snapshots TO service_role;

ALTER TABLE public.weekly_plan_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own weekly snapshots"
  ON public.weekly_plan_snapshots
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own weekly snapshots"
  ON public.weekly_plan_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own weekly snapshots"
  ON public.weekly_plan_snapshots
  FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

CREATE TRIGGER weekly_plan_snapshots_set_updated_at
  BEFORE UPDATE ON public.weekly_plan_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();