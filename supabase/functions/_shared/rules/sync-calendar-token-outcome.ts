/**
 * Pure mapper: translates an `ensureFreshAccessToken` outcome into the
 * response contract `sync-calendar` returns to callers.
 *
 * Kept as a pure function so both `sync-calendar/index.ts` and unit
 * tests can share exactly the same mapping. Persisted DB updates are
 * still performed inside `ensureFreshAccessToken` (reconnect flip) or
 * by `sync-calendar` itself (soft `sync_delayed` marker for transient
 * refresh failures).
 */

import type { EnsureFreshAccessTokenResult } from '../calendar-token-refresh.ts';

export type SyncTokenPhase =
  | { kind: 'ok'; accessToken: string }
  | {
      kind: 'reconnect';
      response: {
        success: false;
        reconnectRequired: true;
        reason: string;
        error: string;
      };
    }
  | {
      kind: 'transient';
      response: {
        success: false;
        rateLimited: true;
        syncStatus: 'sync_delayed';
        reason: string;
        error: string;
      };
      /** Persisted so `last_error_reason` matches the response reason. */
      dbReason: string;
      dbMessage: string;
    };

export function mapEnsureFreshOutcomeToSyncPhase(
  outcome: EnsureFreshAccessTokenResult,
): SyncTokenPhase {
  const o = outcome.outcome;
  if (o === 'ok' || o === 'refreshed') {
    return { kind: 'ok', accessToken: (outcome as { accessToken: string }).accessToken };
  }
  if (o === 'reconnect_required') {
    const rc = outcome as {
      outcome: 'reconnect_required';
      reason:
        | 'no_access_token_and_no_refresh_token'
        | 'refresh_decrypt_failed'
        | 'refresh_rejected';
    };
    // Preserve the pre-refactor reason vocabulary so existing clients
    // (which switch on `no_refresh_token` / `refresh_failed`) keep
    // working after the shared-helper refactor.
    let reason = 'refresh_failed';
    if (rc.reason === 'no_access_token_and_no_refresh_token') {
      reason = 'no_refresh_token';
    } else if (rc.reason === 'refresh_decrypt_failed') {
      reason = 'refresh_decrypt_failed';
    }
    return {
      kind: 'reconnect',
      response: {
        success: false,
        reconnectRequired: true,
        reason,
        error: 'Calendar session expired. Please reconnect your calendar.',
      },
    };
  }
  // transient
  const tr = outcome as {
    outcome: 'refresh_transient_error';
    reason: string;
    providerError?: string;
  };
  const dbReason = `token_refresh_${tr.reason}`;
  const dbMessage = tr.providerError
    ? `Token refresh transient failure: ${tr.providerError}`
    : `Token refresh transient failure (${tr.reason})`;
  return {
    kind: 'transient',
    response: {
      success: false,
      rateLimited: true,
      syncStatus: 'sync_delayed',
      reason: dbReason,
      error: 'Calendar provider is throttling token refresh — will retry shortly.',
    },
    dbReason,
    dbMessage,
  };
}