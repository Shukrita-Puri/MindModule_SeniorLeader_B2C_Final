import { requireAdmin, writeAdminAudit, adminCorsHeaders, ADMIN_EMAIL_ALLOWLIST } from "../_shared/admin-guard.ts";

const cors = adminCorsHeaders();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Tables we will delete from in admin-delete-user. We SELECT count(*) per
// table here so admins see exact impact before confirming.
// Kept in sync with public.admin_delete_user_data().
const USER_TABLES: Array<[string, string]> = [
  // [tableName, userIdColumn or "session_id_via_dialogue_sessions"]
  ["attendee_relationships", "user_id"],
  ["attendee_resolver_log", "user_id"],
  ["behavior_logs", "user_id"],
  ["brief_snapshots", "user_id"],
  ["calendar_connections", "user_id"],
  ["calendar_event_classifications", "user_id"],
  ["calendar_events", "user_id"],
  ["cancellation_feedback", "user_id"],
  ["causality_findings", "user_id"],
  ["certificate_requests", "user_id"],
  ["checkin_patterns", "user_id"],
  ["checkin_skip_events", "user_id"],
  ["coach_accountability_tracker", "user_id"],
  ["coach_breakthrough_moments", "user_id"],
  ["coach_intervention_outcomes", "user_id"],
  ["coach_memory_index", "user_id"],
  ["coach_pattern_observations", "user_id"],
  ["coach_probing_effectiveness", "user_id"],
  ["coach_scenarios_detected", "user_id"],
  ["coach_session_summaries", "user_id"],
  ["coach_surface_messages", "user_id"],
  ["coach_tools_offered", "user_id"],
  ["content_relevance_feedback", "user_id"],
  ["daily_checkins", "user_id"],
  ["daily_context_snapshot", "user_id"],
  ["daily_ritual_completions", "user_id"],
  ["daily_themes", "user_id"],
  ["dialogue_analytics", "user_id"],
  ["dialogue_sessions", "user_id"],
  ["energy_snapshots", "user_id"],
  ["evening_checkins", "user_id"],
  ["event_classifier_parity_log", "user_id"],
  ["event_physiology_join", "user_id"],
  ["event_priority_derived", "user_id"],
  ["event_priority_memory", "user_id"],
  ["executive_home_card_runs", "user_id"],
  ["inferred_states", "user_id"],
  ["inner_readiness_scores", "user_id"],
  ["jit_cancellation_memory", "user_id"],
  ["jit_carousel_cards", "user_id"],
  ["jit_event_context", "user_id"],
  ["jit_pill_display_log", "user_id"],
  ["jit_preferences", "user_id"],
  ["jit_shadow_v2_runs", "user_id"],
  ["mastery_plan_completions", "user_id"],
  ["mastery_plan_snapshots", "user_id"],
  ["mental_fitness_scores", "user_id"],
  ["meta_skill_progress", "user_id"],
  ["micro_intervention_events", "user_id"],
  ["notification_device_tokens", "user_id"],
  ["notification_evaluator_traces", "user_id"],
  ["notification_log", "user_id"],
  ["notification_preferences", "user_id"],
  ["onboarding_progress", "user_id"],
  ["onboarding_v8_responses", "user_id"],
  ["oura_connections", "user_id"],
  ["physiological_events", "user_id"],
  ["practice_reflections", "user_id"],
  ["practice_sessions", "user_id"],
  ["primary_calendar_events", "user_id"],
  ["processed_outbox_items", "user_id"],
  ["readiness_baselines", "user_id"],
  ["sanctuary_events", "user_id"],
  ["saved_debriefs", "user_id"],
  ["session_feedback", "user_id"],
  ["subscription_events", "user_id"],
  ["tiny_wins", "user_id"],
  ["travel_location_pings", "user_id"],
  ["travel_notifications", "user_id"],
  ["travel_state", "user_id"],
  ["user_achievements", "user_id"],
  ["user_coach_insights", "user_id"],
  ["user_engagements", "user_id"],
  ["user_external_profiles", "user_id"],
  ["user_favorites", "user_id"],
  ["user_integrations", "user_id"],
  ["user_preferences", "user_id"],
  ["user_referrals", "user_id"],
  ["user_roles", "user_id"],
  ["wearable_data", "user_id"],
  ["wearable_signal_diagnostics", "user_id"],
  ["web_primary_calendar_events", "user_id"],
  ["weekly_plan_snapshots", "user_id"],
  ["profiles", "id"],
];

function isProtectedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return ADMIN_EMAIL_ALLOWLIST.some((a) => a.toLowerCase() === e);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const guard = await requireAdmin(req);
  if (guard.errorResponse) return guard.errorResponse;
  const { db, admin } = guard;

  const body = await req.json().catch(() => ({}));
  const targetUserId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!targetUserId) return json({ error: "userId required" }, 400);

  if (targetUserId === admin!.adminSub) {
    return json({ error: "Admins cannot delete their own account." }, 400);
  }

  const { data: targetProfile } = await db
    .from("profiles")
    .select("id, email, full_name, display_name")
    .eq("id", targetUserId)
    .maybeSingle();

  const targetEmail = (targetProfile?.email as string | null) ?? null;
  if (isProtectedEmail(targetEmail)) {
    return json({ error: "This account is protected and cannot be deleted." }, 400);
  }

  const counts: Record<string, number> = {};
  // Non-user_id linked (dialogue subordinate tables).
  const { data: sessionIds } = await db
    .from("dialogue_sessions")
    .select("id")
    .eq("user_id", targetUserId);
  const sessIds = (sessionIds ?? []).map((r: any) => r.id).filter(Boolean);
  const dialogueChildren = ["dialogue_messages", "dialogue_interventions", "dialogue_skill_events", "detected_signals"];
  for (const t of dialogueChildren) {
    if (!sessIds.length) { counts[t] = 0; continue; }
    const { count } = await db.from(t).select("id", { count: "exact", head: true }).in("session_id", sessIds);
    counts[t] = count ?? 0;
  }

  // referral_conversions: two columns
  {
    const { count } = await db
      .from("referral_conversions")
      .select("id", { count: "exact", head: true })
      .or(`referrer_id.eq.${targetUserId},referee_id.eq.${targetUserId}`);
    counts["referral_conversions"] = count ?? 0;
  }

  for (const [table, col] of USER_TABLES) {
    const { count, error } = await db
      .from(table)
      .select(col === "id" ? "id" : col, { count: "exact", head: true })
      .eq(col, targetUserId);
    if (error) {
      counts[table] = -1;
      console.warn("[admin-user-delete-preview] count error", table, error.message);
    } else {
      counts[table] = count ?? 0;
    }
  }

  const totalRows = Object.values(counts).filter((n) => n > 0).reduce((s, n) => s + n, 0);

  await writeAdminAudit(db, {
    admin: admin!,
    action: "ADMIN_USER_DELETE_PREVIEWED",
    targetUserId,
    targetEmail,
    route: "/admin/users/:userId",
    metadata: { total_rows: totalRows },
  });

  return json({
    target: {
      id: targetUserId,
      email: targetEmail,
      name: targetProfile?.display_name ?? targetProfile?.full_name ?? null,
    },
    counts,
    totalRows,
  });
});