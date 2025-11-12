-- Add onboarding fields to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamp with time zone;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS identity_role text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS biggest_pressure text;

-- Behavioral responses (for future reference)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS q1_setback_response text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS q2_pressure_response text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS q3_communication_style text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS q4_self_assessed_strength text;

-- Self-regulation focused (MVP)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS energy_regulation_response text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS focus_recovery_response text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS energy_renewal_response text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS growth_priority text;

-- Calculated scores and results
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mental_fitness_baseline integer;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS component_scores jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS meta_skill_scores jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_type text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_description text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS user_archetype text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS alignment_status text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_session_id text;