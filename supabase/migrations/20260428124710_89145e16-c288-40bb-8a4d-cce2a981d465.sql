-- Stateful Plan Evolution: persistent daily plan ledger
-- A single jsonb column on daily_ritual_completions stores the structured
-- plan emitted by generate-mastery-plan (3 horizon slots with practice IDs,
-- JIT anchors, horizon labels). Subsequent same-day brief regenerations
-- read the EARLIEST same-day ledger and merge:
--   - Completed slots stay verbatim (sticky, ✓ preserved across periods)
--   - JIT-anchored slots keep slotIndex/jitEventTitle/horizon — practices and
--     whyLine may refresh when the user's context materially changes
--   - Other slots are recomputed against fresh context
-- No reshape of existing columns; column is nullable so legacy rows are safe.

ALTER TABLE public.daily_ritual_completions
ADD COLUMN IF NOT EXISTS plan_ledger jsonb;

COMMENT ON COLUMN public.daily_ritual_completions.plan_ledger IS
'Structured plan ledger for the day: { modules: HorizonModule[], generatedAt, jitEventIds[] }. The EARLIEST same-day row owns the canonical ledger that subsequent period rows evolve from.';