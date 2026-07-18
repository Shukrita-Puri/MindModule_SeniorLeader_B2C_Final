
-- Block direct client updates to privileged profile columns.
-- Users may still update self-service fields; all writes to entitlement/
-- monetization/system-computed fields must come from service_role (edge
-- functions, webhooks, admin RPCs).

CREATE OR REPLACE FUNCTION public.profiles_block_privileged_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  privileged_changed boolean := false;
BEGIN
  -- service_role bypasses all restrictions
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF (NEW.subscription_status IS DISTINCT FROM OLD.subscription_status)
     OR (NEW.subscription_plan IS DISTINCT FROM OLD.subscription_plan)
     OR (NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier)
     OR (NEW.subscription_currency IS DISTINCT FROM OLD.subscription_currency)
     OR (NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at)
     OR (NEW.subscription_current_period_start IS DISTINCT FROM OLD.subscription_current_period_start)
     OR (NEW.subscription_current_period_end IS DISTINCT FROM OLD.subscription_current_period_end)
     OR (NEW.subscription_cancel_at IS DISTINCT FROM OLD.subscription_cancel_at)
     OR (NEW.subscription_canceled_at IS DISTINCT FROM OLD.subscription_canceled_at)
     OR (NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id)
     OR (NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id)
     OR (NEW.beta_user IS DISTINCT FROM OLD.beta_user)
     OR (NEW.beta_expires_at IS DISTINCT FROM OLD.beta_expires_at)
     OR (NEW.founding_member IS DISTINCT FROM OLD.founding_member)
     OR (NEW.founding_member_granted_at IS DISTINCT FROM OLD.founding_member_granted_at)
     OR (NEW.referral_code_used IS DISTINCT FROM OLD.referral_code_used)
     OR (NEW.referral_code_entered_at IS DISTINCT FROM OLD.referral_code_entered_at)
     OR (NEW.mental_fitness_baseline IS DISTINCT FROM OLD.mental_fitness_baseline)
     OR (NEW.component_scores IS DISTINCT FROM OLD.component_scores)
     OR (NEW.meta_skill_scores IS DISTINCT FROM OLD.meta_skill_scores)
     OR (NEW.profile_type IS DISTINCT FROM OLD.profile_type)
     OR (NEW.profile_description IS DISTINCT FROM OLD.profile_description)
     OR (NEW.user_archetype IS DISTINCT FROM OLD.user_archetype)
     OR (NEW.archetype_title IS DISTINCT FROM OLD.archetype_title)
     OR (NEW.archetype_description IS DISTINCT FROM OLD.archetype_description)
     OR (NEW.alignment_status IS DISTINCT FROM OLD.alignment_status)
     OR (NEW.onboarding_insight IS DISTINCT FROM OLD.onboarding_insight)
     OR (NEW.total_self_mastery_points IS DISTINCT FROM OLD.total_self_mastery_points)
     OR (NEW.total_social_mastery_points IS DISTINCT FROM OLD.total_social_mastery_points)
     OR (NEW.current_streak IS DISTINCT FROM OLD.current_streak)
     OR (NEW.longest_streak IS DISTINCT FROM OLD.longest_streak)
     OR (NEW.last_streak_celebration IS DISTINCT FROM OLD.last_streak_celebration)
     OR (NEW.practice_priority_tag IS DISTINCT FROM OLD.practice_priority_tag)
     OR (NEW.pressure_context_tag IS DISTINCT FROM OLD.pressure_context_tag)
     OR (NEW.linkedin_raw_markdown IS DISTINCT FROM OLD.linkedin_raw_markdown)
     OR (NEW.linkedin_analyzed_at IS DISTINCT FROM OLD.linkedin_analyzed_at)
     OR (NEW.leadership_context IS DISTINCT FROM OLD.leadership_context)
     OR (NEW.inferred_priorities IS DISTINCT FROM OLD.inferred_priorities)
     OR (NEW.pressure_profile IS DISTINCT FROM OLD.pressure_profile)
     OR (NEW.id IS DISTINCT FROM OLD.id)
     OR (NEW.created_at IS DISTINCT FROM OLD.created_at)
  THEN
    privileged_changed := true;
  END IF;

  IF privileged_changed THEN
    RAISE EXCEPTION 'Privileged profile fields cannot be modified by users. Use service_role/edge functions.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_block_privileged_updates_trg ON public.profiles;
CREATE TRIGGER profiles_block_privileged_updates_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.profiles_block_privileged_updates();

-- Also block user-inserted rows from setting privileged non-default values.
CREATE OR REPLACE FUNCTION public.profiles_block_privileged_inserts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Force privileged fields to safe defaults on client-side insert.
  NEW.subscription_status := NULL;
  NEW.subscription_plan := NULL;
  NEW.subscription_tier := NULL;
  NEW.subscription_currency := NULL;
  NEW.trial_ends_at := NULL;
  NEW.subscription_current_period_start := NULL;
  NEW.subscription_current_period_end := NULL;
  NEW.subscription_cancel_at := NULL;
  NEW.subscription_canceled_at := NULL;
  NEW.stripe_customer_id := NULL;
  NEW.stripe_subscription_id := NULL;
  NEW.beta_user := false;
  NEW.beta_expires_at := NULL;
  NEW.founding_member := false;
  NEW.founding_member_granted_at := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_block_privileged_inserts_trg ON public.profiles;
CREATE TRIGGER profiles_block_privileged_inserts_trg
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.profiles_block_privileged_inserts();
