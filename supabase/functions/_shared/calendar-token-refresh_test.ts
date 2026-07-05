import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  encryptJson,
  decryptJson,
  ensureFreshAccessToken,
  shouldRefresh,
  REFRESH_BUFFER_MS,
  type CalendarConnectionTokenRow,
  type OAuthClientConfig,
  type FetchImpl,
} from './calendar-token-refresh.ts';

// Same 32-byte key used across tests – base64 for AES-256.
const TEST_KEY_B64 = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i + 1)));

const cfg: OAuthClientConfig = {
  googleClientId: 'gid',
  googleClientSecret: 'gsecret',
  microsoftClientId: 'mid',
  microsoftClientSecret: 'msecret',
};

interface FakeClientState {
  updates: Array<Record<string, unknown>>;
  disconnected: boolean;
}

function makeFakeServiceClient(state: FakeClientState) {
  return {
    from(_table: string) {
      return {
        update(payload: Record<string, unknown>) {
          state.updates.push(payload);
          if (payload.is_active === false) state.disconnected = true;
          return {
            eq(_col: string, _val: unknown) {
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  };
}

function makeFetchQueue(responses: Array<() => Promise<Response> | Response>): {
  fetch: FetchImpl;
  calls: Array<{ url: string; body?: string }>;
} {
  const calls: Array<{ url: string; body?: string }> = [];
  const queue = [...responses];
  const impl: FetchImpl = async (input, init) => {
    const url = typeof input === 'string' ? input : (input as URL).toString();
    calls.push({ url, body: init?.body ? String(init.body) : undefined });
    const next = queue.shift();
    if (!next) throw new Error(`Unexpected fetch call to ${url}`);
    return await next();
  };
  return { fetch: impl, calls };
}

async function buildConnection(input: {
  provider: 'google' | 'microsoft';
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt: string | null;
  omitAccess?: boolean;
}): Promise<CalendarConnectionTokenRow> {
  let access_token_enc: string | null = null;
  let token_iv: string | null = null;
  let refresh_token_enc: string | null = null;
  let refresh_token_iv: string | null = null;

  if (!input.omitAccess && input.accessToken !== null) {
    const enc = await encryptJson({ token: input.accessToken ?? 'old-access' }, TEST_KEY_B64);
    access_token_enc = enc.ctB64;
    token_iv = enc.ivB64;
  }
  if (input.refreshToken) {
    const enc = await encryptJson({ token: input.refreshToken }, TEST_KEY_B64);
    refresh_token_enc = enc.ctB64;
    refresh_token_iv = enc.ivB64;
  }
  return {
    id: 'conn-1',
    provider: input.provider,
    token_expires_at: input.expiresAt,
    access_token_enc,
    token_iv,
    refresh_token_enc,
    refresh_token_iv,
  };
}

Deno.test('shouldRefresh: fresh token with plenty of runway → false', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const exp = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  assertEquals(shouldRefresh({ hasAccessToken: true, tokenExpiresAt: exp, now }), false);
});

Deno.test('shouldRefresh: token expiring within buffer → true', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const exp = new Date(now.getTime() + REFRESH_BUFFER_MS - 1_000).toISOString();
  assertEquals(shouldRefresh({ hasAccessToken: true, tokenExpiresAt: exp, now }), true);
});

Deno.test('shouldRefresh: missing access token → true even with valid expiry', () => {
  assertEquals(
    shouldRefresh({
      hasAccessToken: false,
      tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
    }),
    true,
  );
});

Deno.test('ensureFreshAccessToken: fresh Google token → returns as-is, no refresh call', async () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const conn = await buildConnection({
    provider: 'google',
    accessToken: 'live-token',
    refreshToken: 'r1',
    expiresAt: new Date(now.getTime() + 3600_000).toISOString(),
  });
  const state: FakeClientState = { updates: [], disconnected: false };
  const { fetch: fetchImpl, calls } = makeFetchQueue([]);
  const result = await ensureFreshAccessToken(
    makeFakeServiceClient(state) as any,
    conn,
    TEST_KEY_B64,
    cfg,
    { now, fetchImpl },
  );
  assertEquals(result.outcome, 'ok');
  if (result.outcome === 'ok') assertEquals(result.accessToken, 'live-token');
  assertEquals(calls.length, 0);
  assertEquals(state.updates.length, 0);
});

Deno.test('ensureFreshAccessToken: expired Google token with valid refresh → refresh + persist', async () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const conn = await buildConnection({
    provider: 'google',
    accessToken: 'old',
    refreshToken: 'good-refresh',
    expiresAt: new Date(now.getTime() - 60_000).toISOString(),
  });
  const state: FakeClientState = { updates: [], disconnected: false };
  const { fetch: fetchImpl, calls } = makeFetchQueue([
    () =>
      new Response(
        JSON.stringify({ access_token: 'fresh-access', expires_in: 3600 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
  ]);

  const result = await ensureFreshAccessToken(
    makeFakeServiceClient(state) as any,
    conn,
    TEST_KEY_B64,
    cfg,
    { now, fetchImpl },
  );
  assertEquals(result.outcome, 'refreshed');
  if (result.outcome === 'refreshed') assertEquals(result.accessToken, 'fresh-access');
  assertEquals(calls[0].url, 'https://oauth2.googleapis.com/token');
  // Persisted new access token + expiry, did not rotate refresh (Google omitted it)
  assertEquals(state.updates.length, 1);
  const updated = state.updates[0];
  assertEquals(typeof updated.access_token_enc, 'string');
  assertEquals(typeof updated.token_iv, 'string');
  assertEquals(typeof updated.token_expires_at, 'string');
  assertEquals('refresh_token_enc' in updated, false);
  assertEquals(state.disconnected, false);
});

Deno.test('ensureFreshAccessToken: rotated refresh token is persisted when provider returns one', async () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const conn = await buildConnection({
    provider: 'microsoft',
    accessToken: 'old',
    refreshToken: 'good-refresh',
    expiresAt: new Date(now.getTime() - 60_000).toISOString(),
  });
  const state: FakeClientState = { updates: [], disconnected: false };
  const { fetch: fetchImpl } = makeFetchQueue([
    () =>
      new Response(
        JSON.stringify({
          access_token: 'fresh-access',
          expires_in: 3600,
          refresh_token: 'rotated-refresh',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
  ]);
  const result = await ensureFreshAccessToken(
    makeFakeServiceClient(state) as any,
    conn,
    TEST_KEY_B64,
    cfg,
    { now, fetchImpl },
  );
  assertEquals(result.outcome, 'refreshed');
  const updated = state.updates[0];
  assertEquals(typeof updated.refresh_token_enc, 'string');
  assertEquals(typeof updated.refresh_token_iv, 'string');
  // Verify decryption round-trip preserves the rotated value.
  const round = (await decryptJson(
    updated.refresh_token_enc as string,
    updated.refresh_token_iv as string,
    TEST_KEY_B64,
  )) as { token: string };
  assertEquals(round.token, 'rotated-refresh');
});

Deno.test('ensureFreshAccessToken: Microsoft refresh happy path uses correct endpoint', async () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const conn = await buildConnection({
    provider: 'microsoft',
    accessToken: 'old',
    refreshToken: 'good-refresh',
    expiresAt: new Date(now.getTime() - 60_000).toISOString(),
  });
  const state: FakeClientState = { updates: [], disconnected: false };
  const { fetch: fetchImpl, calls } = makeFetchQueue([
    () =>
      new Response(
        JSON.stringify({ access_token: 'ms-access', expires_in: 3600 }),
        { status: 200 },
      ),
  ]);
  const result = await ensureFreshAccessToken(
    makeFakeServiceClient(state) as any,
    conn,
    TEST_KEY_B64,
    cfg,
    { now, fetchImpl },
  );
  assertEquals(result.outcome, 'refreshed');
  assertEquals(
    calls[0].url,
    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  );
});

Deno.test('ensureFreshAccessToken: provider rejects refresh (invalid_grant) → reconnect_required + is_active=false', async () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const conn = await buildConnection({
    provider: 'google',
    accessToken: 'old',
    refreshToken: 'bad-refresh',
    expiresAt: new Date(now.getTime() - 60_000).toISOString(),
  });
  const state: FakeClientState = { updates: [], disconnected: false };
  const { fetch: fetchImpl } = makeFetchQueue([
    () =>
      new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
  ]);
  const result = await ensureFreshAccessToken(
    makeFakeServiceClient(state) as any,
    conn,
    TEST_KEY_B64,
    cfg,
    { now, fetchImpl },
  );
  assertEquals(result.outcome, 'reconnect_required');
  if (result.outcome === 'reconnect_required') {
    assertEquals(result.reason, 'refresh_rejected');
  }
  assertEquals(state.disconnected, true);
});

Deno.test('ensureFreshAccessToken: provider 429 → transient error, connection stays active', async () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const conn = await buildConnection({
    provider: 'google',
    accessToken: 'old',
    refreshToken: 'good-refresh',
    expiresAt: new Date(now.getTime() - 60_000).toISOString(),
  });
  const state: FakeClientState = { updates: [], disconnected: false };
  const { fetch: fetchImpl } = makeFetchQueue([
    () =>
      new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429 }),
  ]);
  const result = await ensureFreshAccessToken(
    makeFakeServiceClient(state) as any,
    conn,
    TEST_KEY_B64,
    cfg,
    { now, fetchImpl },
  );
  assertEquals(result.outcome, 'refresh_transient_error');
  if (result.outcome === 'refresh_transient_error') {
    assertEquals(result.reason, 'provider_429');
    assertEquals(result.status, 429);
  }
  assertEquals(state.disconnected, false);
  assertEquals(state.updates.length, 0);
});

Deno.test('ensureFreshAccessToken: provider 503 → transient error, connection stays active', async () => {
  const now = new Date('2026-01-01T00:00:00Z');
  const conn = await buildConnection({
    provider: 'microsoft',
    accessToken: 'old',
    refreshToken: 'good-refresh',
    expiresAt: new Date(now.getTime() - 60_000).toISOString(),
  });
  const state: FakeClientState = { updates: [], disconnected: false };
  const { fetch: fetchImpl } = makeFetchQueue([
    () => new Response('temporarily unavailable', { status: 503 }),
  ]);
  const result = await ensureFreshAccessToken(
    makeFakeServiceClient(state) as any,
    conn,
    TEST_KEY_B64,
    cfg,
    { now, fetchImpl },
  );
  assertEquals(result.outcome, 'refresh_transient_error');
  if (result.outcome === 'refresh_transient_error') {
    assertEquals(result.reason, 'provider_5xx');
  }
  assertEquals(state.disconnected, false);
});

Deno.test('ensureFreshAccessToken: no refresh token stored → reconnect_required', async () => {
  const conn = await buildConnection({
    provider: 'google',
    accessToken: 'old',
    refreshToken: null,
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
  });
  const state: FakeClientState = { updates: [], disconnected: false };
  const result = await ensureFreshAccessToken(
    makeFakeServiceClient(state) as any,
    conn,
    TEST_KEY_B64,
    cfg,
    { fetchImpl: (() => { throw new Error('should not be called'); }) as FetchImpl },
  );
  assertEquals(result.outcome, 'reconnect_required');
  assertEquals(state.disconnected, true);
});

Deno.test('ensureFreshAccessToken: fetch throws (network blip) → transient error', async () => {
  const conn = await buildConnection({
    provider: 'google',
    accessToken: 'old',
    refreshToken: 'good-refresh',
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
  });
  const state: FakeClientState = { updates: [], disconnected: false };
  const fetchImpl: FetchImpl = () => {
    throw new Error('ECONNRESET');
  };
  const result = await ensureFreshAccessToken(
    makeFakeServiceClient(state) as any,
    conn,
    TEST_KEY_B64,
    cfg,
    { fetchImpl },
  );
  assertEquals(result.outcome, 'refresh_transient_error');
  if (result.outcome === 'refresh_transient_error') {
    assertEquals(result.reason, 'network_error');
  }
  assertEquals(state.disconnected, false);
});