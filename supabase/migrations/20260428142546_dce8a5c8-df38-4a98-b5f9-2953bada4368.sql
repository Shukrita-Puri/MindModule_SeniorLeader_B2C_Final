-- Pattern store unification: extend causality_findings to be the canonical
-- pattern store (multiple pattern_kinds per day) while preserving the existing
-- payload contract used by the Insights "Performance Causality" card.

ALTER TABLE public.causality_findings
  ADD COLUMN IF NOT EXISTS pattern_kind text NOT NULL DEFAULT 'cause_effect_v2',
  ADD COLUMN IF NOT EXISTS signal_summary jsonb;

-- Backfill: every existing row is the v2 cause/effect snapshot.
UPDATE public.causality_findings
   SET pattern_kind = 'cause_effect_v2'
 WHERE pattern_kind IS NULL OR pattern_kind = '';

-- Replace the daily-snapshot single-row constraint with one that includes
-- pattern_kind so each pattern family caches independently.
ALTER TABLE public.causality_findings
  DROP CONSTRAINT IF EXISTS causality_findings_pkey;

ALTER TABLE public.causality_findings
  ADD CONSTRAINT causality_findings_pkey
  PRIMARY KEY (user_id, pattern_kind, computed_for_date);

-- Helpful lookup index for smart-nudges (latest signal_summary per kind).
CREATE INDEX IF NOT EXISTS idx_causality_findings_user_kind_recent
  ON public.causality_findings (user_id, pattern_kind, computed_for_date DESC);
