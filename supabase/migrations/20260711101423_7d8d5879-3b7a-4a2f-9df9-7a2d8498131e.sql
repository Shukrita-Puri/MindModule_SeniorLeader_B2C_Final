-- Native-authoritative Apple Watch sync: add source-of-truth columns
-- and self-heal any rows carrying the legacy internal marker.

ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS watch_status_source text,
  ADD COLUMN IF NOT EXISTS watch_status_authoritative_at timestamptz;

COMMENT ON COLUMN public.user_integrations.watch_status_source
  IS 'Source of the authoritative watch_sync_status write. Valid: "native-ios" | "js-opportunistic" | NULL (legacy).';
COMMENT ON COLUMN public.user_integrations.watch_status_authoritative_at
  IS 'Timestamp used by the monotonic guard in wearable-status-update to reject stale downgrades.';

-- One-shot cleanup of the legacy internal marker.
UPDATE public.user_integrations
SET watch_last_error = NULL,
    watch_last_error_at = NULL,
    watch_sync_status = CASE
      WHEN watch_sync_status = 'sync_delayed' THEN 'waiting_for_data'
      ELSE watch_sync_status
    END
WHERE watch_last_error = 'native_healthkit_fallback_triggered';