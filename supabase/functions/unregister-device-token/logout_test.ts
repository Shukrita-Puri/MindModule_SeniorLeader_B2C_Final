/**
 * Batch A — unregister-device-token logout contract.
 *
 * Source-level assertions: the function must (a) authenticate the caller
 * via the shared Auth0 helper, (b) only ever touch rows scoped to the
 * caller's user_id, and (c) support both "specific token" and
 * "all my active tokens" flows.
 */
import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("unregister-device-token requires authenticated caller", () => {
  assertStringIncludes(src, "authenticateRequest");
  assertStringIncludes(src, "if ('errorResponse' in auth) return auth.errorResponse");
});

Deno.test("unregister-device-token only mutates the caller's rows", () => {
  // Every update path must be scoped by .eq('user_id', userId).
  const updates = src.split(".from('notification_device_tokens')").slice(1);
  assert(updates.length >= 1, 'expected at least one table access');
  for (const chunk of updates) {
    const head = chunk.slice(0, 400);
    assertStringIncludes(head, ".eq('user_id', userId)");
  }
});

Deno.test("unregister-device-token supports specific-token AND all-tokens flows", () => {
  // No device_token supplied -> deactivate every active row for this user.
  assertStringIncludes(src, 'deviceToken\n      ? await query.eq');
  // Only active rows are targeted (so we don't churn inactive history).
  assertStringIncludes(src, ".eq('is_active', true)");
});

Deno.test("unregister-device-token never issues a DELETE", () => {
  // We deactivate; we do not delete (preserves audit trail).
  assert(!src.includes('.delete('),
    'unregister-device-token must not delete rows');
});