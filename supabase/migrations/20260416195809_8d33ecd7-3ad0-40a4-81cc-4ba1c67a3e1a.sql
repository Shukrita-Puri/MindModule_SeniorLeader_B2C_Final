-- Rename column for consistency with clarity_level and confidence_level
ALTER TABLE public.daily_checkins
  RENAME COLUMN mental_sharpness_score TO mental_sharpness_level;

-- Rename associated check constraint if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'daily_checkins_mental_sharpness_score_check'
  ) THEN
    ALTER TABLE public.daily_checkins
      RENAME CONSTRAINT daily_checkins_mental_sharpness_score_check
      TO daily_checkins_mental_sharpness_level_check;
  END IF;
END $$;