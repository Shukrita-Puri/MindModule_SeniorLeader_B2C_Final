// F6 — the Plan why-line LLM call must enforce a real 10s request timeout
// via AbortController, and must fall through to the deterministic path on
// abort. Source-level assertions to avoid mocking the gateway.

import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SRC = await Deno.readTextFile(new URL("./why-llm.ts", import.meta.url));

Deno.test("F6 — WHY_LLM_TIMEOUT_MS is 10s", () => {
  assertStringIncludes(SRC, "WHY_LLM_TIMEOUT_MS = 10_000");
});

Deno.test("F6 — generateWhyStatement uses AbortController + signal on the fetch", () => {
  assertStringIncludes(SRC, "new AbortController()");
  assertStringIncludes(SRC, "controller.abort()");
  assertStringIncludes(SRC, "signal: controller.signal,");
});

Deno.test("F6 — AbortError falls through to the deterministic fallback (returns null)", () => {
  // The catch branch must special-case AbortError and return null so
  // callers fall back to the deterministic why-line repair path.
  const abortBlock = /if \(\(e as any\)\?\.name === "AbortError"\) \{[\s\S]*?return null;[\s\S]*?\}/.test(SRC);
  assert(abortBlock, "expected AbortError → return null branch in generateWhyStatement");
  // And a finally clearTimeout to avoid leaking the timer on happy paths.
  assertStringIncludes(SRC, "clearTimeout(timeoutId)");
});