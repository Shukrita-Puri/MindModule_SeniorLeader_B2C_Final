// Fix C — Suppression must ignore dry-run notifications.
//
// A dry-run row in `notification_log` represents an evaluation only. It
// must never influence:
//   • the 2-hour suppression window
//   • per-slot suppression (sentSlotsToday)
//   • daily notification cap
//   • Week-Ahead weekly invite cap
//   • the repeated-expiry "receipt feedback" heuristic
//
// These tests use two complementary layers of assertion:
//   1. Semantic: the shared COUNTABLE_DELIVERY_STATES SSOT excludes
//      `dry_run` and includes `pending` / `accepted` / `delivered`.
//   2. Source-level: every suppression-relevant `notification_log` query
//      in `smart-nudges/index.ts` filters on that SSOT so the SQL layer
//      cannot regress.

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  COUNTABLE_DELIVERY_STATES,
  NON_COUNTABLE_DELIVERY_STATES,
  isCountableDeliveryState,
} from '../_shared/countable-notification-states.ts';

const src = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

// ── Semantic contract ────────────────────────────────────────────────

Deno.test('dry_run is non-countable → does NOT suppress', () => {
  assertEquals(isCountableDeliveryState('dry_run'), false);
  assert((NON_COUNTABLE_DELIVERY_STATES as readonly string[]).includes('dry_run'));
});

Deno.test('pending / accepted / delivered are countable → DO suppress', () => {
  for (const state of ['pending', 'accepted', 'delivered']) {
    assertEquals(isCountableDeliveryState(state), true, `${state} must be countable`);
  }
});

Deno.test('new-vocabulary states (accepted_by_apns / opened / action_completed) are countable', () => {
  for (const state of ['accepted_by_apns', 'opened', 'action_completed']) {
    assertEquals(isCountableDeliveryState(state), true, `${state} must be countable`);
  }
});

Deno.test('other non-countable states also ignored (suppressed, failed, expired, test_push)', () => {
  for (const state of ['suppressed', 'failed', 'expired_before_delivery', 'expired', 'test_push', 'validation_rejected', 'configuration_failed', 'duplicate_claim']) {
    assertEquals(isCountableDeliveryState(state), false, `${state} must be non-countable`);
  }
});

// ── Source-level guards on every suppression query ────────────────────

function extractQueryBlock(needleAfter: string, marker = ".from('notification_log')"): string {
  const anchor = src.indexOf(needleAfter);
  assert(anchor > 0, `anchor not found: ${needleAfter}`);
  const from = src.lastIndexOf(marker, anchor);
  assert(from > 0, `from-clause not found before: ${needleAfter}`);
  const end = src.indexOf(';', anchor);
  return src.slice(from, end);
}

Deno.test('2-hour suppression query filters on COUNTABLE_DELIVERY_STATES', () => {
  const block = extractQueryBlock('2 * 60 * 60 * 1000).toISOString()');
  assert(
    block.includes("COUNTABLE_DELIVERY_STATES"),
    "2h suppression query must filter delivery_state so dry-run rows do not suppress:\n" + block,
  );
});

Deno.test('daily-cap / sentSlotsToday query filters on COUNTABLE_DELIVERY_STATES', () => {
  // The `todayLogs` fetch is the SSOT for daily cap + slot suppression.
  const block = extractQueryBlock('.lt(\'sent_at\', todayEndUtc)');
  assert(
    block.includes("COUNTABLE_DELIVERY_STATES"),
    "todayLogs (daily cap + sentSlotsToday) must filter delivery_state:\n" + block,
  );
});

Deno.test('week-ahead weekly cap query filters on COUNTABLE_DELIVERY_STATES', () => {
  const block = extractQueryBlock(".eq('notification_type', 'week_ahead_picker_invite')");
  assert(
    block.includes("COUNTABLE_DELIVERY_STATES"),
    "Weekly Week-Ahead invite lookup must filter delivery_state:\n" + block,
  );
});

Deno.test('repeated-expiry receipt-feedback query filters delivery_state', () => {
  // This query intentionally *includes* expired_before_delivery (it's what
  // the warning inspects) but must exclude dry_run.
  const anchor = src.indexOf('repeated_expiry');
  assert(anchor > 0, 'repeated_expiry anchor not found');
  const from = src.lastIndexOf(".from('notification_log')", anchor);
  const closingLimit = src.indexOf('.limit(3)', from);
  const block = src.slice(from, closingLimit);
  assert(
    block.includes(".in('delivery_state'"),
    "Last-three receipt-feedback query must filter delivery_state so dry-run rows do not skew the warning:\n" + block,
  );
  assert(
    !/\bdry_run\b/.test(block.split('.in(')[1] ?? ''),
    "dry_run must not appear in the receipt-feedback delivery_state allow-list",
  );
});

// ── Behavioural scenarios (documented + asserted via SSOT) ────────────

Deno.test('scenario: previous dry_run → does NOT suppress', () => {
  assertEquals(isCountableDeliveryState('dry_run'), false);
});

Deno.test('scenario: multiple dry-runs followed by first production notification → production still sends', () => {
  const history = ['dry_run', 'dry_run', 'dry_run'];
  const countable = history.filter(isCountableDeliveryState);
  assertEquals(countable.length, 0, "no historical dry-runs should count as sent");
});

Deno.test('scenario: diagnostic followed by scheduled cron → cron notification still eligible', () => {
  const history = ['dry_run']; // diagnostic run left this behind
  assertEquals(history.some(isCountableDeliveryState), false);
});

Deno.test('scenario: pending / accepted / delivered from last 2h → suppresses', () => {
  for (const state of ['pending', 'accepted', 'delivered']) {
    assertEquals(
      [state].some(isCountableDeliveryState),
      true,
      `${state} in the last 2h must suppress a new send`,
    );
  }
});