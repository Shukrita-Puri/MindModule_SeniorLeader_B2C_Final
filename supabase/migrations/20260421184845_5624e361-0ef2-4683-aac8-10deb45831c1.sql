ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS home_timezone text,
  ADD COLUMN IF NOT EXISTS current_timezone text;

COMMENT ON COLUMN public.profiles.home_timezone IS 'IANA timezone string captured once at first login. Never overwritten. Used for circadian/jetlag context.';
COMMENT ON COLUMN public.profiles.current_timezone IS 'IANA timezone string refreshed on every sync-profile call. Reflects where the user currently is. Used to format event times in user-facing copy.';