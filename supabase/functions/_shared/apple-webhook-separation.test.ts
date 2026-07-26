/**
 * Guards the separation between the existing APNs user-notification system and
 * the Apple App Store Server Notifications V2 subscription webhook.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const WEBHOOK = await Deno.readTextFile(
  new URL('../apple-notifications/index.ts', import.meta.url),
);
const ENTITLEMENT = await Deno.readTextFile(
  new URL('./apple-entitlement.ts', import.meta.url),
);

const APNS_SURFACES = [
  'notification_device_tokens',
  'notification_log',
  'notification_preferences',
  'notification_delivery_attempts',
  'notification_dispatch_claims',
  'apns',
  'APNS_P8_KEY',
  'sendPush',
  'smart-nudges',
];

Deno.test('apple webhook never touches the APNs notification system', () => {
  for (const surface of APNS_SURFACES) {
    assert(
      !WEBHOOK.includes(surface),
      `apple-notifications must not reference APNs surface: ${surface}`,
    );
  }
});

Deno.test('apple webhook handles every required V2 notification type', () => {
  const required = [
    'SUBSCRIBED',
    'DID_RENEW',
    'DID_FAIL_TO_RENEW',
    'EXPIRED',
    'REFUND',
    'REVOKE',
    'GRACE_PERIOD_EXPIRED',
    'PRICE_INCREASE',
    'OFFER_REDEEMED',
  ];
  for (const type of required) {
    assert(WEBHOOK.includes(`'${type}'`), `missing handling for ${type}`);
  }
});

Deno.test('PRICE_INCREASE is informational, entitlement types are re-verified', () => {
  const informational = WEBHOOK.split('INFORMATIONAL_TYPES')[1]?.split(']')[0] ?? '';
  assert(informational.includes("'PRICE_INCREASE'"));
  const reverify = WEBHOOK.split('REVERIFY_TYPES')[1]?.split(']')[0] ?? '';
  for (const t of ['REFUND', 'REVOKE', 'EXPIRED', 'GRACE_PERIOD_EXPIRED', 'DID_FAIL_TO_RENEW', 'SUBSCRIBED', 'DID_RENEW', 'OFFER_REDEEMED']) {
    assert(reverify.includes(`'${t}'`), `${t} should be re-verified server-side`);
  }
});

Deno.test('webhook is signature-gated and idempotent on notificationUUID', () => {
  assert(WEBHOOK.includes('verifyAppleSignedPayload'));
  assert(WEBHOOK.includes('apple_notification_events'));
  assert(WEBHOOK.includes('notification_uuid: notification.notificationUUID'));
  // duplicate delivery acknowledged, ledger failure retried
  assert(WEBHOOK.includes("'23505'"));
  assert(WEBHOOK.includes('duplicate: true'));
});

Deno.test('webhook never trusts caller-supplied identity or isPro', () => {
  assert(!WEBHOOK.includes('isPro'));
  // user resolution is a server-side lookup only
  assert(WEBHOOK.includes("from('apple_transactions')"));
  assert(WEBHOOK.includes("from('profiles')"));
});

Deno.test('entitlement rule keeps active Stripe subscribers on Pro', () => {
  assert(ENTITLEMENT.includes('stripeStillActive'));
  assert(ENTITLEMENT.includes('active || stripeStillActive'));
});

Deno.test('webhook returns distinct statuses for each failure class', () => {
  for (const status of ['405', '400', '401', '500']) {
    assert(WEBHOOK.includes(status), `missing ${status} response path`);
  }
  assertEquals(WEBHOOK.includes('signedPayload required'), true);
});
