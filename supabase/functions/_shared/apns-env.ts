/**
 * Batch A — APNs environment validation.
 *
 * Single source of truth for the "APP_ENV vs APNS_ENVIRONMENT" alignment
 * check. Used by both `smart-nudges` and `test-push` so a misconfigured
 * production deployment cannot silently fall back to the APNs sandbox
 * (which would 100% BadDeviceToken production APNs tokens).
 *
 * Rules:
 *   - If APP_ENV=production, APNS_ENVIRONMENT MUST equal "production".
 *   - APP_ENV not set / not production → APNS_ENVIRONMENT may be any
 *     value; we still surface it in the returned config for logging.
 *   - Callers must treat `{ ok: false }` as a hard-fail — do NOT send
 *     any push, do NOT insert notification_log rows (so caps are not
 *     consumed by phantom deliveries).
 */

export interface ApnsEnvValidation {
  ok: boolean;
  appEnv: string;
  apnsEnv: string;
  apnsHost: string;
  bundleId: string;
  reason?: string;
}

export function validateApnsEnvironment(): ApnsEnvValidation {
  const appEnv = (Deno.env.get('APP_ENV') ?? '').toLowerCase();
  const apnsEnv = (Deno.env.get('APNS_ENVIRONMENT') ?? 'development').toLowerCase();
  const bundleId = Deno.env.get('APNS_BUNDLE_ID') || 'com.moonshot.mindmoduleapp';
  const apnsHost = apnsEnv === 'production' ? 'api.push.apple.com' : 'api.sandbox.push.apple.com';

  if (appEnv === 'production' && apnsEnv !== 'production') {
    return {
      ok: false,
      appEnv,
      apnsEnv,
      apnsHost,
      bundleId,
      reason:
        `APNs environment mismatch: APP_ENV=production but APNS_ENVIRONMENT=${apnsEnv || '(unset)'}. ` +
        `Refusing to send — production APNs tokens will 100% fail against the sandbox host.`,
    };
  }

  return { ok: true, appEnv, apnsEnv, apnsHost, bundleId };
}