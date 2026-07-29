import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const SRC = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url),
);

/**
 * Regression: false "offline" suppression based on stale
 * notification_device_tokens.updated_at must be gone.
 *
 * notification_device_tokens.updated_at is NOT a heartbeat — it only
 * changes on token rotation / app launch. Push exists precisely to reach
 * users who are NOT currently in the app, so we must not gate delivery
 * on it.
 */
Deno.test("smart-nudges does not emit pre-evaluator 'offline' suppression", () => {
  // The old gate inserted a notification_log row with
  // suppression_reason: 'offline' and variant_id 'skip-offline'.
  assert(
    !SRC.includes("suppression_reason: 'offline'"),
    "found legacy 'offline' suppression_reason — should be removed",
  );
  assert(
    !SRC.includes("'skip-offline'") && !SRC.includes('"skip-offline"'),
    "found legacy 'skip-offline' variant_id — should be removed",
  );
});

Deno.test("smart-nudges no longer uses DEVICE_OFFLINE_STALE_MIN as a delivery gate", () => {
  // The constant may remain declared but it MUST NOT appear inside a
  // conditional that decides whether to send a push.
  const usagesAfterDecl = SRC.split("const DEVICE_OFFLINE_STALE_MIN").slice(1).join("");
  assert(
    !/offlineForMin\s*>\s*DEVICE_OFFLINE_STALE_MIN/.test(usagesAfterDecl),
    "DEVICE_OFFLINE_STALE_MIN is still used as a send gate",
  );
});

Deno.test("smart-nudges keeps APNs permanent-failure deactivation contract", () => {
  // 410 Unregistered, 400 BadDeviceToken, DeviceTokenNotForTopic still
  // deactivate tokens. Transient failures (network, send_threw, 5xx) must
  // not.
  assert(SRC.includes("result.status === 410"), "missing 410 Unregistered deactivation");
  assert(/baddevicetoken/i.test(SRC), "missing BadDeviceToken deactivation");
  assert(/devicetokennotfortopic/i.test(SRC), "missing DeviceTokenNotForTopic deactivation");
  // The catch branch must not call deactivation.
  const catchBlock = SRC.split("catch (e) {").slice(1).join("");
  assert(
    !/is_active:\s*false/.test(catchBlock.split("} catch")[0] ?? ""),
    "transient APNs failure path must not deactivate tokens",
  );
});

Deno.test("smart-nudges emits APNs attempt metadata on the notification_log row", () => {
  for (const field of ["apns_status", "apns_reason", "apns_token_prefix"]) {
    assert(SRC.includes(field), `missing APNs telemetry field: ${field}`);
  }
});

/**
 * Batch B follow-up — updated to current production contract.
 *
 * Prior contract: renamed the stale-device metric to `activityAgeMin` /
 * `last_activity_age_min` diagnostic fields. That intermediate rename
 * was removed entirely — device-token `updated_at` is NOT a heartbeat
 * (see the comment at the "Delivery-context" block in index.ts) and
 * there is no per-user staleness diagnostic anymore. The current
 * contract is simply: no such metric, and no source reference to
 * DEVICE_OFFLINE_STALE_MIN as a delivery gate.
 */
Deno.test("stale-device metric is fully removed (no activityAge diagnostic)", () => {
  assert(!SRC.includes("activityAgeMin"), "activityAgeMin must NOT exist — stale-device diagnostic was removed");
  assert(!SRC.includes("last_activity_age_min"), "last_activity_age_min must NOT exist");
  assert(
    SRC.includes("device-token `updated_at` is NOT a heartbeat") ||
      SRC.includes("device-token `updated_at`"),
    "expected the anchor comment explaining why no heartbeat exists",
  );
});

/**
 * Smoke: a user with no active device tokens is naturally excluded by
 * the `is_active = true` filter at fetch time — there is no separate
 * 'no_valid_token' suppression code path, so we just assert the contract
 * that the only token query is the active filter.
 */
Deno.test("smart-nudges only iterates users with active tokens (no_valid_token contract)", () => {
  assertEquals(
    (SRC.match(/from\(["']notification_device_tokens["']\)[\s\S]{0,200}\.eq\(["']is_active["'],\s*true\)/g) || []).length >= 1,
    true,
    "expected at least one is_active=true filter on notification_device_tokens",
  );
});