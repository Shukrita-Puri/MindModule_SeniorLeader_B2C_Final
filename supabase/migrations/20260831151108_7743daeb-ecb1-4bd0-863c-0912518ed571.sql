CREATE OR REPLACE VIEW public.primary_calendar_events
WITH (security_invoker = true) AS
SELECT DISTINCT ON (e.user_id, COALESCE(NULLIF(e.identity_key, ''), e.id::text))
    e.id,
    e.user_id,
    e.external_id,
    e.title,
    e.start_time,
    e.end_time,
    e.attendees_count,
    e.is_organizer,
    e.is_recurring,
    e.event_metadata,
    e.created_at,
    e.provider,
    e.identity_key,
    e.is_all_day,
    e.event_category,
    e.event_subcategory,
    e.flight_duration_minutes,
    e.category_resolved_by,
    e.category_confidence,
    e.category_resolved_at
FROM calendar_events e
WHERE EXISTS (
    SELECT 1 FROM calendar_connections c
    WHERE c.user_id = e.user_id
      AND c.is_active = true
      AND c.provider = e.provider
)
ORDER BY
    e.user_id,
    COALESCE(NULLIF(e.identity_key, ''), e.id::text),
    CASE e.provider
        WHEN 'apple' THEN 1
        WHEN 'google' THEN 2
        WHEN 'microsoft' THEN 3
        ELSE 4
    END,
    e.attendees_count DESC NULLS LAST,
    e.created_at DESC;