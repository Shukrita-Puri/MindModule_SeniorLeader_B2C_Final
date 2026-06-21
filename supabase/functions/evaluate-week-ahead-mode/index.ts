/**
 * evaluate-week-ahead-mode
 *
 * Tiny endpoint returning the server-authoritative Week-Ahead decision so
 * the frontend can route between Today's Three Priorities and the
 * Week-Ahead picker without first having to fetch the (expensive) full
 * mastery plan.
 *
 * Uses the same shared `evaluateWeekAheadMode` predicate as Brief, Plan
 * and Nudges. Inputs are intentionally minimal — manual override + user
 * local DoW/hour — so it stays cheap and crash-free.
 *
 * SSOT: docs/GENERATE_MASTERY_PLAN_SSOT.md §17.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { evaluateWeekAheadMode } from "../_shared/plan/week-ahead-mode.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-dev-user-id, x-user-tz-offset, x-week-ahead-override",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    // Auth is best-effort: we still want to return a decision in dev mode
    // so the routing UI never gets stuck. The decision itself contains no
    // user-private data — it is a pure function of clock + override.
    let userId: string | null = null;
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) {
      const env = Deno.env.get("ENVIRONMENT") || "";
      if (env !== "production") {
        userId = req.headers.get("x-dev-user-id") ?? "dev";
      } else {
        return auth.errorResponse;
      }
    } else {
      userId = auth.userId;
    }

    const offsetParam = req.headers.get("x-user-tz-offset");
    const offsetMinutes = offsetParam != null && offsetParam !== ""
      ? Number(offsetParam)
      : new Date().getTimezoneOffset();
    const manualOverride = req.headers.get("x-week-ahead-override") === "1";

    const localNow = new Date(Date.now() - offsetMinutes * 60_000);
    const decision = evaluateWeekAheadMode({
      dayOfWeek: localNow.getUTCDay(),
      localHour: localNow.getUTCHours(),
      manualOverride,
    });

    return new Response(
      JSON.stringify({
        weekAheadDecision: {
          active: decision.active,
          reason: decision.reason,
          lookaheadDays: decision.lookaheadDays,
          mode: decision.active ? "week_ahead" : "day_of",
        },
        userId,
        generatedAt: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[evaluate-week-ahead-mode] fatal:", err);
    // Safe fallback — never block routing.
    return new Response(
      JSON.stringify({
        weekAheadDecision: { active: false, reason: null, lookaheadDays: 0, mode: "day_of" },
        error: "internal_error",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});