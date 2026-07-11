-- Batch A: enforce single active owner per APNs/FCM device token.
-- Before adding the constraint, deactivate any existing duplicates so
-- migration cannot fail on legacy data. We keep the most recently updated
-- row active and mark the rest inactive (rows are never deleted).

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY device_token
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
         ) AS rn
  FROM public.notification_device_tokens
  WHERE is_active = true
)
UPDATE public.notification_device_tokens t
SET is_active = false,
    updated_at = now()
FROM ranked r
WHERE t.id = r.id
  AND r.rn > 1;

-- Partial unique index: at most one active row per physical device token.
-- This is the DB-level backstop for the application-level cross-user
-- ownership transfer in supabase/functions/register-device-token.
CREATE UNIQUE INDEX IF NOT EXISTS notification_device_tokens_active_token_uidx
  ON public.notification_device_tokens (device_token)
  WHERE is_active = true;

-- Helpful supporting index for the unregister-device-token lookup path.
CREATE INDEX IF NOT EXISTS notification_device_tokens_user_active_idx
  ON public.notification_device_tokens (user_id)
  WHERE is_active = true;