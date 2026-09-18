/**
 * generate-debrief-insights — RETIRED
 *
 * This function previously enhanced dialogue-practice debrief data by calling
 * the paid Anthropic Claude API. It has no remaining caller anywhere in the app,
 * and its handler forwarded caller-supplied text straight to a billable model.
 *
 * All model calls and prompts have been removed. The function stays deployed
 * (rather than deleted) so any stray caller fails cleanly instead of hitting an
 * unknown route. It now:
 *   1. requires a verified Auth0 token, and
 *   2. returns HTTP 410 Gone without performing any work.
 */

import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-mm-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await authenticateRequest(req, corsHeaders);
  if (auth.errorResponse) return auth.errorResponse;

  console.log("[generate-debrief-insights] retired endpoint invoked; returning 410");

  return new Response(
    JSON.stringify({
      error: "feature_retired",
      message:
        "Debrief insight generation has been retired. No AI request was made.",
    }),
    { status: 410, headers: jsonHeaders },
  );
});
