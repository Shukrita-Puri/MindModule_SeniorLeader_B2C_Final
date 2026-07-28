import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth0JWT } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-mm-client-platform",
};

type RelationshipTag = "client" | "boss_manager" | "vendor" | "junior_growth" | "colleague";

interface RelationshipStat {
  daysSeen: number;
  scoreSum: number;
  energySum: number;
  titles: Set<string>;
}

interface CheckInRow {
  checkin_date: string;
  outcome: string | null;
  energy_balance: number | null;
}

interface CalendarRow {
  title: string | null;
  start_time: string;
  event_metadata: Record<string, unknown> | null;
}

const TAG_LABELS: Record<RelationshipTag, string> = {
  client: "Client",
  boss_manager: "Boss/Manager",
  vendor: "Vendor",
  junior_growth: "Junior/Growth",
  colleague: "Colleague",
};

const POSITIVE_OUTCOMES = new Set(["focused", "steady", "strong", "thriving", "energized", "energised", "grounded", "calm"]);
const NEGATIVE_OUTCOMES = new Set(["drained", "overwhelmed", "scattered", "strained", "reactive"]);

function scoreCheckIn(outcome: string | null, energyBalance: number | null): number {
  let score = 0;
  if (outcome) {
    const normalized = outcome.toLowerCase();
    if (POSITIVE_OUTCOMES.has(normalized)) score += 1.25;
    else if (NEGATIVE_OUTCOMES.has(normalized)) score -= 1.25;
  }

  if (energyBalance != null) {
    if (energyBalance >= 70) score += 0.5;
    else if (energyBalance <= 45) score -= 0.5;
  }

  return score;
}

function inferRelationshipTag(title: string, metadata: Record<string, unknown> | null): RelationshipTag | null {
  const lower = `${title || ""} ${JSON.stringify(metadata || {})}`.toLowerCase();

  if (/(client|customer|account|proposal|demo|prospect|renewal)/.test(lower)) return "client";
  if (/(boss|manager|director|vp|leadership|1:1|one-on-one|one on one|skip level|performance review|feedback)/.test(lower)) return "boss_manager";
  if (/(vendor|supplier|partner|contractor|external partner|implementation partner)/.test(lower)) return "vendor";
  if (/(direct report|mentee|coaching|onboarding|candidate|interview|junior|growth conversation)/.test(lower)) return "junior_growth";
  if (/(team|sync|standup|working session|planning|retro|peer|colleague)/.test(lower)) return "colleague";

  const attendeeSignals = metadata?.attendeeSignals as Record<string, unknown> | undefined;
  const organizer = attendeeSignals?.organizer as Record<string, unknown> | undefined;
  const attendeeCount = typeof attendeeSignals?.attendeeCount === "number" ? attendeeSignals.attendeeCount : 0;
  const responseSummary = attendeeSignals?.responseSummary as Record<string, number> | undefined;

  if (attendeeCount >= 6 && lower.includes("meeting")) return "colleague";
  if (responseSummary && (responseSummary.declined || 0) > 0 && lower.includes("review")) return "boss_manager";
  if (organizer?.emailDomain && typeof organizer.emailDomain === "string" && /vendor|partner|consult|agency/.test(lower)) return "vendor";

  return null;
}

function buildInsightContent(label: string, avgScore: number): string {
  if (avgScore <= -0.5) {
    return `${label} meetings reliably leave you more depleted the same day.`;
  }
  if (avgScore >= 0.5) {
    return `${label} meetings tend to steady you rather than drain you.`;
  }
  return `${label} meetings have a noticeable effect on your state.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const userId = await verifyAuth0JWT(req);
    const body = await req.json().catch(() => ({}));
    const lookbackDays = Math.max(14, Math.min(90, Number(body?.lookbackDays) || 30));
    const minOccurrences = Math.max(2, Math.min(6, Number(body?.minOccurrences) || 3));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const lookbackStart = new Date(Date.now() - lookbackDays * 86400000);
    const lookbackDate = lookbackStart.toISOString().split("T")[0];
    const today = new Date().toISOString().split("T")[0];

    const [eventsRes, checkinsRes] = await Promise.all([
      supabase
        .from("primary_calendar_events")
        .select("title, start_time, event_metadata")
        .eq("user_id", userId)
        .gte("start_time", lookbackStart.toISOString())
        .order("start_time", { ascending: true }),
      supabase
        .from("daily_checkins")
        .select("checkin_date, outcome, energy_balance")
        .eq("user_id", userId)
        .gte("checkin_date", lookbackDate)
        .order("checkin_date", { ascending: false })
        .limit(50),
    ]);

    const events = (eventsRes.data || []) as CalendarRow[];
    const checkins = (checkinsRes.data || []) as CheckInRow[];

    if (events.length === 0 || checkins.length === 0) {
      return new Response(JSON.stringify({ insights: [], message: "No calendar or check-in data found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const checkInByDate = new Map<string, CheckInRow>();
    for (const checkin of checkins) {
      if (!checkInByDate.has(checkin.checkin_date)) {
        checkInByDate.set(checkin.checkin_date, checkin);
      }
    }

    const dailyTagScores = new Map<string, RelationshipStat>();
    const seenDayTag = new Set<string>();

    for (const event of events) {
      const dayKey = (event.start_time || "").slice(0, 10);
      if (!dayKey) continue;

      const checkin = checkInByDate.get(dayKey);
      if (!checkin) continue;

      const tag = inferRelationshipTag(event.title || "", event.event_metadata);
      if (!tag) continue;

      const uniqueKey = `${dayKey}:${tag}`;
      if (seenDayTag.has(uniqueKey)) continue;
      seenDayTag.add(uniqueKey);

      const score = scoreCheckIn(checkin.outcome, checkin.energy_balance);
      const current = dailyTagScores.get(tag) || {
        daysSeen: 0,
        scoreSum: 0,
        energySum: 0,
        titles: new Set<string>(),
      };

      current.daysSeen += 1;
      current.scoreSum += score;
      current.energySum += checkin.energy_balance ?? 0;
      if (event.title) current.titles.add(event.title);
      dailyTagScores.set(tag, current);
    }

    const ranked = [...dailyTagScores.entries()]
      .map(([tag, stat]) => {
        const avgScore = stat.daysSeen > 0 ? stat.scoreSum / stat.daysSeen : 0;
        const confidence = Math.max(0, Math.min(0.95, 0.55 + (stat.daysSeen * 0.07) + (Math.min(Math.abs(avgScore), 2) * 0.08)));
        return {
          tag,
          stat,
          avgScore,
          confidence,
        };
      })
      .filter(item => item.stat.daysSeen >= minOccurrences && Math.abs(item.avgScore) >= 0.35)
      .sort((a, b) => {
        const aMagnitude = Math.abs(a.avgScore) + (a.stat.daysSeen * 0.1);
        const bMagnitude = Math.abs(b.avgScore) + (b.stat.daysSeen * 0.1);
        return bMagnitude - aMagnitude;
      });

    if (ranked.length === 0) {
      return new Response(JSON.stringify({ insights: [], message: "No stable relationship pattern detected" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const top = ranked[0];
    const label = TAG_LABELS[top.tag as RelationshipTag];
    const content = buildInsightContent(label, top.avgScore);
    const insightType = "relationship_pattern";
    const contentReference = `relationship:${top.tag}`;
    const nowIso = new Date().toISOString();

    const { data: existingActive, error: existingError } = await supabase
      .from("user_coach_insights")
      .select("id, insight_content, confidence_score")
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("insight_type", insightType)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      console.warn("[extract-calendar-relationship-insights] Existing insight lookup failed:", existingError);
    }

    if (existingActive && existingActive.insight_content === content) {
      await supabase
        .from("user_coach_insights")
        .update({
          confidence_score: Math.max(Number(existingActive.confidence_score || 0), top.confidence),
          extracted_at: nowIso,
          check_in_date: today,
          updated_at: nowIso,
        })
        .eq("id", existingActive.id);
    } else {
      await supabase
        .from("user_coach_insights")
        .update({ is_active: false, updated_at: nowIso })
        .eq("user_id", userId)
        .eq("insight_type", insightType)
        .eq("is_active", true);

      const { error: insertError } = await supabase.from("user_coach_insights").insert({
        user_id: userId,
        insight_type: insightType,
        insight_content: content,
        content_reference: contentReference,
        confidence_score: top.confidence,
        pattern_area: top.avgScore <= 0 ? "recalibration" : "clarity",
        meta_skill: "relationship_navigation",
        check_in_date: today,
        is_active: true,
        extracted_at: nowIso,
        updated_at: nowIso,
      });

      if (insertError) {
        throw insertError;
      }
    }

    return new Response(JSON.stringify({
      insights: [{
        type: insightType,
        content,
        contentReference,
        confidence: top.confidence,
        pattern_area: top.avgScore <= 0 ? "recalibration" : "clarity",
        meta_skill: "relationship_navigation",
      }],
      selectedTag: top.tag,
      selectedLabel: label,
      daysSeen: top.stat.daysSeen,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[extract-calendar-relationship-insights] Error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Failed to extract calendar relationship insights",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
