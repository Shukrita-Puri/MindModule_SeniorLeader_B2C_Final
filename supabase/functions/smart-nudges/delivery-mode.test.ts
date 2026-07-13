// Regression tests for the Smart Nudges delivery-mode contract.
//
// Run: `deno test supabase/functions/smart-nudges/delivery-mode.test.ts`
//
// Equivalent curl scenarios (documented for reference):
//   1. pg_cron:    POST /functions/v1/smart-nudges                       → production_delivery
//   2. force_dry:  POST /functions/v1/smart-nudges?force_dry=true        → explicit_force_dry
//   3. force_dry:  POST /functions/v1/smart-nudges?force_dry=1           → explicit_force_dry
//   4. legacy:     POST /functions/v1/smart-nudges?force_dry=0           → production_delivery
//   5. no creds:   (secrets missing) any request                         → missing_apns_credentials
//   6. no admin:   POST ?force_user=<id> without admin JWT               → admin_auth_failure (401 short-circuit)
//   7. admin OK:   POST ?force_user=<id>&force_dry=1 with admin JWT      → explicit_force_dry

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveDeliveryMode, isExplicitForceDry } from './delivery-mode.ts';

const u = (qs = '') => new URL(`https://x.test/smart-nudges${qs ? '?' + qs : ''}`);

Deno.test('pg_cron no params with APNs creds → production_delivery', () => {
  const m = resolveDeliveryMode({ url: u(), apnsCredsPresent: true });
  assertEquals(m, { dryRun: false, reason: 'production_delivery' });
});

Deno.test('force_dry=true → explicit_force_dry', () => {
  const m = resolveDeliveryMode({ url: u('force_dry=true'), apnsCredsPresent: true });
  assertEquals(m, { dryRun: true, reason: 'explicit_force_dry' });
});

Deno.test('force_dry=1 → explicit_force_dry', () => {
  const m = resolveDeliveryMode({ url: u('force_dry=1'), apnsCredsPresent: true });
  assertEquals(m, { dryRun: true, reason: 'explicit_force_dry' });
});

Deno.test('force_dry=YES (case-insensitive) → explicit_force_dry', () => {
  const m = resolveDeliveryMode({ url: u('force_dry=YES'), apnsCredsPresent: true });
  assertEquals(m, { dryRun: true, reason: 'explicit_force_dry' });
});

Deno.test('force_dry=0 with creds → production_delivery', () => {
  const m = resolveDeliveryMode({ url: u('force_dry=0'), apnsCredsPresent: true });
  assertEquals(m, { dryRun: false, reason: 'production_delivery' });
});

Deno.test('missing APNs credentials → missing_apns_credentials (even without force_dry)', () => {
  const m = resolveDeliveryMode({ url: u(), apnsCredsPresent: false });
  assertEquals(m, { dryRun: true, reason: 'missing_apns_credentials' });
});

Deno.test('missing creds precedence: creds absent AND force_dry=true → missing_apns_credentials', () => {
  const m = resolveDeliveryMode({ url: u('force_dry=true'), apnsCredsPresent: false });
  assertEquals(m, { dryRun: true, reason: 'missing_apns_credentials' });
});

Deno.test('admin auth failure surfaced to resolver → admin_auth_failure', () => {
  const m = resolveDeliveryMode({
    url: u('force_user=abc'),
    apnsCredsPresent: true,
    adminAuthFailed: true,
  });
  assertEquals(m, { dryRun: true, reason: 'admin_auth_failure' });
});

Deno.test('isExplicitForceDry: unset / empty / bogus → false', () => {
  assertEquals(isExplicitForceDry(u()), false);
  assertEquals(isExplicitForceDry(u('force_dry=')), false);
  assertEquals(isExplicitForceDry(u('force_dry=0')), false);
  assertEquals(isExplicitForceDry(u('force_dry=no')), false);
  assertEquals(isExplicitForceDry(u('force_dry=false')), false);
});