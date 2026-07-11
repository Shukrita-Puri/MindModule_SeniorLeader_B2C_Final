/**
 * Batch B — countable-state SSOT contract.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  COUNTABLE_DELIVERY_STATES,
  NON_COUNTABLE_DELIVERY_STATES,
  isCountableDeliveryState,
  isNonCountableDeliveryState,
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
