import { getAuthToken, getEdgeFunctionHeaders } from "@/services/authTokenService";
import { getSupabaseFunctionUrl } from "@/utils/supabaseFunctions";

export type V8Fields = Partial<{
  linkedin_url: string | null;
  writing_urls: string[];
  freetext_context: string | null;
  stakes_chips: string[];
  load_chips: string[];
  burden_chips: string[];
  goals: string[];
  brief_timing: string | null;
  reset_modality: string | null;
  weekend_signals: string | null;
  calendar_selections: string[];
  wearable_selections: string[];
}>;

export type EdgeValidationError = { field: string; message: string };

async function postEdge<T = any>(
  fn: string,
  body: unknown,
): Promise<{ ok: boolean; data?: T; error?: string; validationErrors?: EdgeValidationError[] }> {
  try {
    const token = await getAuthToken();
    if (!token) return { ok: false, error: "no_auth" };
    const headers = await getEdgeFunctionHeaders();
    const res = await fetch(getSupabaseFunctionUrl(fn), {
      method: "POST",
      headers,
      body: JSON.stringify(body ?? {}),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const errs = Array.isArray((json as any)?.errors) ? ((json as any).errors as EdgeValidationError[]) : undefined;
      return { ok: false, error: (json as any)?.error ?? `http_${res.status}`, validationErrors: errs };
    }
    return { ok: true, data: json as T };
  } catch (e) {
    console.warn(`[onboardingV8] ${fn} error:`, e);
    return { ok: false, error: e instanceof Error ? e.message : "request_failed" };
  }
}

/** Fire-and-forget partial save of v8 onboarding fields. */
export async function saveV8(fields: V8Fields, step?: string) {
  return postEdge("onboarding-v8-save", { action: "UPSERT", fields, step });
}

/** Mark the v8 onboarding as complete (sets completed_at). */
export async function markV8Complete() {
  return postEdge("onboarding-v8-save", { action: "MARK_COMPLETE" });
}

/** Trigger Firecrawl + Gemini synthesis. Idempotent unless `force`. */
export async function synthesizeCosProfile(opts?: { force?: boolean }) {
  return postEdge("synthesize-cos-profile", { force: !!opts?.force });
}

/** Lightweight debouncer for autosave on text fields. */
export function makeDebouncedSaver(delayMs = 700) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: V8Fields = {};
  let stepKey: string | undefined;
  return (fields: V8Fields, step?: string) => {
    pending = { ...pending, ...fields };
    if (step) stepKey = step;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const toSend = pending;
      const s = stepKey;
      pending = {};
      stepKey = undefined;
      timer = null;
      saveV8(toSend, s);
    }, delayMs);
  };
}