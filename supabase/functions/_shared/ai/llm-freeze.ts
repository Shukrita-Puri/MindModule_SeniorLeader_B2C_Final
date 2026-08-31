// OWNERSHIP: engineering. Launch-time cost control (C6).
//
// The Coach / Dialogue / semantic-analysis cluster has no live frontend path at
// launch, but its functions are still deployed and still reachable. Rather than
// delete routes or touch frontend call sites two days before launch, every LLM
// call in that cluster is gated behind a single shared env flag. When the flag
// is off (the default) the LLM call is skipped and the function returns its
// existing empty/null shape via its own fallback path — no schema change, no
// route change, no frontend change.
//
// To restore the cluster when Coach goes live, set the env var below to "true"
// on the project. No code change is required.
const ENABLE_ENV = "ENABLE_DORMANT_LLM";

/**
 * True when the dormant Coach/Dialogue LLM cluster is allowed to call a model.
 * Default: false (frozen).
 */
export function isDormantLlmEnabled(): boolean {
  const raw = (Deno.env.get(ENABLE_ENV) ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1";
}

/** Inverse convenience: true when the caller must skip its LLM call. */
export function isDormantLlmFrozen(): boolean {
  return !isDormantLlmEnabled();
}

/**
 * Log-once-per-call helper so a frozen skip is visible in function logs without
 * looking like an error.
 */
export function logDormantLlmSkip(fn: string): void {
  console.log(
    `[llm-freeze] ${fn}: dormant-cluster LLM call skipped (set ${ENABLE_ENV}=true to restore)`,
  );
}

/**
 * Drop-in replacement for a direct `fetch(...)` to a model provider inside the
 * dormant cluster. When frozen it returns a synthetic 503 Response instead of
 * calling the provider, so the caller's existing `!res.ok` fallback path runs
 * unchanged and the function's response shape is byte-identical to a provider
 * outage.
 */
export async function frozenAwareFetch(
  fn: string,
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  if (isDormantLlmFrozen()) {
    logDormantLlmSkip(fn);
    return new Response(
      JSON.stringify({ error: { type: "dormant_llm_frozen" } }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
  return await fetch(input, init);
}
