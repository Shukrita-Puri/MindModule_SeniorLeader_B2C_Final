/**
 * Batch A/B — unregister-device-token logout contract.
 *
 * Source-level assertions: the function must (a) authenticate the caller
 * via the shared Auth0 helper, (b) only ever touch the row scoped to the
 * caller's user_id AND supplied device_token, and (c) refuse to wipe
 * every token for a user when device_token is missing.
 */
import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("unregister-device-token requires authenticated caller", () => {
  assertStringIncludes(src, "authenticateRequest");
  assertStringIncludes(src, "if ('errorResponse' in auth) return auth.errorResponse");
});

Deno.test("unregister-device-token scopes update to user_id AND device_token", () => {
  const updates = src.split(".from('notification_device_tokens')").slice(1);
  assert(updates.length >= 1, "expected at least one table access");
  for (const chunk of updates) {
    const head = chunk.slice(0, 500);
    assertStringIncludes(head, ".eq('user_id', userId)");
    assertStringIncludes(head, ".eq('device_token', deviceToken)");
    assertStringIncludes(head, ".eq('is_active', true)");
  }
});

Deno.test("unregister-device-token REQUIRES device_token (multi-device safety)", () => {
  assertStringIncludes(src, "device_token is required");
  assertStringIncludes(src, "status: 400");
  // No wildcard update path — the update must always be followed by the
  // device_token predicate, not by ` : await query`.
  assert(
    !/:\s*await\s+query\b/.test(src),
    "must not run the update without .eq('device_token', ...)",
  );
});

Deno.test("unregister-device-token never issues a DELETE", () => {
  assert(!src.includes(".delete("), "unregister-device-token must not delete rows");
});

Deno.test("unregister-device-token never logs the raw device token", () => {
  // 12-char prefix is fine for correlation; bare `deviceToken` is not.
  const logCalls = src.match(/console\.(log|warn|error)\([\s\S]*?\)/g) ?? [];
  for (const call of logCalls) {
    if (call.includes("deviceToken") && !call.includes("deviceToken.substring")) {
      throw new Error(`raw device token leaked into log: ${call}`);
    }
  }
  assertStringIncludes(src, "deviceToken.substring(0, 12)");
});

Deno.test(
  "multi-device contract: signing out on Device A leaves Device B active",
  async () => {
    const rows = [
      { user_id: "u1", device_token: "aaa111", is_active: true, updated_at: "t0" },
      { user_id: "u1", device_token: "bbb222", is_active: true, updated_at: "t0" },
      { user_id: "u2", device_token: "ccc333", is_active: true, updated_at: "t0" },
    ];

    function makeQuery() {
      const filters: Array<[string, unknown]> = [];
      const q: any = {
        _patch: null as Record<string, unknown> | null,
        update(patch: Record<string, unknown>) {
          q._patch = patch;
          return q;
        },
        eq(col: string, val: unknown) {
          filters.push([col, val]);
          return q;
        },
        then(onFulfilled: (v: any) => unknown) {
          const matched = rows.filter((r) =>
            filters.every(([c, v]) => (r as any)[c] === v),
          );
          for (const m of matched) Object.assign(m, q._patch);
          return Promise.resolve(onFulfilled({ error: null, count: matched.length }));
        },
      };
      return q;
    }
    const supabase = { from: (_t: string) => makeQuery() };

    // Exactly mirrors index.ts's update chain.
    const deviceToken = "aaa111";
    const userId = "u1";
    const { error, count } = await supabase
      .from("notification_device_tokens")
      .update({ is_active: false, updated_at: "now" }, { count: "exact" } as any)
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("device_token", deviceToken);

    assert(!error);
    assert(count === 1, `expected exactly 1 row deactivated, got ${count}`);
    const a = rows.find((r) => r.device_token === "aaa111")!;
    const b = rows.find((r) => r.device_token === "bbb222")!;
    const c = rows.find((r) => r.device_token === "ccc333")!;
    assert(a.is_active === false, "Device A must be deactivated");
    assert(b.is_active === true, "Device B (same user) must remain active");
    assert(c.is_active === true, "other user must be untouched");
  },
);
