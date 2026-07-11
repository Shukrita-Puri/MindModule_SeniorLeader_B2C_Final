ALTER TABLE public.calendar_connections
  ADD COLUMN IF NOT EXISTS status_source text,
  ADD COLUMN IF NOT EXISTS status_authoritative_at timestamptz;

-- Backfill legacy Apple rows so the next native write always wins the
-- monotonic guard. Non-Apple rows are left untouched.
UPDATE public.calendar_connections
   SET status_source = 'legacy'
 WHERE provider = 'apple'
   AND status_source IS NULL;

COMMENT ON COLUMN public.calendar_connections.status_source
  IS 'Who wrote this row: native-ios | js-opportunistic | oauth | legacy. Apple Calendar is native-authoritative.';
COMMENT ON COLUMN public.calendar_connections.status_authoritative_at
  IS 'Timestamp of last authoritative status write. Used to reject stale downgrades for Apple Calendar.';