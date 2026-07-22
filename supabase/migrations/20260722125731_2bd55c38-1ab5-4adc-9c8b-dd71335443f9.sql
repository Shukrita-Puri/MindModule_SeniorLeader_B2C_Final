ALTER TABLE public.mastery_plan_snapshots
  DROP CONSTRAINT IF EXISTS mastery_plan_snapshots_status_chk;

ALTER TABLE public.mastery_plan_snapshots
  ADD CONSTRAINT mastery_plan_snapshots_status_chk
  CHECK (status IN ('ready', 'awaiting', 'error', 'pending'));