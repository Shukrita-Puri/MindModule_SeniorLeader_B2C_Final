// [KIND: infrastructure] [LAYER: shadow] [TIERS: 0] [AUDIENCE: universal]
// Domain Shadow Wiring Helpers.
// Source: Spine Section 12, Decisions 23-27 (Stage 1-2 shadow protocol).
// Invariant: shadow execution is non-blocking and never changes the legacy
// response; each Layer 0-5 domain is gated behind its own env flag.

import { runInShadow, type ShadowRunOptions } from "./runner.ts";

/**
 * A domain flag is "shadow" when its env var is set to `shadow` (e.g.
 * `L5_VOICE=shadow`). Any other value (or unset) means legacy-only.
 */
export function isDomainShadowEnabled(flagName: string): boolean {
  try {
    return (Deno.env.get(flagName) ?? "legacy").toLowerCase().trim() ===
      "shadow";
  } catch {
    return false;
  }
}

/**
 * Keep the worker alive until the shadow promise settles without blocking the
 * response (same EdgeRuntime.waitUntil pattern as attendeeResolverQueue).
 * Falls back to fire-and-forget outside the Supabase Edge Runtime.
 */
export function scheduleShadowWork(promise: Promise<unknown>): void {
  // deno-lint-ignore no-explicit-any
  const er = (globalThis as any).EdgeRuntime;
  if (er && typeof er.waitUntil === "function") {
    try {
      er.waitUntil(promise);
      return;
    } catch { /* fall through to fire-and-forget */ }
  }
  promise.catch(() => {});
}

/**
 * Run a domain engine in shadow beside the legacy path. Never throws, never
 * blocks the response, and the comparison is recorded via the parity logger
 * (hashed IDs, reason codes, Green/Blue/Red severity — no PII).
 */
export function runDomainShadow<TResult>(
  options: ShadowRunOptions<TResult>,
): void {
  try {
    scheduleShadowWork(runInShadow(options));
  } catch {
    // Shadow mode must never affect the legacy path.
  }
}
