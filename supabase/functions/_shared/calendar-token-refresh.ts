/**
 * Shared OAuth access-token lifecycle helper for calendar connections.
 *
 * Historically both `sync-calendar` and `register-calendar-watch`
 * needed to:
 *   1. Decrypt the stored access token.
 *   2. If missing / near expiry / expired, decrypt the refresh token
 *      and exchange it with Google or Microsoft.
 *   3. Persist the new access token (and any rotated refresh token)
 *      back to `calendar_connections`.
 *
 * `sync-calendar` had inline code for this. `register-calendar-watch`
 * had *no* refresh path at all — once the stored access token expired,
 * every webhook registration/renewal request to Google or Microsoft
 * failed with 401, `webhook_last_error*` filled up, and the webhook
 * silently died even though the user's refresh token was still valid.
 *
 * This module extracts the refresh logic behind
 * `ensureFreshAccessToken` so both call sites can share it. The
 * provider HTTP endpoints are kept injectable so tests can run
 * against a fake `fetch` without hitting Google or Microsoft.
 *
 * IMPORTANT lifecycle contract for callers:
 *   - `outcome: 'refreshed' | 'ok'` → use `.accessToken`, keep going.
 *   - `outcome: 'reconnect_required'` → the provider REJECTED the
 *     refresh token itself (invalid_grant / no refresh token stored /
 *     decrypt failure). The connection has been marked `is_active=false`
 *     and the caller should surface a reconnect prompt.
 *   - `outcome: 'refresh_transient_error'` → the exchange failed for
 *     transient reasons (network, 5xx, rate limit). The connection is
 *     LEFT ACTIVE so the next scheduled run can retry. Callers should
 *     record the failure (e.g. `webhook_last_error`) but must NOT flip
 *     `is_active`.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ========== AES-256-GCM helpers ==========
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
export async function encryptJson(
  payload: unknown,
  keyB64: string,
): Promise<{ ivB64: string; ctB64: string }> {
  const keyBytes = b64ToBytes(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    'AES-GCM',
    false,
    ['encrypt'],
  );
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(JSON.stringify(payload)),
    ),
  );
  return { ivB64: bytesToB64(iv), ctB64: bytesToB64(ct) };
}
export async function decryptJson(
  ctB64: string,
  ivB64: string,
  keyB64: string,
): Promise<unknown> {
  const keyBytes = b64ToBytes(keyB64);
  const iv = b64ToBytes(ivB64);
  const ct = b64ToBytes(ctB64);
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    'AES-GCM',
    false,
    ['decrypt'],
  );
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    ct.buffer as ArrayBuffer,
  );
  return JSON.parse(new TextDecoder().decode(new Uint8Array(pt)));
}

// ========== Refresh contract ==========

/** Refresh 5 minutes before expiry to avoid mid-request 401s. */
export const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export type CalendarProvider = 'google' | 'microsoft';

export interface CalendarConnectionTokenRow {
  id: string;
  provider: CalendarProvider | string;
  token_expires_at: string | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  token_iv: string | null;
  refresh_token_iv: string | null;
}

export interface OAuthClientConfig {
  googleClientId: string;
  googleClientSecret: string;
  microsoftClientId: string;
  microsoftClientSecret: string;
  microsoftScope?: string;
}

export type FetchImpl = typeof fetch;

export interface EnsureFreshAccessTokenOk {
  outcome: 'ok' | 'refreshed';
  accessToken: string;
}

export interface EnsureFreshAccessTokenReconnect {
  outcome: 'reconnect_required';
  reason:
    | 'no_access_token_and_no_refresh_token'
    | 'refresh_decrypt_failed'
    | 'refresh_rejected';
  providerError?: string;
}

export interface EnsureFreshAccessTokenTransient {
  outcome: 'refresh_transient_error';
  reason: 'network_error' | 'provider_5xx' | 'provider_429' | 'unknown';
  status?: number;
  providerError?: string;
}

export type EnsureFreshAccessTokenResult =
  | EnsureFreshAccessTokenOk
  | EnsureFreshAccessTokenReconnect
  | EnsureFreshAccessTokenTransient;

function classifyRefreshHttpStatus(
  status: number,
): 'transient' | 'permanent' {
  if (status === 429) return 'transient';
  if (status >= 500) return 'transient';
  return 'permanent';
}

async function refreshGoogleToken(
  refreshToken: string,
  cfg: OAuthClientConfig,
  fetchImpl: FetchImpl,
): Promise<
  | { kind: 'ok'; accessToken: string; expiresIn: number; refreshToken?: string }
  | { kind: 'transient'; status?: number; providerError?: string; reason: EnsureFreshAccessTokenTransient['reason'] }
  | { kind: 'permanent'; status?: number; providerError?: string }
> {
  let res: Response;
  try {
    res = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.googleClientId,
        client_secret: cfg.googleClientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
  } catch (err) {
    return {
      kind: 'transient',
      reason: 'network_error',
      providerError: err instanceof Error ? err.message : String(err),
    };
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // fall through
  }

  if (!res.ok || (data && data.error)) {
    const providerError = data?.error ?? `http_${res.status}`;
    const bucket = classifyRefreshHttpStatus(res.status);
    if (bucket === 'transient') {
      return {
        kind: 'transient',
        status: res.status,
        providerError,
        reason: res.status === 429 ? 'provider_429' : 'provider_5xx',
      };
    }
    return { kind: 'permanent', status: res.status, providerError };
  }

  return {
    kind: 'ok',
    accessToken: data.access_token,
    expiresIn: Number(data.expires_in ?? 3600),
    refreshToken: data.refresh_token,
  };
}

async function refreshMicrosoftToken(
  refreshToken: string,
  cfg: OAuthClientConfig,
  fetchImpl: FetchImpl,
): Promise<
  | { kind: 'ok'; accessToken: string; expiresIn: number; refreshToken?: string }
  | { kind: 'transient'; status?: number; providerError?: string; reason: EnsureFreshAccessTokenTransient['reason'] }
  | { kind: 'permanent'; status?: number; providerError?: string }
> {
  let res: Response;
  try {
    res = await fetchImpl(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: cfg.microsoftClientId,
          client_secret: cfg.microsoftClientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
          scope:
            cfg.microsoftScope ??
            'offline_access openid profile email Calendars.Read',
        }),
      },
    );
  } catch (err) {
    return {
      kind: 'transient',
      reason: 'network_error',
      providerError: err instanceof Error ? err.message : String(err),
    };
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // fall through
  }

  if (!res.ok || (data && data.error)) {
    const providerError = data?.error ?? `http_${res.status}`;
    const bucket = classifyRefreshHttpStatus(res.status);
    if (bucket === 'transient') {
      return {
        kind: 'transient',
        status: res.status,
        providerError,
        reason: res.status === 429 ? 'provider_429' : 'provider_5xx',
      };
    }
    return { kind: 'permanent', status: res.status, providerError };
  }

  return {
    kind: 'ok',
    accessToken: data.access_token,
    expiresIn: Number(data.expires_in ?? 3600),
    refreshToken: data.refresh_token,
  };
}

/**
 * Decide whether the stored access token is still safe to use.
 * Exposed for testing.
 */
export function shouldRefresh(input: {
  hasAccessToken: boolean;
  tokenExpiresAt: string | null;
  now?: Date;
  bufferMs?: number;
}): boolean {
  if (!input.hasAccessToken) return true;
  if (!input.tokenExpiresAt) return false;
  const now = (input.now ?? new Date()).getTime();
  const exp = new Date(input.tokenExpiresAt).getTime();
  const buf = input.bufferMs ?? REFRESH_BUFFER_MS;
  return now >= exp - buf;
}

/**
 * Ensure the given calendar connection has a usable access token.
 * Refreshes via Google/Microsoft OAuth when needed and persists the
 * new credentials.
 *
 * Returns a discriminated union so the caller can decide whether to
 *   - continue with the returned access token,
 *   - surface a "reconnect required" error (permanent),
 *   - record a transient error and try again later (webhook stays
 *     registered / connection stays active).
 */
export async function ensureFreshAccessToken(
  serviceClient: SupabaseClient<any, any, any>,
  connection: CalendarConnectionTokenRow,
  encKeyB64: string,
  cfg: OAuthClientConfig,
  opts: { now?: Date; fetchImpl?: FetchImpl } = {},
): Promise<EnsureFreshAccessTokenResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? new Date();

  // 1. Try to decrypt the stored access token.
  let accessToken: string | null = null;
  if (connection.access_token_enc && connection.token_iv) {
    try {
      const dec = (await decryptJson(
        connection.access_token_enc,
        connection.token_iv,
        encKeyB64,
      )) as { token: string };
      accessToken = dec.token ?? null;
    } catch {
      accessToken = null;
    }
  }

  const needsRefresh = shouldRefresh({
    hasAccessToken: !!accessToken,
    tokenExpiresAt: connection.token_expires_at,
    now,
  });

  if (!needsRefresh && accessToken) {
    return { outcome: 'ok', accessToken };
  }

  // 2. Decrypt the refresh token.
  const refreshIv = connection.refresh_token_iv || connection.token_iv;
  if (!connection.refresh_token_enc || !refreshIv) {
    await serviceClient
      .from('calendar_connections')
      .update({ is_active: false })
      .eq('id', connection.id);
    return {
      outcome: 'reconnect_required',
      reason: 'no_access_token_and_no_refresh_token',
    };
  }

  let refreshToken: string | null = null;
  try {
    const dec = (await decryptJson(
      connection.refresh_token_enc,
      refreshIv,
      encKeyB64,
    )) as { token: string | null };
    refreshToken = dec.token ?? null;
  } catch {
    await serviceClient
      .from('calendar_connections')
      .update({ is_active: false })
      .eq('id', connection.id);
    return {
      outcome: 'reconnect_required',
      reason: 'refresh_decrypt_failed',
    };
  }

  if (!refreshToken) {
    await serviceClient
      .from('calendar_connections')
      .update({ is_active: false })
      .eq('id', connection.id);
    return {
      outcome: 'reconnect_required',
      reason: 'no_access_token_and_no_refresh_token',
    };
  }

  // 3. Call provider.
  const refreshResult =
    connection.provider === 'google'
      ? await refreshGoogleToken(refreshToken, cfg, fetchImpl)
      : connection.provider === 'microsoft'
        ? await refreshMicrosoftToken(refreshToken, cfg, fetchImpl)
        : { kind: 'permanent' as const, providerError: 'unsupported_provider' };

  if (refreshResult.kind === 'transient') {
    // Do NOT flip is_active — allow the next scheduled run to retry.
    return {
      outcome: 'refresh_transient_error',
      reason: refreshResult.reason,
      status: refreshResult.status,
      providerError: refreshResult.providerError,
    };
  }

  if (refreshResult.kind === 'permanent') {
    await serviceClient
      .from('calendar_connections')
      .update({ is_active: false })
      .eq('id', connection.id);
    return {
      outcome: 'reconnect_required',
      reason: 'refresh_rejected',
      providerError: refreshResult.providerError,
    };
  }

  // 4. Persist new access token (and rotated refresh token if any).
  const newAccessToken = refreshResult.accessToken;
  const newExpiresAt = new Date(now.getTime() + refreshResult.expiresIn * 1000).toISOString();
  const { ivB64: newAccessIv, ctB64: newAccessEnc } = await encryptJson(
    { token: newAccessToken },
    encKeyB64,
  );

  const updatePayload: Record<string, unknown> = {
    access_token_enc: newAccessEnc,
    token_iv: newAccessIv,
    token_expires_at: newExpiresAt,
  };

  if (refreshResult.refreshToken) {
    const { ivB64: newRefreshIv, ctB64: newRefreshEnc } = await encryptJson(
      { token: refreshResult.refreshToken },
      encKeyB64,
    );
    updatePayload.refresh_token_enc = newRefreshEnc;
    updatePayload.refresh_token_iv = newRefreshIv;
  }

  await serviceClient
    .from('calendar_connections')
    .update(updatePayload)
    .eq('id', connection.id);

  return { outcome: 'refreshed', accessToken: newAccessToken };
}
