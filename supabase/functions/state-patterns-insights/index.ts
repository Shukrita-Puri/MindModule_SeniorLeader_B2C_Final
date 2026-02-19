import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ──────────────────────────────────────────────
// Archetype cascade (priority order)
// ──────────────────────────────────────────────
interface ArchetypeResult {
  id: string;
  title: string;
  leanOn: string;
  watchFor: string;
}

function resolveArchetypeFromScores(er: number, fr: number, en: number): ArchetypeResult {
  if (er >= 65 && en >= 55)
    return { id: "grounded-leader", title: "The Grounded Master", leanOn: "Stability and presence — you lead from a centered place.", watchFor: "Over-reliance on composure when renewal is needed." };
  if (en >= 65 && er >= 50)
    return { id: "resilient-performer", title: "The Resilient Performer", leanOn: "Recovery capacity — you absorb impact and bounce back.", watchFor: "Pushing through when regulation would serve you better." };
  if (fr >= 65 && er >= 45)
    return { id: "clear-thinker", title: "The Clear Thinker", leanOn: "Mental clarity — you cut through complexity with precision.", watchFor: "Over-thinking when action or rest is what's needed." };
  if (er >= 60 && fr < 50)
    return { id: "intensity-driver", title: "The Intensity Driver", leanOn: "Directed force — you channel intensity into focused action.", watchFor: "Intensity without clarity can fragment your focus." };
  return { id: "adaptive-navigator", title: "The Adaptive Navigator", leanOn: "Flexibility — you read the field and adjust in real time.", watchFor: "Adapting constantly without anchoring can be depleting." };
}

// Map legacy archetype IDs → v2 keys
const LEGACY_MAP: Record<string, string> = {
  natural_regulator: "grounded-leader",
  strategic_pauser: "clear-thinker",
  high_octane_performer: "resilient-performer",
  awareness_builder: "intensity-driver",
  grounded_master: "grounded-leader",
  balanced_navigator: "adaptive-navigator",
};

function extractBaselineScores(cs: any): { er: number; fr: number; en: number } {
  return {
    er: cs?.energyRegulation ?? cs?.q2_energy_regulation ?? 50,
    fr: cs?.focusRecovery ?? cs?.q3_focus_recovery ?? 50,
    en: cs?.energyRenewal ?? cs?.q4_energy_renewal ?? 50,
  };
}

// ──────────────────────────────────────────────
// Weight redistribution helper
// ──────────────────────────────────────────────
interface Signal {
  name: string;
  value: number;
  weight: number;
  available: boolean;
}

function computeWeightedScore(signals: Signal[]): number {
  const available = signals.filter((s) => s.available);
  const totalWeight = available.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight === 0) return 50;
  return available.reduce((sum, s) => sum + s.value * (s.weight / totalWeight), 0);
}

// ──────────────────────────────────────────────
// Coach dialogue keyword scanning
// ──────────────────────────────────────────────
const REG_POSITIVE = /stayed grounded|regulation held|maintained composure|didn't react|caught it early|stayed calm|kept your center|held steady/i;
const REG_NEGATIVE = /escalated|lost composure|reacted quickly|got pulled in|snapped|lost it|couldn't regulate/i;

const CLARITY_POSITIVE = /cut through clearly|sharp thinking|decisive|saw it clearly|clarity held|focused|clear-headed|precision/i;
const CLARITY_NEGATIVE = /lost in the weeds|analysis paralysis|foggy|couldn't decide|overthinking|fragmented|scattered|lost the thread/i;

const RENEWAL_POSITIVE = /recovering well|building reserves|restored|recharged|sustainable pace|bounced back|renewed|replenished/i;
const RENEWAL_NEGATIVE = /running on empty|not restoring|depleted|burning out|can't recover|exhausted|drained|no reserves/i;

function scanKeywords(messages: { content: string }[], pos: RegExp, neg: RegExp): number {
  let score = 0;
  for (const m of messages) {
    if (pos.test(m.content)) score += 5;
    if (neg.test(m.content)) score -= 5;
  }
  return Math.max(-15, Math.min(15, score));
}

// ──────────────────────────────────────────────
// Tier proxy from outcome
// ──────────────────────────────────────────────
function outcomeTier(outcome: string): "peak" | "managing" | "depleted" {
  const o = outcome?.toLowerCase();
  if (o === "focused" || o === "steady") return "peak";
  if (o === "scattered") return "managing";
  return "depleted"; // drained, overwhelmed
}

// ──────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const AUTH0_DOMAIN = Deno.env.get("VITE_AUTH0_DOMAIN");
    if (!AUTH0_DOMAIN) throw new Error("VITE_AUTH0_DOMAIN not configured");

    const userInfoRes = await fetch(`https://${AUTH0_DOMAIN}/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!userInfoRes.ok) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userInfo = await userInfoRes.json();
    const userId = userInfo.sub;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyStr = thirtyDaysAgo.toISOString().split("T")[0];

    // ── Parallel queries ──
    const [
      profileRes, checkInsRes, themesRes, coachInsightsRes,
      sanctuaryRes, ritualRes, tinyWinsRes, wearableRes,
      dialogueSessionsRes, calConnRes, behaviorRes, innerReadinessRes,
    ] = await Promise.all([
      supabase.from("profiles").select("user_archetype, component_scores").eq("id", userId).single(),
      supabase.from("daily_checkins").select("checkin_date, outcome, energy_balance, clarity_level, confidence_level, created_at").eq("user_id", userId).gte("checkin_date", thirtyStr).order("checkin_date", { ascending: true }),
      supabase.from("daily_themes").select("theme_phrase, theme_driver").eq("user_id", userId).gte("theme_date", thirtyStr),
      supabase.from("user_coach_insights").select("insight_content, created_at, insight_type").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
      supabase.from("sanctuary_events").select("category, event_type, timestamp, context_data").eq("user_id", userId).gte("timestamp", thirtyDaysAgo.toISOString()),
      supabase.from("daily_ritual_completions").select("session_period, completion_status, ritual_date").eq("user_id", userId).gte("ritual_date", thirtyStr),
      supabase.from("tiny_wins").select("win_date").eq("user_id", userId).gte("win_date", thirtyStr),
      supabase.from("wearable_data").select("hrv, summary_date").eq("user_id", userId).gte("summary_date", thirtyStr).order("summary_date", { ascending: true }),
      supabase.from("dialogue_sessions").select("id").eq("user_id", userId).gte("created_at", thirtyDaysAgo.toISOString()),
      supabase.from("calendar_connections").select("id").eq("user_id", userId).eq("is_active", true).limit(1),
      supabase.from("behavior_logs").select("behavior_type, created_at").eq("user_id", userId).gte("created_at", thirtyDaysAgo.toISOString()),
      supabase.from("inner_readiness_scores").select("composite_score, energy_tier, full_context_statement, divergence_flag, layers_active, score_date").eq("user_id", userId).gte("score_date", thirtyStr).order("score_date", { ascending: true }),
    ]);

    const profile = profileRes.data;
    const checkIns = checkInsRes.data || [];
    const themes = themesRes.data || [];
    const coachInsights = coachInsightsRes.data || [];
    const sanctuaryEvents = sanctuaryRes.data || [];
    const ritualCompletions = ritualRes.data || [];
    const tinyWins = tinyWinsRes.data || [];
    const wearableData = wearableRes.data || [];
    const dialogueSessions = dialogueSessionsRes.data || [];
    const hasWearable = wearableData.length > 0;
    const hasCalendar = (calConnRes.data || []).length > 0;
    const behaviorLogs = behaviorRes.data || [];
    const innerReadinessScores = innerReadinessRes.data || [];

    const totalCheckins = checkIns.length;
    const coachSessionCount = dialogueSessions.length;

    // ── Coach dialogue messages (if sessions exist) ──
    let dialogueMessages: { content: string }[] = [];
    if (coachSessionCount > 0) {
      const sessionIds = dialogueSessions.map((s: any) => s.id);
      const { data: msgs } = await supabase.from("dialogue_messages").select("content").in("session_id", sessionIds);
      dialogueMessages = (msgs || []).map((m: any) => ({ content: m.content || "" }));
    }

    // ── Baseline scores & archetype ──
    const cs = profile?.component_scores as any;
    const baseline = extractBaselineScores(cs);
    const baselineScores = { recalibration: Math.round(baseline.er), clarity: Math.round(baseline.fr), renewal: Math.round(baseline.en) };
    const baselineArch = resolveArchetypeFromScores(baseline.er, baseline.fr, baseline.en);

    // ── Date helpers ──
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenStr = sevenDaysAgo.toISOString().split("T")[0];
    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const fourteenStr = fourteenDaysAgo.toISOString().split("T")[0];

    // ── Friction frequency ──
    const lowStates = checkIns.filter((c: any) => ["drained", "overwhelmed", "scattered"].includes(c.outcome?.toLowerCase() || ""));
    const frictionPct = totalCheckins > 0 ? Math.round((lowStates.length / totalCheckins) * 100) : 0;
    const frictionLabel = frictionPct <= 25 ? "Low friction" : frictionPct <= 50 ? "Moderate friction" : frictionPct <= 75 ? "High friction pattern" : "Sustained friction";

    // Friction trend (last 7 vs prior 7)
    const recentCheckins7 = checkIns.filter((c: any) => c.checkin_date >= sevenStr);
    const priorCheckins7 = checkIns.filter((c: any) => c.checkin_date >= fourteenStr && c.checkin_date < sevenStr);
    let trendDirection: "improving" | "stable" | "declining" = "stable";

    if (recentCheckins7.length > 0 && priorCheckins7.length > 0) {
      const recentFriction = recentCheckins7.filter((c: any) => ["drained", "overwhelmed", "scattered"].includes(c.outcome?.toLowerCase() || "")).length / recentCheckins7.length * 100;
      const priorFriction = priorCheckins7.filter((c: any) => ["drained", "overwhelmed", "scattered"].includes(c.outcome?.toLowerCase() || "")).length / priorCheckins7.length * 100;
      const diff = priorFriction - recentFriction; // positive = improving (less friction now)
      if (diff >= 10) trendDirection = "improving";
      else if (diff <= -10) trendDirection = "declining";
    } else {
      // Fallback to energy_balance trend
      const ebRecent = checkIns.filter((c: any) => c.checkin_date >= sevenStr && c.energy_balance != null);
      const ebPrior = checkIns.filter((c: any) => c.checkin_date >= fourteenStr && c.checkin_date < sevenStr && c.energy_balance != null);
      if (ebRecent.length > 0 && ebPrior.length > 0) {
        const rAvg = ebRecent.reduce((s: number, c: any) => s + c.energy_balance, 0) / ebRecent.length;
        const pAvg = ebPrior.reduce((s: number, c: any) => s + c.energy_balance, 0) / ebPrior.length;
        if (rAvg - pAvg > 5) trendDirection = "improving";
        else if (rAvg - pAvg < -5) trendDirection = "declining";
      }
    }

    // Typical state
    const distribution: Record<string, number> = { focused: 0, steady: 0, scattered: 0, drained: 0, overwhelmed: 0 };
    checkIns.forEach((c: any) => { const o = c.outcome?.toLowerCase(); if (o && o in distribution) distribution[o]++; });
    const sortedStates = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
    const typicalState = sortedStates.length > 0 && sortedStates[0][1] > 0 ? sortedStates[0][0] : null;

    // ── Recurring compass themes ──
    const themeCounts = new Map<string, number>();
    themes.forEach((t: any) => { if (t.theme_phrase) themeCounts.set(t.theme_phrase, (themeCounts.get(t.theme_phrase) || 0) + 1); });
    const recurringThemes = Array.from(themeCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([phrase, count]) => ({ phrase, count }));

    // ── Coach insights (lean on / watch for keyword match) ──
    const strengthKw = /strength|strong|excel|composure|resilient|clarity|conviction|grounded|held|showed up|brought|capacity|resource/i;
    const frictionKw = /struggle|challenge|pattern|watch for|friction|tendency|recurring|avoidance|escalated|reactive|lost|slipping|cost/i;
    let coachStrength: string | null = null;
    let coachFriction: string | null = null;
    for (const ins of coachInsights) {
      const ic = ins.insight_content || "";
      if (!coachStrength && strengthKw.test(ic)) coachStrength = ic.substring(0, 120);
      if (!coachFriction && frictionKw.test(ic)) coachFriction = ic.substring(0, 120);
      if (coachStrength && coachFriction) break;
    }

    // ── Build same-day checkin-outcome map for cross-referencing practices ──
    const checkinByDate = new Map<string, string>();
    checkIns.forEach((c: any) => checkinByDate.set(c.checkin_date, c.outcome?.toLowerCase() || ""));

    // ──────────────────────────────────────────
    // EVOLVED SCORES — MULTI-SIGNAL MODEL
    // ──────────────────────────────────────────

    // --- Recalibration signals ---
    // Pause practices in low state
    const pauseInLow = sanctuaryEvents.filter((e: any) => {
      if (e.category !== "pause") return false;
      const eDate = e.timestamp?.split("T")[0];
      const dayOutcome = eDate ? checkinByDate.get(eDate) : null;
      return dayOutcome && ["drained", "overwhelmed", "scattered"].includes(dayOutcome);
    }).length;
    const pauseScore = Math.min(100, pauseInLow * 5);

    // Pre-event sessions
    const preEventSessions = ritualCompletions.filter((r: any) => r.session_period === "pre-event" && r.completion_status === "full").length;
    const preEventScore = Math.min(100, preEventSessions * 5);

    // HRV trend
    let hrvTrendScore = 50; // neutral
    const hrvData = wearableData.filter((d: any) => d.hrv != null);
    if (hrvData.length >= 14) {
      const hrvRecent = hrvData.filter((d: any) => d.summary_date >= sevenStr);
      const hrvPrior = hrvData.filter((d: any) => d.summary_date >= fourteenStr && d.summary_date < sevenStr);
      if (hrvRecent.length > 0 && hrvPrior.length > 0) {
        const rAvg = hrvRecent.reduce((s: number, d: any) => s + Number(d.hrv), 0) / hrvRecent.length;
        const pAvg = hrvPrior.reduce((s: number, d: any) => s + Number(d.hrv), 0) / hrvPrior.length;
        const pctChange = ((rAvg - pAvg) / pAvg) * 100;
        if (pctChange >= 5) hrvTrendScore = 60;
        else if (pctChange <= -5) hrvTrendScore = 40;
      }
    }

    // Coach regulation score
    const coachRegScore = scanKeywords(dialogueMessages, REG_POSITIVE, REG_NEGATIVE);

    // Felt state (energy_balance last 7 days)
    const recentEB = checkIns.filter((c: any) => c.checkin_date >= sevenStr && c.energy_balance != null).map((c: any) => c.energy_balance as number);
    const feltER = recentEB.length > 0 ? Math.round(recentEB.reduce((s, v) => s + v, 0) / recentEB.length) : 50;

    // Consecutive low penalty
    let consecutiveLow = 0;
    let maxConsecutiveLow = 0;
    for (const c of checkIns) {
      const tier = outcomeTier(c.outcome);
      if (tier === "depleted" || tier === "managing") { consecutiveLow++; maxConsecutiveLow = Math.max(maxConsecutiveLow, consecutiveLow); }
      else { consecutiveLow = 0; }
    }

    const recalibrationSignals: Signal[] = [
      { name: "baseline", value: baseline.er, weight: 0.30, available: true },
      { name: "pause", value: pauseScore, weight: 0.15, available: pauseInLow >= 3 },
      { name: "preEvent", value: preEventScore, weight: 0.10, available: preEventSessions >= 2 },
      { name: "hrv", value: hrvTrendScore, weight: 0.10, available: hrvData.length >= 14 },
      { name: "coach", value: 50 + coachRegScore, weight: 0.15, available: coachSessionCount >= 1 },
      { name: "felt", value: feltER, weight: 0.20, available: recentEB.length >= 3 },
    ];
    let evolvedER = computeWeightedScore(recalibrationSignals);
    if (maxConsecutiveLow >= 3) evolvedER -= 10;
    evolvedER = Math.max(0, Math.min(100, Math.round(evolvedER)));

    // --- Clarity signals ---
    // Flow practices under high calendar load
    const flowUnderLoad = sanctuaryEvents.filter((e: any) => {
      if (e.category !== "flow") return false;
      // Approximate: just count flow practices (calendar pressure would require joining calendar_events)
      return true;
    }).length;
    const flowScore = Math.min(100, flowUnderLoad * 5);

    // Coach clarity score
    const coachClarityScore = scanKeywords(dialogueMessages, CLARITY_POSITIVE, CLARITY_NEGATIVE);

    // Clarity theme recurrence penalty
    const clarityThemePatterns = /clarity before stakes|focus or fragment|reclaim your attention/i;
    const clarityThemeCount = themes.filter((t: any) => clarityThemePatterns.test(t.theme_phrase || "")).length;
    const clarityThemePenalty = (totalCheckins >= 10 && clarityThemeCount >= 5) ? -5 : 0;

    // Scattered cause-effect penalty
    const scatteredCount = checkIns.filter((c: any) => c.outcome?.toLowerCase() === "scattered").length;
    const scatteredPenalty = (behaviorLogs.length >= 5 && scatteredCount >= 5) ? -10 : 0;

    // Felt state (clarity_level last 7 days)
    const recentCL = checkIns.filter((c: any) => c.checkin_date >= sevenStr && c.clarity_level != null).map((c: any) => c.clarity_level as number);
    const feltCL = recentCL.length > 0 ? Math.round(recentCL.reduce((s, v) => s + v, 0) / recentCL.length) : 50;

    const claritySignals: Signal[] = [
      { name: "baseline", value: baseline.fr, weight: 0.30, available: true },
      { name: "flow", value: flowScore, weight: 0.15, available: flowUnderLoad >= 3 && hasCalendar },
      { name: "coach", value: 50 + coachClarityScore, weight: 0.15, available: coachSessionCount >= 1 },
      { name: "clarityTheme", value: 50 + clarityThemePenalty, weight: 0.10, available: totalCheckins >= 10 },
      { name: "felt", value: feltCL, weight: 0.30, available: recentCL.length >= 3 },
    ];
    let evolvedFR = computeWeightedScore(claritySignals);
    evolvedFR += scatteredPenalty;
    evolvedFR = Math.max(0, Math.min(100, Math.round(evolvedFR)));

    // --- Renewal signals ---
    // Renergise practices in depleted state
    const renergiseInDepleted = sanctuaryEvents.filter((e: any) => {
      if (e.category !== "renergise") return false;
      const eDate = e.timestamp?.split("T")[0];
      const dayOutcome = eDate ? checkinByDate.get(eDate) : null;
      return dayOutcome && ["drained", "overwhelmed"].includes(dayOutcome);
    }).length;
    const renergiseScore = Math.min(100, renergiseInDepleted * 5);

    // Evening session completion rate
    const eveningSessions = ritualCompletions.filter((r: any) => r.session_period === "evening");
    const eveningFull = eveningSessions.filter((r: any) => r.completion_status === "full").length;
    let eveningScore = 50;
    if (eveningSessions.length >= 10) {
      const rate = eveningFull / eveningSessions.length;
      if (rate >= 0.7) eveningScore = 58;
      else if (rate < 0.3) eveningScore = 42;
    }

    // Tiny wins frequency
    const tinyWinCount = tinyWins.length;
    const tinyWinScore = Math.min(10, tinyWinCount) * 10; // 0-100

    // HRV recovery rate (simplified: same as trend for now)
    const hrvRecoveryScore = hrvTrendScore;

    // Coach renewal score
    const coachRenewalScore = scanKeywords(dialogueMessages, RENEWAL_POSITIVE, RENEWAL_NEGATIVE);

    // Felt state (confidence_level last 7 days)
    const recentCF = checkIns.filter((c: any) => c.checkin_date >= sevenStr && c.confidence_level != null).map((c: any) => c.confidence_level as number);
    const feltCF = recentCF.length > 0 ? Math.round(recentCF.reduce((s, v) => s + v, 0) / recentCF.length) : 50;

    const renewalSignals: Signal[] = [
      { name: "baseline", value: baseline.en, weight: 0.30, available: true },
      { name: "renergise", value: renergiseScore, weight: 0.15, available: renergiseInDepleted >= 3 },
      { name: "evening", value: eveningScore, weight: 0.15, available: eveningSessions.length >= 10 },
      { name: "tinyWins", value: tinyWinScore, weight: 0.10, available: tinyWinCount >= 5 },
      { name: "hrvRecovery", value: hrvRecoveryScore, weight: 0.10, available: hrvData.length >= 14 },
      { name: "coach", value: 50 + coachRenewalScore, weight: 0.10, available: coachSessionCount >= 1 },
      { name: "felt", value: feltCF, weight: 0.10, available: recentCF.length >= 3 },
    ];
    let evolvedEN = computeWeightedScore(renewalSignals);
    evolvedEN = Math.max(0, Math.min(100, Math.round(evolvedEN)));

    // ── Current archetype + evolution ──
    const hasEnoughForCurrent = totalCheckins >= 7 && recentEB.length > 0 && recentCL.length > 0 && recentCF.length > 0;

    let currentScores: { recalibration: number; clarity: number; renewal: number } | null = null;
    let currentArch: ArchetypeResult | null = null;
    let archetypeEvolved = false;
    let scoreDeltas: { recalibration: number; clarity: number; renewal: number } | null = null;

    if (hasEnoughForCurrent) {
      currentScores = { recalibration: evolvedER, clarity: evolvedFR, renewal: evolvedEN };
      currentArch = resolveArchetypeFromScores(evolvedER, evolvedFR, evolvedEN);
      scoreDeltas = {
        recalibration: evolvedER - baselineScores.recalibration,
        clarity: evolvedFR - baselineScores.clarity,
        renewal: evolvedEN - baselineScores.renewal,
      };
      archetypeEvolved = baselineArch.id !== currentArch.id;
    }

    // ── AI Observation ──
    let aiObservation: string | null = null;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (LOVABLE_API_KEY && totalCheckins >= 5) {
      try {
        const themesStr = recurringThemes.map((t) => `"${t.phrase}" (${t.count}×)`).join(", ");
        const coachExcerpts = [coachStrength, coachFriction].filter(Boolean).join(" | ");
        const dimensionDeltaStr = scoreDeltas
          ? `Recalibration ${scoreDeltas.recalibration >= 0 ? "+" : ""}${scoreDeltas.recalibration}, Clarity ${scoreDeltas.clarity >= 0 ? "+" : ""}${scoreDeltas.clarity}, Renewal ${scoreDeltas.renewal >= 0 ? "+" : ""}${scoreDeltas.renewal}`
          : "not yet available";
        const archEvStr = archetypeEvolved ? `${baselineArch.title} → ${currentArch!.title} (evolved: yes)` : `${baselineArch.title} (evolved: no)`;

        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              {
                role: "system",
                content: `You are analyzing a leader's self-mastery patterns over 30 days. Based on the data below, name the ONE pattern most worth their attention right now.\n\nThis is self-mastery work — regulation, clarity, and renewal matter in leadership and in life. Speak to the whole person, not just the executive role. One sentence. Direct. No generic language. No advice — just name what you see.`,
              },
              {
                role: "user",
                content: `Data:\n- Archetype: ${archEvStr}\n- Dimension shifts: ${dimensionDeltaStr}\n- Friction: ${frictionLabel} (${frictionPct}%) — trend: ${trendDirection}\n- Recurring themes: ${themesStr || "none yet"}\n- Coach strength: ${coachStrength || "none yet"}\n- Coach friction: ${coachFriction || "none yet"}\n\nName the pattern.`,
              },
            ],
            tools: [{
              type: "function",
              function: {
                name: "emit_observation",
                description: "Emit a single-sentence pattern observation",
                parameters: { type: "object", properties: { observation: { type: "string", description: "One sentence naming the leadership pattern" } }, required: ["observation"], additionalProperties: false },
              },
            }],
            tool_choice: { type: "function", function: { name: "emit_observation" } },
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            const parsed = JSON.parse(toolCall.function.arguments);
            aiObservation = parsed.observation || null;
          }
        }
      } catch (aiErr) {
        console.error("AI observation error:", aiErr);
      }
    }

    // Fallback observation
    if (!aiObservation && totalCheckins >= 3) {
      aiObservation = generateFallbackObservation(scoreDeltas, trendDirection, frictionLabel, frictionPct, totalCheckins);
    }

    // ── Data source note ──
    const parts: string[] = [`${totalCheckins} check-in${totalCheckins !== 1 ? "s" : ""}`];
    if (coachSessionCount > 0) parts.push(`${coachSessionCount} coach session${coachSessionCount !== 1 ? "s" : ""}`);
    if (hasWearable) parts.push("wearable data");
    if (hasCalendar) parts.push("calendar data");
    let dataSourceNote = `Based on ${parts.join(", ")} over 30 days`;
    if (!hasWearable && !hasCalendar && totalCheckins < 15) {
      dataSourceNote += " — connect your wearable and calendar for richer insights";
    }

    // ── Response ──
    const response = {
      data: {
        aiObservation,
        baselineArchetypeId: baselineArch.id,
        baselineArchetypeTitle: baselineArch.title,
        currentArchetypeId: currentArch?.id || null,
        currentArchetypeTitle: currentArch?.title || null,
        archetypeEvolved,
        archetypeLeanOn: (currentArch || baselineArch).leanOn,
        archetypeWatchFor: (currentArch || baselineArch).watchFor,
        baselineScores,
        currentScores,
        scoreDeltas,
        frictionPct,
        frictionLabel,
        trendDirection,
        typicalState,
        recurringThemes,
        coachStrength,
        coachFriction,
        checkInCount: totalCheckins,
        coachSessionCount,
        hasWearable,
        hasCalendar,
        dataSourceNote,
      },
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("state-patterns-insights error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ──────────────────────────────────────────────
// Fallback observation using dimension deltas
// ──────────────────────────────────────────────
function generateFallbackObservation(
  deltas: { recalibration: number; clarity: number; renewal: number } | null,
  trend: string,
  frictionLabel: string,
  frictionPct: number,
  totalCheckins: number
): string | null {
  if (totalCheckins < 3) return null;

  if (deltas) {
    const abs = { r: Math.abs(deltas.recalibration), c: Math.abs(deltas.clarity), n: Math.abs(deltas.renewal) };
    if (abs.r >= abs.c && abs.r >= abs.n) {
      return deltas.recalibration > 0
        ? "Your regulation is strengthening — you're returning to center faster when pressure rises."
        : "Regulation is slipping — you're staying activated longer when pressure hits.";
    }
    if (abs.c >= abs.r && abs.c >= abs.n) {
      return deltas.clarity > 0
        ? "Your clarity is sharpening — you're cutting through complexity with more precision."
        : "Clarity is fragmenting — competing demands are pulling your focus.";
    }
    return deltas.renewal > 0
      ? "Your renewal capacity is building — you're recovering faster and sustaining better."
      : "Renewal is under strain — recovery isn't keeping pace with demand.";
  }

  const trendPhrase = trend === "improving" ? "Your readiness has been trending upward this week"
    : trend === "declining" ? "Your readiness has been trending downward this week"
    : "Your readiness has been stable this week";

  if (frictionPct > 50) return `${trendPhrase}, but friction states have appeared in more than half your check-ins — a pattern worth examining.`;
  if (frictionPct > 25) return `${trendPhrase}, with moderate friction appearing in about a quarter of your check-ins.`;
  return `${trendPhrase}, with low friction across your check-ins — your regulation is holding.`;
}
