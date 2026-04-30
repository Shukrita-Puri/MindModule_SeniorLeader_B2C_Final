-- Cleanup function: keeps device tokens table tidy
-- - Hard-deletes inactive tokens older than 7 days
-- - For any user with multiple active tokens on the same platform,
--   keeps only the most recently updated and deactivates the rest
CREATE OR REPLACE FUNCTION public.cleanup_device_tokens()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deleted_inactive integer := 0;
  v_deactivated_dupes integer := 0;
BEGIN
  -- 1. Hard-delete inactive tokens that have been inactive for > 7 days
  WITH del AS (
    DELETE FROM public.notification_device_tokens
    WHERE is_active = false
      AND updated_at < (now() - interval '7 days')
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted_inactive FROM del;

  -- 2. For each (user_id, platform) keep only the most recently updated active token
  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY user_id, platform
             ORDER BY updated_at DESC, created_at DESC
           ) AS rn
    FROM public.notification_device_tokens
    WHERE is_active = true
  ),
  deactivated AS (
    UPDATE public.notification_device_tokens t
    SET is_active = false,
        updated_at = now()
    FROM ranked r
    WHERE t.id = r.id
      AND r.rn > 1
    RETURNING 1
  )
  SELECT count(*) INTO v_deactivated_dupes FROM deactivated;

  RETURN jsonb_build_object(
    'deleted_inactive', v_deleted_inactive,
    'deactivated_duplicates', v_deactivated_dupes,
    'ran_at', now()
  );
END;
$$;

-- Helpful index for the cleanup query
CREATE INDEX IF NOT EXISTS notification_device_tokens_user_platform_active_idx
  ON public.notification_device_tokens (user_id, platform, is_active, updated_at DESC);

-- Run once now to clean current state
SELECT public.cleanup_device_tokens();