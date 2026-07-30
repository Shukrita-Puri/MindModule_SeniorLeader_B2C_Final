ALTER TABLE public.causality_findings
  ADD COLUMN IF NOT EXISTS event_subcategory text;

CREATE INDEX IF NOT EXISTS causality_findings_event_subcategory_idx
  ON public.causality_findings (event_subcategory)
  WHERE event_subcategory IS NOT NULL;
