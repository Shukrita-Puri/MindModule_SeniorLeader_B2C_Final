ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_timezone_changed_at timestamptz;

COMMENT ON COLUMN public.profiles.current_timezone_changed_at IS
  'Set at login when current_timezone changes value. Primary clock for relocation detection. Immune to GPS ping resets (unlike travel_state.last_timezone_change_at). Only updated from sync-profile.';

ALTER TABLE public.profiles REPLICA IDENTITY DEFAULT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;