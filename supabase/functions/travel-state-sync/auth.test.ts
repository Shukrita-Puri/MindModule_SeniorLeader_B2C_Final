// Sprint 11 tests — travel-state-sync authorization decisions.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideTravelSyncAuth } from "./auth.ts";

const KEY = "SERVICE_ROLE_TEST_KEY";

Deno.test("service-role bearer is allowed for multi-user scan", () => {
  const d = decideTravelSyncAuth({
    authHeader: `Bearer ${KEY}`,
    serviceRoleKey: KEY,
    bodyUserId: null,
    callerSub: null,
    callerIsAdmin: false,
  });
  assertEquals(d.allow, true);
  if (d.allow) {
    assertEquals(d.scope, "service");
    assertEquals(d.forceSingleUserId, null);
  }
});

Deno.test("service-role bearer may target any userId", () => {
  const d = decideTravelSyncAuth({
    authHeader: `Bearer ${KEY}`,
    serviceRoleKey: KEY,
    bodyUserId: "auth0|abc",
    callerSub: null,
    callerIsAdmin: false,
  });
  assertEquals(d.allow, true);
  if (d.allow) assertEquals(d.forceSingleUserId, "auth0|abc");
});

Deno.test("anonymous call rejected 401", () => {
  const d = decideTravelSyncAuth({
    authHeader: null,
    serviceRoleKey: KEY,
    bodyUserId: null,
    callerSub: null,
    callerIsAdmin: false,
  });
  assertEquals(d.allow, false);
  if (!d.allow) {
    assertEquals(d.status, 401);
    assertEquals(d.reason, "unauthenticated");
  }
});

Deno.test("bad bearer with no verified sub rejected 401", () => {
  const d = decideTravelSyncAuth({
    authHeader: "Bearer garbage",
    serviceRoleKey: KEY,
    bodyUserId: null,
    callerSub: null,
    callerIsAdmin: false,
  });
  assertEquals(d.allow, false);
  if (!d.allow) assertEquals(d.status, 401);
});

Deno.test("admin JWT may do multi-user scan", () => {
  const d = decideTravelSyncAuth({
    authHeader: "Bearer user.jwt",
    serviceRoleKey: KEY,
    bodyUserId: null,
    callerSub: "auth0|admin",
    callerIsAdmin: true,
  });
  assertEquals(d.allow, true);
  if (d.allow) assertEquals(d.scope, "admin");
});

Deno.test("admin JWT may target arbitrary user", () => {
  const d = decideTravelSyncAuth({
    authHeader: "Bearer user.jwt",
    serviceRoleKey: KEY,
    bodyUserId: "auth0|other",
    callerSub: "auth0|admin",
    callerIsAdmin: true,
  });
  assertEquals(d.allow, true);
  if (d.allow) assertEquals(d.forceSingleUserId, "auth0|other");
});

Deno.test("regular user without body.userId rejected as multi-user scan", () => {
  const d = decideTravelSyncAuth({
    authHeader: "Bearer user.jwt",
    serviceRoleKey: KEY,
    bodyUserId: null,
    callerSub: "auth0|alice",
    callerIsAdmin: false,
  });
  assertEquals(d.allow, false);
  if (!d.allow) {
    assertEquals(d.status, 403);
    assertEquals(d.reason, "forbidden_multi_user_scan");
  }
});

Deno.test("regular user targeting another user rejected 403", () => {
  const d = decideTravelSyncAuth({
    authHeader: "Bearer user.jwt",
    serviceRoleKey: KEY,
    bodyUserId: "auth0|bob",
    callerSub: "auth0|alice",
    callerIsAdmin: false,
  });
  assertEquals(d.allow, false);
  if (!d.allow) {
    assertEquals(d.status, 403);
    assertEquals(d.reason, "forbidden_other_user");
  }
});

Deno.test("regular user may self-sync when body.userId === callerSub", () => {
  const d = decideTravelSyncAuth({
    authHeader: "Bearer user.jwt",
    serviceRoleKey: KEY,
    bodyUserId: "auth0|alice",
    callerSub: "auth0|alice",
    callerIsAdmin: false,
  });
  assertEquals(d.allow, true);
  if (d.allow) {
    assertEquals(d.scope, "self");
    assertEquals(d.forceSingleUserId, "auth0|alice");
  }
});

Deno.test("empty service-role env does not allow accidental unauth pass", () => {
  const d = decideTravelSyncAuth({
    authHeader: "Bearer ",
    serviceRoleKey: "",
    bodyUserId: null,
    callerSub: null,
    callerIsAdmin: false,
  });
  assertEquals(d.allow, false);
});
