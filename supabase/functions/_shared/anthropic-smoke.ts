// Deploy-time smoke test for the Anthropic fallback model id.
//
// Purpose: catch a stale/incorrect `CLAUDE_MODELS.SONNET` value at boot
// instead of silently 404'ing on every brief fallback for weeks. Runs once
// per cold start, non-blocking, log-only.
//
// Triggered by importing this module; consumers call `runAnthropicSmokeOnce()`
// from their function's top-level (after import, before `Deno.serve`).

import { CLAUDE_MODELS } from "./anthropic.ts";

let smokePromise: Promise<void> | null = null;

export function runAnthropicSmokeOnce(model: string = CLAUDE_MODELS.SONNET): Promise<void> {
  if (smokePromise) return smokePromise;
  smokePromise = (async () => {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      console.warn(`[anthropic-smoke] skipped — ANTHROPIC_API_KEY not set`);
      return;
    }
    const startedAt = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 8,
          messages: [{ role: "user", content: "ping" }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const ok = res.ok;
      const status = res.status;
      let bodyHead = "";
      if (!ok) {
        try { bodyHead = (await res.text()).slice(0, 200); } catch { /* ignore */ }
      } else {
        // Drain body to free the connection.
        try { await res.text(); } catch { /* ignore */ }
      }
      const elapsed = Date.now() - startedAt;
      console.log(`[anthropic-smoke] model=${model} status=${status} ok=${ok} elapsed=${elapsed}ms${ok ? "" : ` body="${bodyHead}"`}`);
    } catch (err) {
      const elapsed = Date.now() - startedAt;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[anthropic-smoke] model=${model} ok=false elapsed=${elapsed}ms error="${msg.slice(0, 200)}"`);
    }
  })();
  return smokePromise;
}