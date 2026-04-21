UPDATE public.user_engagements ue
SET metadata = COALESCE(ue.metadata, '{}'::jsonb) || jsonb_build_object(
  'brief_id', bs.id::text,
  'local_date', bs.local_date::text,
  'time_window', bs.time_window
)
FROM public.brief_snapshots bs
WHERE ue.event_type = 'brief_view'
  AND ue.user_id = bs.user_id
  AND (ue.metadata->>'brief_id') IS NULL
  AND ue.metadata->>'phrase' IS NOT NULL
  AND ue.metadata->>'phrase' = bs.phrase
  AND bs.local_date = (ue.timestamp AT TIME ZONE 'UTC')::date;