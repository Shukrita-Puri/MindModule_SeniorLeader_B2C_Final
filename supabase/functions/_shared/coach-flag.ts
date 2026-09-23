/**
 * Coach kill switch.
 *
 * The coach is not live. Every coach-serving Edge Function must return a clean
 * no-op BEFORE any model provider call and before any database write unless
 * COACH_AI_ENABLED === "true".
 *
 * When the coach is re-enabled, remember to reschedule the
 * `process-orphaned-sessions` pg_cron job (every 10 minutes).
 */

export function coachAiEnabled(): boolean {
  return (Deno.env.get("COACH_AI_ENABLED") ?? "false").trim().toLowerCase() ===
    "true";
}

/**
 * Returns a 200 no-op Response when the coach is disabled, otherwise null.
 * Call immediately after the CORS preflight branch.
 */
export function coachDisabledResponse(
  corsHeaders: Record<string, string>,
  fnName: string,
): Response | null {
  if (coachAiEnabled()) return null;
  console.log(`[${fnName}] coach disabled (COACH_AI_ENABLED != true) — no-op`);
  return new Response(
    JSON.stringify({ skipped: "coach_disabled" }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}
