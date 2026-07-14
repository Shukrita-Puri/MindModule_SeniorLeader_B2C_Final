import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import {
  sanitizePayload,
  validateStep,
  validateForCompletion,
  type StepKey,
  type V8Payload,
} from "../_shared/onboardingV8Validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const VALID_STEPS: StepKey[] = [
  "leadership_context",
  "cognitive_load",
  "protect_goals",
  "brief_prefs",
  "permissions",
  "connect",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) return auth.errorResponse;
    const userId = auth.userId!;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = (body as any)?.action ?? "UPSERT";

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (action === "GET") {
      const { data, error } = await db
        .from("onboarding_v8_responses")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        console.error("[onboarding-v8-save] GET error:", error);
        return json(500, { error: "fetch_failed" });
      }
      return json(200, { ok: true, data });
    }

    if (action === "UPSERT" || action === "COMPLETE_STEP") {
      const fields = (body as any)?.fields ?? {};
      const step = (body as any)?.step;
      const raw: V8Payload = fields && typeof fields === "object" ? fields : {};
      const patch = sanitizePayload(raw);

      // Step-scoped validation (only for known step keys). Unknown values are
      // already dropped during sanitization, so errors here are about counts
      // and required fields.
      if (typeof step === "string" && (VALID_STEPS as string[]).includes(step)) {
        const stepErrors = validateStep(step as StepKey, patch);
        if (stepErrors.length > 0) {
          return json(400, { error: "validation_failed", step, errors: stepErrors });
        }
      }

      // Build step_status merge if provided (only canonical step keys allowed).
      let stepStatusMerge: Record<string, string> | null = null;
      if (typeof step === "string" && (VALID_STEPS as string[]).includes(step)) {
        stepStatusMerge = { [step]: "completed" };
      }

      // Fetch existing row to merge step_status (jsonb)
      const { data: existing } = await db
        .from("onboarding_v8_responses")
        .select("step_status")
        .eq("user_id", userId)
        .maybeSingle();

      const nextStepStatus = {
        ...((existing?.step_status as Record<string, string>) ?? {}),
        ...(stepStatusMerge ?? {}),
      };

      const row = {
        user_id: userId,
        ...patch,
        step_status: nextStepStatus,
      };

      const { data, error } = await db
        .from("onboarding_v8_responses")
        .upsert(row, { onConflict: "user_id" })
        .select()
        .single();

      if (error) {
        console.error("[onboarding-v8-save] UPSERT error:", error);
        return json(500, { error: "save_failed", message: error.message });
      }

      return json(200, { ok: true, data });
    }

    if (action === "MARK_COMPLETE") {
      // Re-read persisted row and gate completion on canonical validation.
      const { data: existingRow, error: fetchErr } = await db
        .from("onboarding_v8_responses")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (fetchErr) {
        console.error("[onboarding-v8-save] MARK_COMPLETE fetch error:", fetchErr);
        return json(500, { error: "complete_failed" });
      }
      const sanitized = sanitizePayload((existingRow ?? {}) as V8Payload);
      const completionErrors = validateForCompletion(sanitized);
      // COS synthesis is best-effort: do NOT block onboarding completion on
      // cos_profile_status. If synthesis failed or is pending, the user can
      // still finish onboarding; the profile will be retried on demand later.
      if (completionErrors.length > 0) {
        return json(400, { error: "validation_failed", step: "completion", errors: completionErrors });
      }

      const completedAt = new Date().toISOString();
      const { data, error } = await db
        .from("onboarding_v8_responses")
        .upsert(
          { user_id: userId, completed_at: completedAt },
          { onConflict: "user_id" },
        )
        .select()
        .single();
      if (error) {
        console.error("[onboarding-v8-save] MARK_COMPLETE error:", error);
        return json(500, { error: "complete_failed" });
      }

      return json(200, { ok: true, data });
    }

    return json(400, { error: "unknown_action" });
  } catch (err) {
    console.error("[onboarding-v8-save] Unexpected error:", err);
    return json(500, { error: "internal_error" });
  }
});
