ALTER TABLE public.notification_log
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_state text;

UPDATE public.notification_log
SET delivery_state = CASE
  WHEN (payload->>'apns_status')::int = 200 THEN 'accepted'
  WHEN payload ? 'apns_status' THEN 'failed'
  ELSE 'accepted'
END
WHERE delivery_state IS NULL;

ALTER TABLE public.notification_log
  ALTER COLUMN delivery_state SET DEFAULT 'accepted';

CREATE INDEX IF NOT EXISTS idx_notification_log_delivery_state
  ON public.notification_log (delivery_state, sent_at DESC);