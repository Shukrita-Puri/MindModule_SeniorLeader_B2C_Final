
-- Admin: permanently delete a single user's MindModule data across every
-- user-owned public table. Returns jsonb { table_name: deleted_row_count }.
-- Runs implicitly inside a single transaction as invoked by PostgREST/RPC.
-- SECURITY DEFINER so the calling service_role client can execute; the
-- edge function `admin-delete-user` is the ONLY sanctioned caller.
CREATE OR REPLACE FUNCTION public.admin_delete_user_data(_user_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  counts jsonb := '{}'::jsonb;
  n integer;
BEGIN
  IF _user_id IS NULL OR length(trim(_user_id)) = 0 THEN
    RAISE EXCEPTION 'admin_delete_user_data: _user_id required';
  END IF;

  -- Dialogue subordinate tables (linked by session_id, not user_id).
  DELETE FROM public.dialogue_messages       WHERE session_id IN (SELECT id FROM public.dialogue_sessions WHERE user_id = _user_id);
    GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('dialogue_messages', n);
  DELETE FROM public.dialogue_interventions  WHERE session_id IN (SELECT id FROM public.dialogue_sessions WHERE user_id = _user_id);
    GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('dialogue_interventions', n);
  DELETE FROM public.dialogue_skill_events   WHERE session_id IN (SELECT id FROM public.dialogue_sessions WHERE user_id = _user_id);
    GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('dialogue_skill_events', n);
  DELETE FROM public.detected_signals        WHERE session_id IN (SELECT id FROM public.dialogue_sessions WHERE user_id = _user_id);
    GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('detected_signals', n);

  -- User-owned tables (all tables in public.* with a user_id column).
  FOR n IN 0..0 LOOP END LOOP; -- no-op placeholder

  -- explicit deletes so ordering / logging is deterministic
  DELETE FROM public.attendee_relationships          WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('attendee_relationships', n);
  DELETE FROM public.attendee_resolver_log           WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('attendee_resolver_log', n);
  DELETE FROM public.behavior_logs                   WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('behavior_logs', n);
  DELETE FROM public.brief_snapshots                 WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('brief_snapshots', n);
  DELETE FROM public.calendar_connections            WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('calendar_connections', n);
  DELETE FROM public.calendar_event_classifications  WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('calendar_event_classifications', n);
  DELETE FROM public.calendar_events                 WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('calendar_events', n);
  DELETE FROM public.cancellation_feedback           WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('cancellation_feedback', n);
  DELETE FROM public.causality_findings              WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('causality_findings', n);
  DELETE FROM public.certificate_requests            WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('certificate_requests', n);
  DELETE FROM public.checkin_patterns                WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('checkin_patterns', n);
  DELETE FROM public.checkin_skip_events             WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('checkin_skip_events', n);
  DELETE FROM public.coach_accountability_tracker    WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('coach_accountability_tracker', n);
  DELETE FROM public.coach_breakthrough_moments      WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('coach_breakthrough_moments', n);
  DELETE FROM public.coach_intervention_outcomes     WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('coach_intervention_outcomes', n);
  DELETE FROM public.coach_memory_index              WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('coach_memory_index', n);
  DELETE FROM public.coach_pattern_observations      WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('coach_pattern_observations', n);
  DELETE FROM public.coach_probing_effectiveness     WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('coach_probing_effectiveness', n);
  DELETE FROM public.coach_scenarios_detected        WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('coach_scenarios_detected', n);
  DELETE FROM public.coach_session_summaries         WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('coach_session_summaries', n);
  DELETE FROM public.coach_surface_messages          WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('coach_surface_messages', n);
  DELETE FROM public.coach_tools_offered             WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('coach_tools_offered', n);
  DELETE FROM public.content_relevance_feedback      WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('content_relevance_feedback', n);
  DELETE FROM public.daily_checkins                  WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('daily_checkins', n);
  DELETE FROM public.daily_context_snapshot          WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('daily_context_snapshot', n);
  DELETE FROM public.daily_ritual_completions        WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('daily_ritual_completions', n);
  DELETE FROM public.daily_themes                    WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('daily_themes', n);
  DELETE FROM public.dialogue_analytics              WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('dialogue_analytics', n);
  DELETE FROM public.dialogue_sessions               WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('dialogue_sessions', n);
  DELETE FROM public.energy_snapshots                WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('energy_snapshots', n);
  DELETE FROM public.evening_checkins                WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('evening_checkins', n);
  DELETE FROM public.event_classifier_parity_log     WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('event_classifier_parity_log', n);
  DELETE FROM public.event_physiology_join           WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('event_physiology_join', n);
  DELETE FROM public.event_priority_derived          WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('event_priority_derived', n);
  DELETE FROM public.event_priority_memory           WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('event_priority_memory', n);
  DELETE FROM public.executive_home_card_runs        WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('executive_home_card_runs', n);
  DELETE FROM public.inferred_states                 WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('inferred_states', n);
  DELETE FROM public.inner_readiness_scores          WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('inner_readiness_scores', n);
  DELETE FROM public.jit_cancellation_memory         WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('jit_cancellation_memory', n);
  DELETE FROM public.jit_carousel_cards              WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('jit_carousel_cards', n);
  DELETE FROM public.jit_event_context               WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('jit_event_context', n);
  DELETE FROM public.jit_pill_display_log            WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('jit_pill_display_log', n);
  DELETE FROM public.jit_preferences                 WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('jit_preferences', n);
  DELETE FROM public.jit_shadow_v2_runs              WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('jit_shadow_v2_runs', n);
  DELETE FROM public.mastery_plan_completions        WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('mastery_plan_completions', n);
  DELETE FROM public.mastery_plan_snapshots          WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('mastery_plan_snapshots', n);
  DELETE FROM public.mental_fitness_scores           WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('mental_fitness_scores', n);
  DELETE FROM public.meta_skill_progress             WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('meta_skill_progress', n);
  DELETE FROM public.micro_intervention_events       WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('micro_intervention_events', n);
  DELETE FROM public.notification_device_tokens      WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('notification_device_tokens', n);
  DELETE FROM public.notification_evaluator_traces   WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('notification_evaluator_traces', n);
  DELETE FROM public.notification_log                WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('notification_log', n);
  DELETE FROM public.notification_preferences        WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('notification_preferences', n);
  DELETE FROM public.onboarding_progress             WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('onboarding_progress', n);
  DELETE FROM public.onboarding_v8_responses         WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('onboarding_v8_responses', n);
  DELETE FROM public.oura_connections                WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('oura_connections', n);
  DELETE FROM public.physiological_events            WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('physiological_events', n);
  DELETE FROM public.practice_reflections            WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('practice_reflections', n);
  DELETE FROM public.practice_sessions               WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('practice_sessions', n);
  DELETE FROM public.primary_calendar_events         WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('primary_calendar_events', n);
  DELETE FROM public.processed_outbox_items          WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('processed_outbox_items', n);
  DELETE FROM public.readiness_baselines             WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('readiness_baselines', n);
  DELETE FROM public.referral_conversions            WHERE referrer_id = _user_id OR referee_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('referral_conversions', n);
  DELETE FROM public.sanctuary_events                WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('sanctuary_events', n);
  DELETE FROM public.saved_debriefs                  WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('saved_debriefs', n);
  DELETE FROM public.session_feedback                WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('session_feedback', n);
  DELETE FROM public.subscription_events             WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('subscription_events', n);
  DELETE FROM public.tiny_wins                       WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('tiny_wins', n);
  DELETE FROM public.travel_location_pings           WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('travel_location_pings', n);
  DELETE FROM public.travel_notifications            WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('travel_notifications', n);
  DELETE FROM public.travel_state                    WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('travel_state', n);
  DELETE FROM public.user_achievements               WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('user_achievements', n);
  DELETE FROM public.user_coach_insights             WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('user_coach_insights', n);
  DELETE FROM public.user_engagements                WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('user_engagements', n);
  DELETE FROM public.user_external_profiles          WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('user_external_profiles', n);
  DELETE FROM public.user_favorites                  WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('user_favorites', n);
  DELETE FROM public.user_integrations               WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('user_integrations', n);
  DELETE FROM public.user_preferences                WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('user_preferences', n);
  DELETE FROM public.user_referrals                  WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('user_referrals', n);
  DELETE FROM public.user_roles                      WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('user_roles', n);
  DELETE FROM public.wearable_data                   WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('wearable_data', n);
  DELETE FROM public.wearable_signal_diagnostics     WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('wearable_signal_diagnostics', n);
  DELETE FROM public.web_primary_calendar_events     WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('web_primary_calendar_events', n);
  DELETE FROM public.weekly_plan_snapshots           WHERE user_id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('weekly_plan_snapshots', n);

  -- Finally, the profile itself.
  DELETE FROM public.profiles WHERE id = _user_id; GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('profiles', n);

  RETURN counts;
END;
$fn$;

-- Only service_role may execute (edge functions run with service_role).
REVOKE ALL ON FUNCTION public.admin_delete_user_data(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_user_data(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_data(text) TO service_role;
