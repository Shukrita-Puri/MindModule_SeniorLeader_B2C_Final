/**
 * dialogue-engine — RETIRED
 *
 * This function previously drove an experimental text dialogue screen and
 * called the paid Anthropic Claude API. That screen is no longer reachable in
 * the app, and the handler had no authentication, which made it an open,
 * billable AI endpoint.
 *
 * All model calls, prompts and context assembly have been removed. The function
 * is intentionally kept deployed (rather than deleted) so that any stray caller
 * fails cleanly instead of hitting an unknown route. It now:
 *   1. requires a verified Auth0 token, and
 *   2. returns HTTP 410 Gone without performing any work.
 *
 * The live coaching experience is unaffected — it runs through
 * dialogue-session-manage / dialogue-data-persist, which are separately
 * authenticated.
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

  // Authenticate before anything else, so unauthenticated traffic cannot even
  // learn about the endpoint's state.
  const auth = await authenticateRequest(req, corsHeaders);
  if (auth.errorResponse) return auth.errorResponse;

  console.log("[dialogue-engine] retired endpoint invoked; returning 410");

  return new Response(
    JSON.stringify({
      error: "feature_retired",
      message:
        "The dialogue engine has been retired. No AI request was made.",
    }),
    { status: 410, headers: jsonHeaders },
  );
});
