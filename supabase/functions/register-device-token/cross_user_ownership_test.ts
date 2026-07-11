/**
 * Batch A — register-device-token cross-user ownership transfer.
 *
 * Source-level assertions (matches the project's existing test style, e.g.
 * smart-nudges/plan_fallback_test.ts). Confirms the file executes the
 * cross-user deactivation branch BEFORE upserting the new owner, and that
 * validation still rejects malformed iOS tokens.
 */
import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("register-device-token deactivates other users' active rows for the same token", () => {
  assertStringIncludes(src, "Cross-user ownership transfer");
  assertStringIncludes(src, "crossUserDeactivated");
  // The deactivation query must key on device_token and exclude the caller.
  assertStringIncludes(src, ".eq('device_token', normalizedToken)");
  assertStringIncludes(src, ".neq('user_id', userId)");
  // And it must run BEFORE the upsert.
  const crossUserIdx = src.indexOf('cross-user deactivate failed');
  const upsertIdx = src.indexOf('.upsert(');
  assert(crossUserIdx > 0 && upsertIdx > crossUserIdx,
    'cross-user deactivate must run before upsert');
});

Deno.test("register-device-token still rejects malformed iOS tokens", () => {
  assertStringIncludes(src, "allowedHexLengths");
  assertStringIncludes(src, "Invalid iOS device token format");
});

Deno.test("register-device-token upsert body only activates the caller's row", () => {
  // The upsert MUST tie is_active=true to user_id from the verified JWT.
  const upsertBlock = src.slice(src.indexOf('.upsert('), src.indexOf('.upsert(') + 400);
  assertStringIncludes(upsertBlock, 'user_id: userId');
  assertStringIncludes(upsertBlock, 'is_active: true');
});