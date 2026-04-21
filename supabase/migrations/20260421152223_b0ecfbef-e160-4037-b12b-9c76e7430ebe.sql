-- Add LLM telemetry + pillar mode columns to brief_snapshots
ALTER TABLE public.brief_snapshots
  ADD COLUMN IF NOT EXISTS llm_fallback_reason TEXT,
  ADD COLUMN IF NOT EXISTS llm_attempts JSONB,
  ADD COLUMN IF NOT EXISTS validator_rejections JSONB,
  ADD COLUMN IF NOT EXISTS pillar_mode TEXT;

-- Allow service_role + the existing user-update guard to permit these new fields.
-- The brief_snapshots_user_update_guard already restricts user updates to
-- user_rating + feedback_text only; new server-managed columns are implicitly
-- blocked from end-user updates and writable only via service_role, which is
-- the desired behaviour.

-- Clear today's snapshots so the new v6.2 pill logic + telemetry take effect on next load.
DELETE FROM public.brief_snapshots
WHERE local_date = (now() AT TIME ZONE 'UTC')::date
   OR local_date = (now() AT TIME ZONE 'UTC' - INTERVAL '1 day')::date;