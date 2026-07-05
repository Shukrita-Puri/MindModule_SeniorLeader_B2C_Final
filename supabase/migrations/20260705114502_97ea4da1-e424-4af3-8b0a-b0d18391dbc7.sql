ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS identity_key text;

CREATE INDEX IF NOT EXISTS idx_calendar_events_user_identity_key
  ON public.calendar_events (user_id, identity_key)
  WHERE identity_key IS NOT NULL;

COMMENT ON COLUMN public.calendar_events.identity_key IS
  'Write-time cross-provider dedupe key computed by computeIdentityKey() in supabase/functions/_shared/rules/calendar-merge.ts. Format: normalizedTitle|roundedStartMinute|durationMinutes. Nullable; not yet UNIQUE — this is the Phase 2 groundwork column. Fuzzy read-side dedupe (±5min, attendee overlap, status resolution) continues to live in mergeCalendarEvents() and is intentionally NOT captured in SQL.';