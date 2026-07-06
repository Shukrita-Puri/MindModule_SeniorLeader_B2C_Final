
ALTER TABLE public.oura_connections
  ADD COLUMN IF NOT EXISTS writes_to_apple_health boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.oura_connections.writes_to_apple_health IS
  'True when the user has Oura configured to write/mirror data into Apple Health, used by wearable merge provenance to avoid double-counting or mis-prioritizing mirrored Oura data.';

UPDATE public.oura_connections oc
SET writes_to_apple_health = true
WHERE oc.is_active = true
  AND oc.writes_to_apple_health = false
  AND EXISTS (
    SELECT 1
    FROM public.wearable_data wd
    WHERE wd.user_id = oc.user_id
      AND wd.source_provider = 'oura_via_apple_health'
  );
