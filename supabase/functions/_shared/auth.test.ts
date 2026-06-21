/**
 * Regression tests for shared auth module.
 *
 * Covers the security fix that disables the x-dev-user-id header in
 * production. In production, the header MUST be ignored and the request
 * MUST fall through to real Auth0 JWT verification (which fails here
 * because no valid Bearer token is provided).
 */
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isProductionEnv, verifyAuth0JWT } from "./auth.ts";

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void> | void) {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) prev[k] = Deno.env.get(k);
  try {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
    return fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

Deno.test("isProductionEnv: true when ENVIRONMENT=production", () => {
  withEnv({ ENVIRONMENT: "production", APP_ENV: undefined }, () => {
    assertEquals(isProductionEnv(), true);
  });
});

Deno.test("isProductionEnv: true when APP_ENV=production", () => {
  withEnv({ ENVIRONMENT: undefined, APP_ENV: "production" }, () => {
    assertEquals(isProductionEnv(), true);
  });
});

Deno.test("isProductionEnv: false in development", () => {
  withEnv({ ENVIRONMENT: "development", APP_ENV: "development" }, () => {
    assertEquals(isProductionEnv(), false);
  });
});

Deno.test("x-dev-user-id IS honored when not in production", async () => {
  await withEnv(
    { ENVIRONMENT: "development", APP_ENV: "development", AUTH0_DOMAIN: "example.auth0.com" },
    async () => {
      const req = new Request("https://example.test/", {
        headers: { "x-dev-user-id": "auth0|dev-user-123" },
      });
      const sub = await verifyAuth0JWT(req);
      assertEquals(sub, "auth0|dev-user-123");
    },
  );
});

Deno.test("x-dev-user-id is IGNORED in production (cannot impersonate)", async () => {
  await withEnv(
    { ENVIRONMENT: "production", APP_ENV: "production", AUTH0_DOMAIN: "example.auth0.com" },
    async () => {
      const req = new Request("https://example.test/", {
        headers: { "x-dev-user-id": "auth0|attacker-target-user" },
        // No Authorization header — must fall through and reject.
      });
      await assertRejects(
        () => verifyAuth0JWT(req),
        Error,
        "Missing or invalid Authorization header",
      );
    },
  );
});

Deno.test("x-dev-user-id is IGNORED in production even with garbage Bearer (no silent accept)", async () => {
  await withEnv(
    { ENVIRONMENT: "production", APP_ENV: "production", AUTH0_DOMAIN: "example.auth0.com" },
    async () => {
      const req = new Request("https://example.test/", {
        headers: {
          "x-dev-user-id": "auth0|attacker-target-user",
          // JWT-shaped (3 dotted segments) so it goes through jwtVerify
          // and is rejected, instead of taking the /userinfo opaque-token path.
          Authorization: "Bearer aaa.bbb.ccc",
        },
      });
      // Must NOT return the dev id. Must throw because JWT verification fails.
      await assertRejects(() => verifyAuth0JWT(req), Error);
    },
  );
});