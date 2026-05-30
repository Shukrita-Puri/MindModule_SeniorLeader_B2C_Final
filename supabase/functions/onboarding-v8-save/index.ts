import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

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

// Whitelist of fields that may be patched from the client. All others ignored.
const ALLOWED_FIELDS = new Set([
  "linkedin_url",
  "writing_urls",
  "freetext_context",
  "stakes_chips",
  "load_chips",
  "burden_chips",
  "goals",
  "brief_timing",
  "reset_modality",
  "weekend_signals",
  "calendar_selections",
  "wearable_selections",
]);

function sanitizeWritingUrls(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value
    .filter((v) => typeof v === "string")
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0 && v.length <= 2048)
    .slice(0, 2); // cap at 2
  return cleaned;
}

function sanitizeStringArray(value: unknown, max = 64, maxLen = 200): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((v) => typeof v === "string")
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0 && v.length <= maxLen)
    .slice(0, max);
}

function sanitizeString(value: unknown, maxLen = 4000): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  if (t.length === 0) return null;
  return t.slice(0, maxLen);
}

function buildPatch(input: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(input)) {
    if (!ALLOWED_FIELDS.has(key)) continue;
    const v = input[key];
    switch (key) {
      case "linkedin_url":
      case "brief_timing":
      case "reset_modality":
      case "weekend_signals":
        {
          const s = sanitizeString(v, 2048);
          if (s !== undefined) patch[key] = s;
        }
        break;
      case "freetext_context":
        {
          const s = sanitizeString(v, 8000);
          if (s !== undefined) patch[key] = s;
        }
        break;
      case "writing_urls":
        {
          const arr = sanitizeWritingUrls(v);
          if (arr !== undefined) patch[key] = arr;
        }
        break;
      case "stakes_chips":
      case "load_chips":
      case "burden_chips":
      case "goals":
      case "calendar_selections":
      case "wearable_selections":
        {
          const arr = sanitizeStringArray(v);
          if (arr !== undefined) patch[key] = arr;
        }
        break;
    }
  }
  return patch;
}

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
      const patch = buildPatch(fields && typeof fields === "object" ? fields : {});

      // Build step_status merge if provided
      let stepStatusMerge: Record<string, string> | null = null;
      if (typeof step === "string" && step.length > 0 && step.length <= 64) {
        stepStatusMerge = { [step]: new Date().toISOString() };
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
      const { data, error } = await db
        .from("onboarding_v8_responses")
        .upsert(
          { user_id: userId, completed_at: new Date().toISOString() },
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