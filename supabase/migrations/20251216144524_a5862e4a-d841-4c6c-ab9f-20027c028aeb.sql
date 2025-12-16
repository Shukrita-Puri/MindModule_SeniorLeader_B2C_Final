-- Add unified progress tracking columns to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS total_self_mastery_points integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_social_mastery_points integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS current_streak integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS longest_streak integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_streak_celebration integer DEFAULT 0;

-- Add threshold_points column to achievement_definitions
ALTER TABLE public.achievement_definitions
ADD COLUMN IF NOT EXISTS threshold_points integer DEFAULT NULL;

-- Update achievement thresholds with point-based values
-- Self Mastery badges
UPDATE public.achievement_definitions SET threshold_points = 25 WHERE id = 'self_mastery_initiate';
UPDATE public.achievement_definitions SET threshold_points = 50 WHERE id = 'self_mastery_practitioner';
UPDATE public.achievement_definitions SET threshold_points = 100 WHERE id = 'self_mastery_adept';
UPDATE public.achievement_definitions SET threshold_points = 150 WHERE id = 'self_mastery_badge';
UPDATE public.achievement_definitions SET threshold_points = 250 WHERE id = 'self_mastery_certificate';

-- Social Mastery badges
UPDATE public.achievement_definitions SET threshold_points = 25 WHERE id = 'social_mastery_initiate';
UPDATE public.achievement_definitions SET threshold_points = 50 WHERE id = 'social_mastery_practitioner';
UPDATE public.achievement_definitions SET threshold_points = 100 WHERE id = 'social_mastery_adept';
UPDATE public.achievement_definitions SET threshold_points = 150 WHERE id = 'social_mastery_badge';
UPDATE public.achievement_definitions SET threshold_points = 250 WHERE id = 'social_mastery_certificate';