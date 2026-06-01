
ALTER TABLE public.daily_context_snapshot
  ADD COLUMN IF NOT EXISTS tier_displayed text,
  ADD COLUMN IF NOT EXISTS tier_cap_reason text;

COMMENT ON COLUMN public.daily_context_snapshot.tier_displayed IS
  'MRS v3: post-cap tier shown in UI. Equal to inner_tier unless capped by a pattern-driven soft guard (e.g. SUSTAINED_DEFICIT or CONSECUTIVE_LOAD). Never raises a score — only caps Mixed/Strong/Peak down to Mixed when chronic load is active and physio is not already Low.';

COMMENT ON COLUMN public.daily_context_snapshot.tier_cap_reason IS
  'MRS v3: nullable reason for the tier cap. One of SUSTAINED_DEFICIT, CONSECUTIVE_LOAD, or null.';
