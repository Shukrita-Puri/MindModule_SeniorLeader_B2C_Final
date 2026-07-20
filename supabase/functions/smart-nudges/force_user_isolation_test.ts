/**
 * Batch A — smart-nudges ?force_user isolation + admin gate.
 *
 * Source-level assertions (matches the existing test style in this
 * folder). Confirms:
 *   1. `?force_user` is gated by requireAdmin (Auth0 allowlist).
 *   2. Production delivery is the default; dry-run is an EXPLICIT opt-in
 *      via `?force_dry=1|true|yes` (see delivery-mode.ts). Missing APNs
 *      creds or admin auth failure also degrade to dry-run.
 *   3. The evaluation loop is restricted to the forced user, so a
 *      diagnostic run cannot fan out to other users.
 *   4. Admin invocations write an audit_logs entry via writeAdminAudit.
 *   5. APP_ENV/APNS_ENVIRONMENT mismatch hard-fails the send phase and
 *      no notification_log rows are inserted (caps not consumed).
 *   6. APNs JWT creation failure marks the run failed and returns 500,
 *      instead of continuing and silently dropping every notification.
 */
import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const deliverySrc = await Deno.readTextFile(
  new URL("./delivery-mode.ts", import.meta.url),
);

Deno.test("force_user requires an admin JWT via requireAdmin", () => {
  assertStringIncludes(
    src,
    'import { requireAdmin, writeAdminAudit } from "../_shared/admin-guard.ts"',
  );
  assertStringIncludes(src, "if (forceUserId) {");
  assertStringIncludes(src, "const guard = await requireAdmin(req);");
  assertStringIncludes(src, "if (guard.errorResponse) {");
  assertStringIncludes(src, 'await finishRun("force_user_admin_gate_rejected")');
});

Deno.test("delivery mode defaults to production; dry-run is explicit opt-in", () => {
  // Canonical resolver lives in delivery-mode.ts. Production delivery is
  // the default when APNs creds are present and no explicit opt-in flag
  // is set. Dry-run requires ?force_dry=1|true|yes, missing APNs
  // credentials, or a failed admin gate on a force_user diagnostic.
  assertStringIncludes(src, 'import {\n  DeliveryMode,\n  describeDeliveryMode,\n  resolveDeliveryMode,\n} from "./delivery-mode.ts";');
  assertStringIncludes(src, "resolveDeliveryMode({");
  assertStringIncludes(deliverySrc, "'production_delivery'");
  assertStringIncludes(deliverySrc, "'explicit_force_dry'");
  assertStringIncludes(deliverySrc, "'missing_apns_credentials'");
  assertStringIncludes(deliverySrc, "'admin_auth_failure'");
  // Only truthy values ('1' | 'true' | 'yes') opt into dry-run.
  assertStringIncludes(deliverySrc, "new Set(['1', 'true', 'yes'])");
  // Admin auth failure keeps the defense-in-depth degrade to dry-run.
  assertStringIncludes(src, "adminAuthFailed,");
});

Deno.test("force_user restricts the evaluation loop to just that user", () => {
  assertStringIncludes(
    src,
    "const userIds = forceUserId\n      ? (userTokens.has(forceUserId) ? [forceUserId] : [])",
  );
});

Deno.test("force_user invocations are audit-logged", () => {
  assertStringIncludes(src, "await writeAdminAudit(guard.db, {");
  assertStringIncludes(src, 'action: "smart_nudges.force_user"');
  assertStringIncludes(src, "targetUserId: forceUserId");
});

Deno.test("APP_ENV/APNS_ENVIRONMENT mismatch hard-fails BEFORE any send", () => {
  assertStringIncludes(src, 'import { validateApnsEnvironment } from "../_shared/apns-env.ts"');
  assertStringIncludes(src, "const apnsEnvCheck = validateApnsEnvironment();");
  assertStringIncludes(src, "if (!apnsEnvCheck.ok) {");
  assertStringIncludes(src, 'await finishRun("apns_env_mismatch")');
  // The mismatch return must happen BEFORE any notification_log INSERT
  // in the send loop, so caps are never consumed by phantom deliveries.
  const mismatchIdx = src.indexOf('await finishRun("apns_env_mismatch")');
  const sendLoopIdx = src.indexOf('for (const notif of allNotifications)');
  assert(mismatchIdx > 0 && sendLoopIdx > mismatchIdx,
    'env mismatch guard must run before the send loop');
});

Deno.test("APNs JWT creation failure fails the whole run cleanly", () => {
  assertStringIncludes(src, 'await finishRun("apns_jwt_creation_failed")');
  assertStringIncludes(src, '"apns_jwt_creation_failed"');
});