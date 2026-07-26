/**
 * Apple In-App Purchase product identifiers.
 *
 * The defaults below are the canonical IDs that MUST be created in App Store
 * Connect, namespaced under the real iOS bundle identifier
 * (`com.moonshot.mindmoduleapp`, see capacitor.config.ts). They are real
 * defaults rather than `REPLACE_ME` placeholders on purpose: a shipped binary
 * whose product IDs do not exist in App Store Connect shows an empty paywall
 * to the App Review team, which is itself a rejection. Creating these exact
 * two IDs in App Store Connect is the remaining manual step.
 *
 * `VITE_IAP_PRODUCT_ID_*` can override them if the IDs differ in App Store
 * Connect — but the IDs here and in App Store Connect must match exactly, or
 * StoreKit returns no products.
 */

export const IAP_PRODUCT_MONTHLY =
  import.meta.env.VITE_IAP_PRODUCT_ID_MONTHLY ?? 'com.moonshot.mindmoduleapp.pro.monthly';

export const IAP_PRODUCT_ANNUAL =
  import.meta.env.VITE_IAP_PRODUCT_ID_ANNUAL ?? 'com.moonshot.mindmoduleapp.pro.annual';

export const IAP_PRODUCT_IDS: string[] = [IAP_PRODUCT_MONTHLY, IAP_PRODUCT_ANNUAL];

export function isIapConfigured(): boolean {
  return IAP_PRODUCT_IDS.every(
    (id) => typeof id === 'string' && id.length > 0 && !id.startsWith('REPLACE_ME'),
  );
}

export function planForProductId(productId: string): 'monthly' | 'annual' | null {
  if (productId === IAP_PRODUCT_MONTHLY) return 'monthly';
  if (productId === IAP_PRODUCT_ANNUAL) return 'annual';
  return null;
}