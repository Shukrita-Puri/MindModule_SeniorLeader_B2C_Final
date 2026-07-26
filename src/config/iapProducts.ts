/**
 * Apple In-App Purchase product configuration — SINGLE source of truth.
 *
 * Products MUST be Auto-Renewable Subscriptions inside ONE subscription group
 * ("Mind Module Pro"): Pro Monthly + Pro Annual.
 *
 * Canonical IDs (App Store Connect):
 *   Annual  — com.mindmodule.pro.annual        (CONFIRMED, ASC ref 6794852439)
 *   Monthly — com.mindmodule.pro.monthly       (⚠️ PENDING CONFIRMATION, ASC ref 6794852233)
 *
 * ⚠️ BLOCKER: App Store Connect currently reports the SAME product id
 * (com.mindmodule.pro.annual) for both the monthly and the annual product.
 * Apple product ids are globally unique, so one of them is wrong. We do NOT
 * reuse the annual id for monthly — that would either fail to load or sell the
 * wrong plan. Until the monthly id is confirmed in App Store Connect, the
 * value below is a *declared expectation* flagged by
 * `MONTHLY_PRODUCT_ID_NEEDS_CONFIRMATION`.
 *
 * Environment overrides (no rebuild of the contract needed):
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
export const DEFAULT_ANNUAL_PRODUCT_ID = 'com.mindmodule.pro.annual';
/** Expected, awaiting App Store Connect confirmation. */
export const DEFAULT_MONTHLY_PRODUCT_ID = 'com.mindmodule.pro.monthly';

export const IAP_PRODUCT_MONTHLY =
  env.VITE_APPLE_PRO_MONTHLY_PRODUCT_ID ??
  env.VITE_IAP_PRODUCT_ID_MONTHLY ??
  DEFAULT_MONTHLY_PRODUCT_ID;

export const IAP_PRODUCT_ANNUAL =
  env.VITE_APPLE_PRO_ANNUAL_PRODUCT_ID ??
  env.VITE_IAP_PRODUCT_ID_ANNUAL ??
  DEFAULT_ANNUAL_PRODUCT_ID;

/** True while the monthly id is still the unconfirmed default. */
export const MONTHLY_PRODUCT_ID_NEEDS_CONFIRMATION =
  !env.VITE_APPLE_PRO_MONTHLY_PRODUCT_ID && !env.VITE_IAP_PRODUCT_ID_MONTHLY;

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
  monthlyNeedsConfirmation: boolean;
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
  return {
    ok: !missingIds && !duplicateIds,
    duplicateIds,
    missingIds,
    monthlyNeedsConfirmation: MONTHLY_PRODUCT_ID_NEEDS_CONFIRMATION,
    reason,
  };
}

export function isIapConfigured(): boolean {
  return getIapConfigStatus().ok;
}
