/**
 * Batch A — test-push refuses to send when APP_ENV/APNS_ENVIRONMENT
 * disagree. Prevents a silent APNs sandbox fallback in production.
 */
import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const sharedSrc = await Deno.readTextFile(
  new URL("../_shared/apns-env.ts", import.meta.url),
);

Deno.test("test-push imports the shared APNs env validator", () => {
  assertStringIncludes(src, 'import { validateApnsEnvironment } from "../_shared/apns-env.ts"');
});

Deno.test("test-push blocks the send flow on env mismatch", () => {
  assertStringIncludes(src, "const envCheck = validateApnsEnvironment();");
  assertStringIncludes(src, "if (!envCheck.ok) {");
  assertStringIncludes(src, "apns_env_mismatch");
  // The env check must run BEFORE the APNs credentials read + JWT creation
  // + notification_log insert.
  const envIdx = src.indexOf("envCheck.ok");
  // Use the CALL sites (after `serve(`) rather than the top-level function
  // definition of createApnsJwt, so we're comparing runtime ordering.
  const serveIdx = src.indexOf('serve(async (req)');
  const jwtIdx = src.indexOf('createApnsJwt(apnsKey', serveIdx);
  const logIdx = src.indexOf('notification_log', serveIdx);
  assert(envIdx > 0 && jwtIdx > envIdx, "env check must precede JWT creation");
  assert(envIdx > 0 && logIdx > envIdx, "env check must precede notification_log insert");
});

Deno.test("shared apns-env validator refuses APP_ENV=production + non-prod APNS", () => {
  // Contract check on the helper itself. The helper is pure and does not
  // require deno --allow-net; we exercise it in-process by stubbing Deno.env.
  assertStringIncludes(sharedSrc, "appEnv === 'production' && apnsEnv !== 'production'");
  assertStringIncludes(sharedSrc, "'production' ? 'api.push.apple.com'");
});

Deno.test("validateApnsEnvironment runtime behaviour", async () => {
  const originalAppEnv = Deno.env.get("APP_ENV");
  const originalApnsEnv = Deno.env.get("APNS_ENVIRONMENT");
  const { validateApnsEnvironment } = await import("../_shared/apns-env.ts");
  try {
    Deno.env.set("APP_ENV", "production");
    Deno.env.set("APNS_ENVIRONMENT", "development");
    const bad = validateApnsEnvironment();
    assert(bad.ok === false, `expected mismatch to be rejected; got ${JSON.stringify(bad)}`);
    assertStringIncludes(bad.reason ?? "", "APNs environment mismatch");

    Deno.env.set("APNS_ENVIRONMENT", "production");
    const good = validateApnsEnvironment();
    assert(good.ok === true, `prod+prod should be accepted; got ${JSON.stringify(good)}`);
    assert(good.apnsHost === "api.push.apple.com");

    Deno.env.delete("APP_ENV");
    Deno.env.set("APNS_ENVIRONMENT", "development");
    const dev = validateApnsEnvironment();
    assert(dev.ok === true, "non-prod APP_ENV allows any APNs env");
    assert(dev.apnsHost === "api.sandbox.push.apple.com");
  } finally {
    if (originalAppEnv === undefined) Deno.env.delete("APP_ENV");
    else Deno.env.set("APP_ENV", originalAppEnv);
    if (originalApnsEnv === undefined) Deno.env.delete("APNS_ENVIRONMENT");
    else Deno.env.set("APNS_ENVIRONMENT", originalApnsEnv);
  }
});