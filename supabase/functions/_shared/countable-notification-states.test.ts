/**
 * Batch B — countable-state SSOT contract.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  COUNTABLE_DELIVERY_STATES,
  NON_COUNTABLE_DELIVERY_STATES,
  isCountableDeliveryState,
  isNonCountableDeliveryState,
  isSilentSyncNotification,
  isUserVisibleNotification,
  excludeSilentSync,
} from "./countable-notification-states.ts";

Deno.test("failed / dry_run / suppressed / test_push do NOT consume limits", () => {
  for (const s of [
    "failed",
    "dry_run",
    "suppressed",
    "validation_rejected",
    "expired_before_delivery",
    "expired",
    "configuration_failed",
    "duplicate_claim",
    "test_push",
  ]) {
    assert(!isCountableDeliveryState(s), `${s} must not be countable`);
    assert(isNonCountableDeliveryState(s), `${s} must be explicitly non-countable`);
  }
});

Deno.test("legacy accepted / delivered / sent / pending still count", () => {
  for (const s of ["accepted", "delivered", "sent", "pending"]) {
    assert(isCountableDeliveryState(s), `${s} (legacy) must still count`);
  }
});

Deno.test("post-Batch-F canonical states count", () => {
  for (const s of ["accepted_by_apns", "opened", "action_completed"]) {
    assert(isCountableDeliveryState(s), `${s} must count`);
  }
});

Deno.test("null / empty / unknown states do not count", () => {
  assertEquals(isCountableDeliveryState(null), false);
  assertEquals(isCountableDeliveryState(undefined), false);
  assertEquals(isCountableDeliveryState(""), false);
  assertEquals(isCountableDeliveryState("something_new"), false);
});

Deno.test("countable and non-countable sets are disjoint", () => {
  for (const s of COUNTABLE_DELIVERY_STATES) {
    assert(
      !(NON_COUNTABLE_DELIVERY_STATES as readonly string[]).includes(s),
      `${s} appears in both sets`,
    );
  }
});

Deno.test("silent background sync is never user-visible", () => {
  const rows = [
    { notification_type: "early_morning_sync_2026-09-22_h05_ab", variant_id: "silent_sync", delivery_state: "accepted" },
    { notification_type: "daytime_sync_2026-09-22_h11_cd", variant_id: "silent_sync", delivery_state: "delivered" },
    { notification_type: "daytime_sync_2026-09-22_h13_ef", variant_id: null, delivery_state: "accepted" },
  ];
  for (const r of rows) {
    assert(isSilentSyncNotification(r), `${r.notification_type} must be silent sync`);
    assert(!isUserVisibleNotification(r), `${r.notification_type} must not consume limits`);
  }
});

Deno.test("real nudges remain user-visible and countable", () => {
  const row = { notification_type: "nudge_two", variant_id: "FB-N2-light::D", delivery_state: "delivered" };
  assert(!isSilentSyncNotification(row));
  assert(isUserVisibleNotification(row));
});

Deno.test("a failed real nudge is not user-visible", () => {
  assert(!isUserVisibleNotification({
    notification_type: "nudge_one",
    variant_id: "FB-N1-light::D",
    delivery_state: "failed",
  }));
});

Deno.test("excludeSilentSync keeps only user-facing rows", () => {
  const kept = excludeSilentSync([
    { notification_type: "daytime_sync_x", variant_id: "silent_sync" },
    { notification_type: "nudge_three", variant_id: "FB-N3-light::D" },
    { notification_type: "early_morning_sync_y", variant_id: "silent_sync" },
  ]);
  assertEquals(kept.length, 1);
  assertEquals(kept[0].notification_type, "nudge_three");
});

Deno.test("nine silent syncs no longer exhaust a 3/day cap", () => {
  const day = [
    ...Array.from({ length: 9 }, (_, i) => ({
      notification_type: `daytime_sync_h${i}`,
      variant_id: "silent_sync",
      delivery_state: "accepted",
    })),
    { notification_type: "nudge_one", variant_id: "FB-N1-light::D", delivery_state: "delivered" },
  ];
  assertEquals(excludeSilentSync(day).length, 1);
});
