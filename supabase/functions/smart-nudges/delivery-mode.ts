// Delivery-mode resolver for Smart Nudges.
//
// Precedence (highest → lowest):
//   1. missing_apns_credentials — APNS_P8_KEY / APNS_KEY_ID / APNS_TEAM_ID absent
//   2. explicit_force_dry       — caller passed ?force_dry=1|true|yes
//   3. admin_auth_failure       — force_user diagnostic without valid admin JWT
//   4. production_delivery      — default; real APNs send
//
// A no-parameter scheduled call (pg_cron) with valid APNs credentials
// resolves to `production_delivery`. Dry-run is now an EXPLICIT diagnostic
// mode, never the implicit default.

export type DeliveryReason =
  | 'missing_apns_credentials'
  | 'explicit_force_dry'
  | 'admin_auth_failure'
  | 'production_delivery';

export interface DeliveryModeInput {
  /** Raw request URL — used to read `force_dry` search param. */
  url: URL;
  /** True iff APNS_P8_KEY && APNS_KEY_ID && APNS_TEAM_ID are all present. */
  apnsCredsPresent: boolean;
  /**
   * Set to true only when a `force_user` diagnostic call was attempted and
   * the admin guard rejected it. When the guard rejects the request we
   * normally short-circuit with a 401, but this branch remains as a
   * defense-in-depth signal for the resolver so any future refactor that
   * lets execution continue still degrades to dry-run.
   */
  adminAuthFailed?: boolean;
}

export interface DeliveryMode {
  dryRun: boolean;
  reason: DeliveryReason;
}

const TRUTHY_DRY = new Set(['1', 'true', 'yes']);

export function isExplicitForceDry(url: URL): boolean {
  const raw = url.searchParams.get('force_dry');
  if (!raw) return false;
  return TRUTHY_DRY.has(raw.trim().toLowerCase());
}

export function resolveDeliveryMode(input: DeliveryModeInput): DeliveryMode {
  if (!input.apnsCredsPresent) {
    return { dryRun: true, reason: 'missing_apns_credentials' };
  }
  if (isExplicitForceDry(input.url)) {
    return { dryRun: true, reason: 'explicit_force_dry' };
  }
  if (input.adminAuthFailed) {
    return { dryRun: true, reason: 'admin_auth_failure' };
  }
  return { dryRun: false, reason: 'production_delivery' };
}

export function describeDeliveryMode(mode: DeliveryMode): string {
  return mode.dryRun ? 'Dry Run' : 'Production Delivery';
}