
ALTER TABLE public.daily_checkins
  ADD COLUMN IF NOT EXISTS sleep_hours numeric(3,1),
  ADD COLUMN IF NOT EXISTS sleep_quality smallint,
  ADD COLUMN IF NOT EXISTS sleep_wake_type smallint,
  ADD COLUMN IF NOT EXISTS body_tension_level smallint,
  ADD COLUMN IF NOT EXISTS body_energy_level smallint,
  ADD COLUMN IF NOT EXISTS recovery_yesterday_level smallint,
  ADD COLUMN IF NOT EXISTS carry_load_level smallint;

CREATE OR REPLACE FUNCTION public.validate_body_checkin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sleep_hours IS NOT NULL AND (NEW.sleep_hours < 0 OR NEW.sleep_hours > 24) THEN
    RAISE EXCEPTION 'sleep_hours must be between 0 and 24';
  END IF;
  IF NEW.sleep_quality IS NOT NULL AND NEW.sleep_quality NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'sleep_quality must be between 1 and 4';
  END IF;
  IF NEW.sleep_wake_type IS NOT NULL AND NEW.sleep_wake_type NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'sleep_wake_type must be between 1 and 3';
  END IF;
  IF NEW.body_tension_level IS NOT NULL AND NEW.body_tension_level NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'body_tension_level must be between 1 and 5';
  END IF;
  IF NEW.body_energy_level IS NOT NULL AND NEW.body_energy_level NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'body_energy_level must be between 1 and 5';
  END IF;
  IF NEW.recovery_yesterday_level IS NOT NULL AND NEW.recovery_yesterday_level NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'recovery_yesterday_level must be between 1 and 4';
  END IF;
  IF NEW.carry_load_level IS NOT NULL AND NEW.carry_load_level NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'carry_load_level must be between 1 and 4';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_body_checkin_fields_trigger ON public.daily_checkins;
CREATE TRIGGER validate_body_checkin_fields_trigger
BEFORE INSERT OR UPDATE ON public.daily_checkins
FOR EACH ROW
EXECUTE FUNCTION public.validate_body_checkin_fields();
