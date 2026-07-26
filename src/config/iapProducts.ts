/**
 * Apple In-App Purchase product identifiers.
 *
 * These are CONFIGURATION, not constants — the real identifiers are created in
 * App Store Connect by the account owner and injected at build time. The
 * placeholders below are intentionally obviously-fake so a misconfigured build
 * fails loudly in App Store Connect rather than silently charging the wrong
 * product. See IAP_CONFIGURATION_REQUIRED.md.
 */

export const IAP_PRODUCT_MONTHLY =
  import.meta.env.VITE_IAP_PRODUCT_ID_MONTHLY ?? 'REPLACE_ME.pro.monthly';

export const IAP_PRODUCT_ANNUAL =
  import.meta.env.VITE_IAP_PRODUCT_ID_ANNUAL ?? 'REPLACE_ME.pro.annual';

export const IAP_PRODUCT_IDS: string[] = [IAP_PRODUCT_MONTHLY, IAP_PRODUCT_ANNUAL];

export function isIapConfigured(): boolean {
  return IAP_PRODUCT_IDS.every((id) => !id.startsWith('REPLACE_ME'));
}

export function planForProductId(productId: string): 'monthly' | 'annual' | null {
  if (productId === IAP_PRODUCT_MONTHLY) return 'monthly';
  if (productId === IAP_PRODUCT_ANNUAL) return 'annual';
  return null;
}