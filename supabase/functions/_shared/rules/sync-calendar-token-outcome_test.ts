import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { mapEnsureFreshOutcomeToSyncPhase } from './sync-calendar-token-outcome.ts';

Deno.test('ok outcome → passes accessToken through', () => {
  const phase = mapEnsureFreshOutcomeToSyncPhase({
    outcome: 'ok',
    accessToken: 'live',
  });
  assertEquals(phase.kind, 'ok');
  if (phase.kind === 'ok') assertEquals(phase.accessToken, 'live');
});

Deno.test('refreshed outcome → passes new accessToken through', () => {
  const phase = mapEnsureFreshOutcomeToSyncPhase({
    outcome: 'refreshed',
    accessToken: 'fresh',
  });
  assertEquals(phase.kind, 'ok');
  if (phase.kind === 'ok') assertEquals(phase.accessToken, 'fresh');
});

Deno.test('reconnect_required (invalid_grant) → reconnect response with refresh_failed reason', () => {
  const phase = mapEnsureFreshOutcomeToSyncPhase({
    outcome: 'reconnect_required',
    reason: 'refresh_rejected',
    providerError: 'invalid_grant',
  });
  assertEquals(phase.kind, 'reconnect');
  if (phase.kind === 'reconnect') {
    assertEquals(phase.response.reconnectRequired, true);
    assertEquals(phase.response.reason, 'refresh_failed');
  }
});

Deno.test('reconnect_required (no refresh token) → preserves no_refresh_token reason vocabulary', () => {
  const phase = mapEnsureFreshOutcomeToSyncPhase({
    outcome: 'reconnect_required',
    reason: 'no_access_token_and_no_refresh_token',
  });
  assertEquals(phase.kind, 'reconnect');
  if (phase.kind === 'reconnect') {
    assertEquals(phase.response.reason, 'no_refresh_token');
  }
});

Deno.test('reconnect_required (decrypt failure) → surfaces refresh_decrypt_failed reason', () => {
  const phase = mapEnsureFreshOutcomeToSyncPhase({
    outcome: 'reconnect_required',
    reason: 'refresh_decrypt_failed',
  });
  assertEquals(phase.kind, 'reconnect');
  if (phase.kind === 'reconnect') {
    assertEquals(phase.response.reason, 'refresh_decrypt_failed');
  }
});

Deno.test('transient 429 → sync_delayed response, dbReason mirrors helper reason', () => {
  const phase = mapEnsureFreshOutcomeToSyncPhase({
    outcome: 'refresh_transient_error',
    reason: 'provider_429',
    status: 429,
    providerError: 'rate_limited',
  });
  assertEquals(phase.kind, 'transient');
  if (phase.kind === 'transient') {
    assertEquals(phase.response.rateLimited, true);
    assertEquals(phase.response.syncStatus, 'sync_delayed');
    assertEquals(phase.response.reason, 'token_refresh_provider_429');
    assertEquals(phase.dbReason, 'token_refresh_provider_429');
  }
});

Deno.test('transient network_error → sync_delayed with network reason', () => {
  const phase = mapEnsureFreshOutcomeToSyncPhase({
    outcome: 'refresh_transient_error',
    reason: 'network_error',
    providerError: 'ECONNRESET',
  });
  assertEquals(phase.kind, 'transient');
  if (phase.kind === 'transient') {
    assertEquals(phase.dbReason, 'token_refresh_network_error');
  }
});