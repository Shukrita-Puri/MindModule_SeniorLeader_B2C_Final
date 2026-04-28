-- Force regeneration of today's Decision Readiness Brief snapshots so the
-- updated prompt (paired absolute clock times for TODAY's events + IANA-aware
-- formatting) replaces any cached body that still contains an LLM-invented
-- HH:mm. Scoped to today's local_date so we don't touch historical analytics.
DELETE FROM public.brief_snapshots
WHERE local_date >= (now() AT TIME ZONE 'UTC')::date - INTERVAL '1 day'
  AND body_text ~ '\d{1,2}:\d{2}';
