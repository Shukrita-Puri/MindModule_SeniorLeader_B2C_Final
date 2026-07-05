-- Cleanup Apple multi-source duplicates that predate the sync-apple-calendar
-- write-time collapse. See supabase/functions/sync-apple-calendar/index.ts
-- for the ongoing dedupe logic (same rule: keep lex-min external_id per
-- (user_id, identity_key) among provider='apple' rows).
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, identity_key
           ORDER BY external_id ASC
         ) AS rn
  FROM public.calendar_events
  WHERE provider = 'apple'
    AND identity_key IS NOT NULL
)
DELETE FROM public.calendar_events
USING ranked
WHERE calendar_events.id = ranked.id
  AND ranked.rn > 1;