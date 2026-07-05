ALTER TABLE public.brief_snapshots
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz;

ALTER TABLE public.mastery_plan_snapshots
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz;

UPDATE public.brief_snapshots
  SET delivered_at = created_at
  WHERE delivered_at IS NULL;

UPDATE public.mastery_plan_snapshots
  SET delivered_at = created_at
  WHERE delivered_at IS NULL;

CREATE INDEX IF NOT EXISTS brief_snapshots_user_delivered_idx
  ON public.brief_snapshots (user_id, delivered_at DESC)
  WHERE delivered_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS mastery_plan_snapshots_user_delivered_idx
  ON public.mastery_plan_snapshots (user_id, delivered_at DESC)
  WHERE delivered_at IS NOT NULL;