-- Phase 1: Add duplicate prevention constraint on certificate_requests
CREATE UNIQUE INDEX IF NOT EXISTS certificate_requests_user_achievement_uniq
ON public.certificate_requests (user_id, achievement_id);