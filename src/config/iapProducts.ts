/**
 * Apple In-App Purchase product configuration — SINGLE source of truth.
 *
 * Products are Auto-Renewable Subscriptions inside ONE subscription group
 * ("Mind Module Pro"): Pro Monthly + Pro Annual.
 *
 * Canonical IDs (App Store Connect, both CONFIRMED and unique):
 *   Monthly — com.mindmodule.pro.monthly   (ASC ref 6794852233)
 *   Annual  — com.mindmodule.pro.annual    (ASC ref 6794852439)
 *
 * Environment overrides (no code change needed):
 *   VITE_APPLE_PRO_MONTHLY_PRODUCT_ID
 *   VITE_APPLE_PRO_ANNUAL_PRODUCT_ID
 * (legacy VITE_IAP_PRODUCT_ID_MONTHLY / _ANNUAL are still honoured)
 *
 * Prices, currencies, localized names, billing periods and introductory offers
 * are NEVER declared here — they are read from StoreKit at runtime.
 */

const env = (import.meta.env ?? {}) as Record<string, string | undefined>;

export const APPLE_SUBSCRIPTION_GROUP = 'Mind Module Pro';

/** Confirmed in App Store Connect. */
export const DEFAULT_MONTHLY_PRODUCT_ID = 'com.mindmodule.pro.monthly';
/** Confirmed in App Store Connect. */
export const DEFAULT_ANNUAL_PRODUCT_ID = 'com.mindmodule.pro.annual';

export const IAP_PRODUCT_MONTHLY =
  env.VITE_APPLE_PRO_MONTHLY_PRODUCT_ID ??
  env.VITE_IAP_PRODUCT_ID_MONTHLY ??
  DEFAULT_MONTHLY_PRODUCT_ID;

export const IAP_PRODUCT_ANNUAL =
  env.VITE_APPLE_PRO_ANNUAL_PRODUCT_ID ??
  env.VITE_IAP_PRODUCT_ID_ANNUAL ??
  DEFAULT_ANNUAL_PRODUCT_ID;

/** Monthly first, annual second — the order the paywall renders. */
export const IAP_PRODUCT_IDS: string[] = [IAP_PRODUCT_MONTHLY, IAP_PRODUCT_ANNUAL];

export type IapPlan = 'monthly' | 'annual';

export function planForProductId(productId: string): IapPlan | null {
  if (productId === IAP_PRODUCT_MONTHLY) return 'monthly';
  if (productId === IAP_PRODUCT_ANNUAL) return 'annual';
  return null;
}

/** Stable sort key so the paywall always shows Monthly then Annual. */
export function planSortOrder(productId: string): number {
  const plan = planForProductId(productId);
  if (plan === 'monthly') return 0;
  if (plan === 'annual') return 1;
  return 2;
}

export interface IapConfigStatus {
  ok: boolean;
  /** Distinct, non-placeholder ids for both plans. */
  duplicateIds: boolean;
  missingIds: boolean;
  reason?: string;
}

export function getIapConfigStatus(): IapConfigStatus {
  const missingIds = IAP_PRODUCT_IDS.some(
    (id) => typeof id !== 'string' || id.length === 0 || id.startsWith('REPLACE_ME'),
  );
  const duplicateIds = IAP_PRODUCT_MONTHLY === IAP_PRODUCT_ANNUAL;
  const reason = missingIds
    ? 'An Apple product id is missing from this build.'
    : duplicateIds
      ? 'Monthly and annual are configured with the same Apple product id.'
      : undefined;
  return { ok: !missingIds && !duplicateIds, duplicateIds, missingIds, reason };
}

export function isIapConfigured(): boolean {
  return getIapConfigStatus().ok;
}
