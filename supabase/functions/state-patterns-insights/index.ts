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
        .select("checkin_date, outcome, energy_balance, created_at")
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

function resolveArchetypeDetails(
  archetypeId: string | null,
  componentScores: any
): { title: string; strengthArea: string; growthArea: string } {
  // If we have component scores, determine archetype from scores
  if (componentScores) {
    const q2 = componentScores.q2_energy_regulation ?? 50;
    const q3 = componentScores.q3_focus_recovery ?? 50;
    const q4 = componentScores.q4_energy_renewal ?? 50;
    const q5 = componentScores.q5_growth_priority ?? 50;
    const avg = (q2 + q3 + q4) / 3;

    if (avg >= 80) return { title: "The Natural Regulator", strengthArea: "Comprehensive Self-Regulation", growthArea: "Advanced Integration" };
    if (q3 >= 75 && q5 >= 75) return { title: "The Strategic Pauser", strengthArea: "Focus Recovery & Composure", growthArea: "Energy Downshift" };
    if (q2 <= 50 && q4 >= 70) return { title: "The High-Octane Performer", strengthArea: "Energy Renewal", growthArea: "Proactive Regulation" };
    return { title: "The Awareness Builder", strengthArea: "Growth Awareness", growthArea: "Foundational Tools" };
  }

  // Fallback: resolve from archetype ID string
  const map: Record<string, { title: string; strengthArea: string; growthArea: string }> = {
    natural_regulator: { title: "The Natural Regulator", strengthArea: "Comprehensive Self-Regulation", growthArea: "Advanced Integration" },
    strategic_pauser: { title: "The Strategic Pauser", strengthArea: "Focus Recovery & Composure", growthArea: "Energy Downshift" },
    high_octane_performer: { title: "The High-Octane Performer", strengthArea: "Energy Renewal", growthArea: "Proactive Regulation" },
    awareness_builder: { title: "The Awareness Builder", strengthArea: "Growth Awareness", growthArea: "Foundational Tools" },
  };
  if (archetypeId && map[archetypeId]) return map[archetypeId];
  if (archetypeId) return { title: archetypeId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), strengthArea: "Self-Regulation", growthArea: "Energy Management" };
  return { title: "", strengthArea: "Self-Regulation", growthArea: "Energy Management" };
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
