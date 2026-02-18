import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const AUTH0_DOMAIN = Deno.env.get("VITE_AUTH0_DOMAIN");
    if (!AUTH0_DOMAIN) throw new Error('VITE_AUTH0_DOMAIN not configured');
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
    const thirtyDaysStr = thirtyDaysAgo.toISOString().split("T")[0];

    // Parallel queries
    const [profileRes, checkInsRes, themesRes, coachInsightsRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_archetype, component_scores")
        .eq("id", userId)
        .single(),
      supabase
        .from("daily_checkins")
        .select("checkin_date, outcome, energy_balance, clarity_level, confidence_level, created_at")
        .eq("user_id", userId)
        .gte("checkin_date", thirtyDaysStr)
        .order("checkin_date", { ascending: true }),
      supabase
        .from("daily_themes")
        .select("theme_phrase, theme_driver")
        .eq("user_id", userId)
        .gte("theme_date", thirtyDaysStr),
      supabase
        .from("user_coach_insights")
        .select("insight_content, created_at, insight_type")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const profile = profileRes.data;
    const checkIns = checkInsRes.data || [];
    const themes = themesRes.data || [];
    const coachInsights = coachInsightsRes.data || [];

    // --- Archetype with strength/growth areas ---
    const userArchetype = profile?.user_archetype || null;
    const archetypeDetails = resolveArchetypeDetails(userArchetype, profile?.component_scores);
    const archetypeTitle = archetypeDetails.title;
    const strengthArea = archetypeDetails.strengthArea;
    const growthArea = archetypeDetails.growthArea;

    // --- State distribution (30 days) ---
    const distribution: Record<string, number> = {
      focused: 0, steady: 0, scattered: 0, drained: 0, overwhelmed: 0,
    };
    checkIns.forEach((c) => {
      const o = c.outcome?.toLowerCase();
      if (o && o in distribution) distribution[o]++;
    });

    // Most frequent state
    const sortedStates = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
    const typicalState = sortedStates.length > 0 && sortedStates[0][1] > 0 ? sortedStates[0][0] : null;

    // --- Friction frequency ---
    const totalCheckins = checkIns.length;
    const lowStates = checkIns.filter((c) =>
      ["drained", "overwhelmed", "scattered"].includes(c.outcome?.toLowerCase() || "")
    ).length;
    const frictionPct = totalCheckins > 0 ? Math.round((lowStates / totalCheckins) * 100) : 0;
    const frictionLabel =
      frictionPct <= 25 ? "Low friction" : frictionPct <= 50 ? "Moderate friction" : "High friction pattern";

    // --- Composite score trend (energy_balance as proxy) ---
    const scoresWithDates = checkIns
      .filter((c) => c.energy_balance !== null)
      .map((c) => ({ date: c.checkin_date, score: c.energy_balance as number }));

    let compositeAvg30 = 0;
    let trendDirection: "improving" | "stable" | "declining" = "stable";

    if (scoresWithDates.length > 0) {
      compositeAvg30 = Math.round(
        scoresWithDates.reduce((s, c) => s + c.score, 0) / scoresWithDates.length
      );

      // 7-day trend: avg last 7 days vs avg prior 7 days
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const fourteenDaysAgo = new Date(now);
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const sevenStr = sevenDaysAgo.toISOString().split("T")[0];
      const fourteenStr = fourteenDaysAgo.toISOString().split("T")[0];

      const recent = scoresWithDates.filter((s) => s.date >= sevenStr);
      const prior = scoresWithDates.filter((s) => s.date >= fourteenStr && s.date < sevenStr);

      if (recent.length > 0 && prior.length > 0) {
        const recentAvg = recent.reduce((s, c) => s + c.score, 0) / recent.length;
        const priorAvg = prior.reduce((s, c) => s + c.score, 0) / prior.length;
        const delta = recentAvg - priorAvg;
        if (delta > 5) trendDirection = "improving";
        else if (delta < -5) trendDirection = "declining";
      }
    }

    // --- Recurring Compass themes ---
    const themeCounts = new Map<string, number>();
    themes.forEach((t) => {
      if (t.theme_phrase) {
        const phrase = t.theme_phrase;
        themeCounts.set(phrase, (themeCounts.get(phrase) || 0) + 1);
      }
    });
    const recurringThemes = Array.from(themeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([phrase, count]) => ({ phrase, count }));

    // --- Coach insight pattern matching ---
    const strengthKeywords = ["strength", "strong", "excel", "composure", "resilient", "clarity", "conviction", "grounded"];
    const frictionKeywords = ["struggle", "challenge", "pattern", "watch for", "friction", "tendency", "recurring", "avoidance"];

    let coachStrength: string | null = null;
    let coachFriction: string | null = null;

    for (const insight of coachInsights) {
      const content = (insight.insight_content || "").toLowerCase();
      if (!coachStrength && strengthKeywords.some((k) => content.includes(k))) {
        coachStrength = insight.insight_content;
      }
      if (!coachFriction && frictionKeywords.some((k) => content.includes(k))) {
        coachFriction = insight.insight_content;
      }
      if (coachStrength && coachFriction) break;
    }

    // --- AI observation ---
    let aiObservation: string | null = null;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (LOVABLE_API_KEY && totalCheckins >= 5) {
      try {
        const themesStr = recurringThemes.map((t) => `"${t.phrase}" (${t.count}×)`).join(", ");
        const coachExcerpts = [coachStrength, coachFriction].filter(Boolean).join(" | ");

        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              {
                role: "system",
                content: `You are a pattern analyst for a senior executive's leadership development system. Your job is to name the ONE pattern most worth paying attention to. One sentence. Direct. Speak to the leader. No generic language. No advice — just name what you see.`,
              },
              {
                role: "user",
                content: `Over the past 30 days:\n- Recurring themes: ${themesStr || "none yet"}\n- Friction frequency: ${frictionLabel} (${frictionPct}%)\n- Composite score trend: ${trendDirection} (avg: ${compositeAvg30})\n- Coach observations: ${coachExcerpts || "none yet"}\n\nName the pattern.`,
              },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "emit_observation",
                  description: "Emit a single-sentence pattern observation",
                  parameters: {
                    type: "object",
                    properties: {
                      observation: {
                        type: "string",
                        description: "One sentence naming the leadership pattern",
                      },
                    },
                    required: ["observation"],
                    additionalProperties: false,
                  },
                },
              },
            ],
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
    if (!aiObservation) {
      aiObservation = generateSimpleObservation(trendDirection, frictionLabel, frictionPct, typicalState, totalCheckins);
    }

    // --- Baseline scores (from onboarding component_scores) ---
    const componentScores = profile?.component_scores as any;
    let baselineScores: { recalibration: number; clarity: number; renewal: number } | null = null;
    let baselineArchetypeTitle: string | null = null;

    if (componentScores) {
      const bER = componentScores.energyRegulation ?? componentScores.q2_energy_regulation ?? null;
      const bFR = componentScores.focusRecovery ?? componentScores.q3_focus_recovery ?? null;
      const bEN = componentScores.energyRenewal ?? componentScores.q4_energy_renewal ?? null;
      if (bER !== null && bFR !== null && bEN !== null) {
        baselineScores = { recalibration: Math.round(bER), clarity: Math.round(bFR), renewal: Math.round(bEN) };
        baselineArchetypeTitle = resolveArchetypeFromScores(bER, bFR, bEN).title;
      }
    }

    // --- Current scores (last 7 days of check-ins) ---
    const sevenDaysAgoDate = new Date(now);
    sevenDaysAgoDate.setDate(sevenDaysAgoDate.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgoDate.toISOString().split("T")[0];

    const recentCheckins = checkIns.filter((c) => c.checkin_date >= sevenDaysAgoStr);
    const recentEB = recentCheckins.filter((c) => c.energy_balance != null).map((c) => c.energy_balance as number);
    const recentCL = recentCheckins.filter((c) => c.clarity_level != null).map((c) => c.clarity_level as number);
    const recentCF = recentCheckins.filter((c) => c.confidence_level != null).map((c) => c.confidence_level as number);

    let currentScores: { recalibration: number; clarity: number; renewal: number } | null = null;
    let currentArchetypeTitle: string | null = null;
    let archetypeEvolved = false;
    let scoreDeltas: { recalibration: number; clarity: number; renewal: number } | null = null;

    const hasEnoughForCurrent = totalCheckins >= 7 && recentEB.length > 0 && recentCL.length > 0 && recentCF.length > 0;

    if (hasEnoughForCurrent) {
      const avgER = Math.round(recentEB.reduce((s, v) => s + v, 0) / recentEB.length);
      const avgFR = Math.round(recentCL.reduce((s, v) => s + v, 0) / recentCL.length);
      const avgEN = Math.round(recentCF.reduce((s, v) => s + v, 0) / recentCF.length);
      currentScores = { recalibration: avgER, clarity: avgFR, renewal: avgEN };
      const currentArch = resolveArchetypeFromScores(avgER, avgFR, avgEN);
      currentArchetypeTitle = currentArch.title;

      if (baselineScores) {
        scoreDeltas = {
          recalibration: currentScores.recalibration - baselineScores.recalibration,
          clarity: currentScores.clarity - baselineScores.clarity,
          renewal: currentScores.renewal - baselineScores.renewal,
        };
        archetypeEvolved = baselineArchetypeTitle !== currentArchetypeTitle;
      }
    }

    // --- Build response ---
    const response = {
      data: {
        userArchetype,
        archetypeTitle,
        strengthArea,
        growthArea,
        typicalState,
        distribution,
        compositeAvg30,
        trendDirection,
        frictionPct,
        frictionLabel,
        recurringThemes,
        coachStrength,
        coachFriction,
        aiObservation,
        checkInCount: totalCheckins,
        baselineScores,
        currentScores,
        baselineArchetypeTitle,
        currentArchetypeTitle,
        archetypeEvolved,
        scoreDeltas,
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

// Shared cascade: scores -> archetype
function resolveArchetypeFromScores(
  er: number, fr: number, en: number
): { title: string; strengthArea: string; growthArea: string } {
  if (er >= 65 && en >= 55) return { title: "The Grounded Master", strengthArea: "Recalibration", growthArea: "Renewal depth" };
  if (en >= 65 && er >= 50) return { title: "The Resilient Performer", strengthArea: "Renewal", growthArea: "Clarity under load" };
  if (fr >= 65 && er >= 45) return { title: "The Clear Thinker", strengthArea: "Clarity", growthArea: "Recalibration speed" };
  if (er >= 60 && fr < 50) return { title: "The Intensity Driver", strengthArea: "Recalibration", growthArea: "Clarity balance" };
  return { title: "The Adaptive Navigator", strengthArea: "Flexibility", growthArea: "Recalibration depth" };
}

function resolveArchetypeDetails(
  archetypeId: string | null,
  componentScores: any
): { title: string; strengthArea: string; growthArea: string } {
  // If we have component scores, determine archetype from scores
  if (componentScores) {
    const er = componentScores.energyRegulation ?? componentScores.q2_energy_regulation ?? 50;
    const fr = componentScores.focusRecovery ?? componentScores.q3_focus_recovery ?? 50;
    const en = componentScores.energyRenewal ?? componentScores.q4_energy_renewal ?? 50;
    return resolveArchetypeFromScores(er, fr, en);
  }

  // Fallback: resolve from archetype ID string (v2 + legacy)
  const map: Record<string, { title: string; strengthArea: string; growthArea: string }> = {
    // v2 IDs
    "grounded-leader": { title: "The Grounded Master", strengthArea: "Recalibration", growthArea: "Renewal depth" },
    "resilient-performer": { title: "The Resilient Performer", strengthArea: "Renewal", growthArea: "Clarity under load" },
    "clear-thinker": { title: "The Clear Thinker", strengthArea: "Clarity", growthArea: "Recalibration speed" },
    "intensity-driver": { title: "The Intensity Driver", strengthArea: "Recalibration", growthArea: "Clarity balance" },
    "adaptive-navigator": { title: "The Adaptive Navigator", strengthArea: "Flexibility", growthArea: "Recalibration depth" },
    // Legacy IDs
    natural_regulator: { title: "The Grounded Master", strengthArea: "Recalibration", growthArea: "Renewal depth" },
    strategic_pauser: { title: "The Clear Thinker", strengthArea: "Clarity", growthArea: "Recalibration speed" },
    high_octane_performer: { title: "The Resilient Performer", strengthArea: "Renewal", growthArea: "Clarity under load" },
    awareness_builder: { title: "The Intensity Driver", strengthArea: "Recalibration", growthArea: "Clarity balance" },
    grounded_master: { title: "The Grounded Master", strengthArea: "Recalibration", growthArea: "Renewal depth" },
    balanced_navigator: { title: "The Adaptive Navigator", strengthArea: "Flexibility", growthArea: "Recalibration depth" },
  };
  if (archetypeId && map[archetypeId]) return map[archetypeId];
  if (archetypeId) return { title: archetypeId.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), strengthArea: "Flexibility", growthArea: "Recalibration depth" };
  return { title: "", strengthArea: "Flexibility", growthArea: "Recalibration depth" };
}

function generateSimpleObservation(
  trend: string,
  frictionLabel: string,
  frictionPct: number,
  typicalState: string | null,
  totalCheckins: number
): string | null {
  if (totalCheckins < 3) return null;

  const trendPhrase =
    trend === "improving"
      ? "Your readiness has been trending upward this week"
      : trend === "declining"
        ? "Your readiness has been trending downward this week"
        : "Your readiness has been stable this week";

  if (frictionPct > 50) {
    return `${trendPhrase}, but friction states have appeared in more than half your check-ins — a pattern worth examining.`;
  }
  if (frictionPct > 25) {
    return `${trendPhrase}, with moderate friction appearing in about a quarter of your check-ins.`;
  }
  return `${trendPhrase}, with low friction across your check-ins — your regulation is holding.`;
}
