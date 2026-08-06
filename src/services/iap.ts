/**
 * Apple In-App Purchase bridge (web-side).
 *
 * Talks to the native `InAppPurchase` Capacitor plugin (StoreKit 2, see
 * ios/App/App/InAppPurchasePlugin.swift). Every purchase / restore result is
 * sent to the `verify-apple-purchase` edge function, which verifies the signed
 * JWS transaction with Apple and writes the entitlement. The client NEVER
 * grants Pro access on its own.
 */
import { registerPlugin } from '@capacitor/core';
import { isIosNativeShell } from '@/config/purchasePlatform';
import { IAP_PRODUCT_IDS, getIapConfigStatus } from '@/config/iapProducts';
import { getAuthHeaders } from '@/services/authTokenService';

export interface IapIntroOffer {
  displayPrice: string;
  paymentMode: string;
  periodUnit: string;
  periodValue: number;
  periodCount: number;
}

export interface IapProduct {
  id: string;
  title: string;
  description: string;
  displayPrice: string;
  price: number;
  currencyCode?: string;
  periodUnit?: string;
  periodValue?: number;
  /**
   * StoreKit's per-Apple-ID introductory-offer eligibility for this
   * subscription group. Undefined on older native builds; `introOffer` is only
   * populated by the plugin when the user is actually eligible.
   */
  isEligibleForIntroOffer?: boolean;
  introOffer?: IapIntroOffer;
}

export type IapPurchaseStatus = 'purchased' | 'cancelled' | 'pending' | 'failed';

export interface IapPurchaseResult {
  status: IapPurchaseStatus;
  productId?: string;
  transactionId?: string;
  originalTransactionId?: string;
  signedTransaction?: string;
  message?: string;
}

export interface IapEntitlement {
  productId: string;
  transactionId: string;
  originalTransactionId: string;
  signedTransaction: string;
}

interface InAppPurchasePlugin {
  isAvailable(): Promise<{ available: boolean }>;
  getProducts(options: { productIds: string[] }): Promise<{
    products: IapProduct[];
    /** Diagnostics from newer native builds; absent on older shells. */
    requestedProductIds?: string[];
    missingProductIds?: string[];
    storefront?: string | null;
    locale?: string | null;
  }>;
  purchase(options: { productId: string; appAccountToken: string }): Promise<IapPurchaseResult>;
  restorePurchases(): Promise<{ entitlements: IapEntitlement[] }>;
  getCurrentEntitlements(): Promise<{ entitlements: IapEntitlement[] }>;
  openManageSubscriptions(): Promise<{ opened: boolean; message?: string }>;
  addListener(
    event: 'transactionUpdated',
    cb: (data: { productId: string; transactionId: string; originalTransactionId: string }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

const InAppPurchase = registerPlugin<InAppPurchasePlugin>('InAppPurchase');

const APP_ACCOUNT_TOKEN_KEY = 'iap.appAccountToken.v1';

/**
 * Stable per-install UUID attached to every StoreKit purchase. Apple echoes it
 * back in App Store Server Notifications, letting the backend correlate an
 * anonymous Apple transaction with the Auth0 user who started it.
 */
export function getAppAccountToken(): string {
  try {
    const existing = localStorage.getItem(APP_ACCOUNT_TOKEN_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(APP_ACCOUNT_TOKEN_KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

export async function isIapAvailable(): Promise<boolean> {
  if (!isIosNativeShell()) return false;
  try {
    const { available } = await InAppPurchase.isAvailable();
    return available === true;
  } catch {
    return false;
  }
}

export async function loadIapProducts(): Promise<IapProduct[]> {
  if (!isIosNativeShell()) return [];
  const { products } = await InAppPurchase.getProducts({ productIds: IAP_PRODUCT_IDS });
  return products ?? [];
}

/**
 * Product-load outcomes, deliberately distinct so an operator can tell an App
 * Store Connect / runtime problem apart from a code problem.
 */
export type IapLoadOutcome =
  | 'not_native'        // not running inside the iOS shell
  | 'config_invalid'    // product ids missing / duplicated in this build
  | 'store_unavailable' // StoreKit says purchases are disabled on this device
  | 'empty'             // StoreKit returned ZERO of the requested products
  | 'partial'           // StoreKit returned SOME of the requested products
  | 'complete'          // StoreKit returned all requested products
  | 'fetch_error';      // the bridge / native fetch threw

export interface IapLoadDiagnostics {
  outcome: IapLoadOutcome;
  /** Product ids this build asked StoreKit for. */
  requestedIds: string[];
  /** Product ids StoreKit actually returned. */
  returnedIds: string[];
  /** requestedIds minus returnedIds — the App Store Connect smoking gun. */
  missingIds: string[];
  returnedCount: number;
  configOk: boolean;
  configReason?: string;
  storeAvailable: boolean;
  /** Per-product intro-offer eligibility flags (no user identity). */
  introEligibility: Record<string, boolean | null>;
  storefront?: string | null;
  locale?: string | null;
  errorMessage?: string;
  errorCode?: string;
}

export interface IapLoadResult {
  products: IapProduct[];
  diagnostics: IapLoadDiagnostics;
}

function baseDiagnostics(partial: Partial<IapLoadDiagnostics>): IapLoadDiagnostics {
  return {
    outcome: 'empty',
    requestedIds: [...IAP_PRODUCT_IDS],
    returnedIds: [],
    missingIds: [...IAP_PRODUCT_IDS],
    returnedCount: 0,
    configOk: true,
    storeAvailable: false,
    introEligibility: {},
    ...partial,
  };
}

/**
 * Diagnostics-only wrapper around the StoreKit product fetch.
 *
 * Logs product IDs, counts and native error codes — never receipts, signed
 * transactions, appAccountToken values or any Apple account identity.
 */
export async function loadIapProductsWithDiagnostics(): Promise<IapLoadResult> {
  const requestedIds = [...IAP_PRODUCT_IDS];

  const emit = (result: IapLoadResult): IapLoadResult => {
    const d = result.diagnostics;
    const line = `[iap] product-load outcome=${d.outcome} requested=${d.requestedIds.join(',') || 'none'} returned=${d.returnedIds.join(',') || 'none'} missing=${d.missingIds.join(',') || 'none'} count=${d.returnedCount} configOk=${d.configOk} storeAvailable=${d.storeAvailable} storefront=${d.storefront ?? 'unknown'} locale=${d.locale ?? 'unknown'} intro=${JSON.stringify(d.introEligibility)}${d.errorCode ? ` errorCode=${d.errorCode}` : ''}${d.errorMessage ? ` error=${d.errorMessage}` : ''}`;
    if (d.outcome === 'complete') console.info(line);
    else if (d.outcome === 'not_native') console.debug(line);
    else console.warn(line);
    return result;
  };

  if (!isIosNativeShell()) {
    return emit({ products: [], diagnostics: baseDiagnostics({ outcome: 'not_native', requestedIds }) });
  }

  const config = getIapConfigStatus();
  if (!config.ok) {
    return emit({
      products: [],
      diagnostics: baseDiagnostics({
        outcome: 'config_invalid',
        requestedIds,
        configOk: false,
        configReason: config.reason,
      }),
    });
  }

  const storeAvailable = await isIapAvailable();
  if (!storeAvailable) {
    return emit({
      products: [],
      diagnostics: baseDiagnostics({ outcome: 'store_unavailable', requestedIds }),
    });
  }

  try {
    const res = await InAppPurchase.getProducts({ productIds: requestedIds });
    const products = res?.products ?? [];
    const returnedIds = products.map((p) => p.id);
    const missingIds = requestedIds.filter((id) => !returnedIds.includes(id));
    const introEligibility: Record<string, boolean | null> = {};
    for (const p of products) {
      introEligibility[p.id] = p.isEligibleForIntroOffer ?? null;
    }
    const outcome: IapLoadOutcome =
      products.length === 0 ? 'empty' : missingIds.length === 0 ? 'complete' : 'partial';
    return emit({
      products,
      diagnostics: baseDiagnostics({
        outcome,
        requestedIds,
        returnedIds,
        missingIds,
        returnedCount: products.length,
        storeAvailable: true,
        introEligibility,
        storefront: res?.storefront ?? null,
        locale: res?.locale ?? null,
      }),
    });
  } catch (err) {
    const e = err as { message?: string; code?: string | number };
    return emit({
      products: [],
      diagnostics: baseDiagnostics({
        outcome: 'fetch_error',
        requestedIds,
        storeAvailable: true,
        errorMessage: e?.message ?? 'Unknown native error',
        errorCode: e?.code != null ? String(e.code) : undefined,
      }),
    });
  }
}

/** One-line, non-sensitive operator hint derived from diagnostics. */
export function describeIapLoadDiagnostics(d: IapLoadDiagnostics): string {
  const parts = [
    `outcome=${d.outcome}`,
    `requested=${d.requestedIds.join(', ') || 'none'}`,
    `missing=${d.missingIds.join(', ') || 'none'}`,
  ];
  if (d.storefront) parts.push(`storefront=${d.storefront}`);
  if (d.errorCode) parts.push(`code=${d.errorCode}`);
  return parts.join(' · ');
}

/**
 * Whether the outcome points at App Store Connect / runtime state rather than
 * at this build's code. `empty` and `partial` mean StoreKit accepted the
 * request and simply does not know those ids in this storefront.
 */
export function looksLikeAppStoreConnectIssue(d: IapLoadDiagnostics): boolean {
  return (d.outcome === 'empty' || d.outcome === 'partial') && d.configOk && d.storeAvailable;
}

function functionUrl(name: string): string {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  return `https://${projectId}.supabase.co/functions/v1/${name}`;
}

/**
 * Server-side verification. Idempotent — safe to call repeatedly with the same
 * signed transaction (restore, resume, relaunch).
 */
export async function verifyAppleTransactions(
  signedTransactions: string[],
  source: 'purchase' | 'restore' | 'refresh',
): Promise<{ ok: boolean; entitled: boolean; error?: string }> {
  const payload = signedTransactions.filter(Boolean);
  if (payload.length === 0) return { ok: true, entitled: false };
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(functionUrl('verify-apple-purchase'), {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signedTransactions: payload,
        appAccountToken: getAppAccountToken(),
        source,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, entitled: false, error: data?.error || `HTTP ${res.status}` };
    return { ok: true, entitled: data?.entitled === true };
  } catch (err) {
    return { ok: false, entitled: false, error: (err as Error)?.message };
  }
}

export async function purchaseIapProduct(productId: string): Promise<IapPurchaseResult> {
  if (!isIosNativeShell()) {
    return { status: 'failed', message: 'In-app purchase is only available in the iOS app.' };
  }
  const result = await InAppPurchase.purchase({
    productId,
    appAccountToken: getAppAccountToken(),
  });
  if (result.status === 'purchased' && result.signedTransaction) {
    const verified = await verifyAppleTransactions([result.signedTransaction], 'purchase');
    if (!verified.ok) {
      console.error('[iap] Edge function verify-apple-purchase failed:', verified.error);
      return {
        status: 'failed',
        message: `Purchase completed with Apple, but backend DB update failed: ${verified.error || 'Server error'}. Please tap Restore Purchases.`,
      };
    }
  }
  return result;
}

export async function restoreIapPurchases(): Promise<{ restored: number; entitled: boolean }> {
  if (!isIosNativeShell()) return { restored: 0, entitled: false };
  const { entitlements } = await InAppPurchase.restorePurchases();
  const signed = (entitlements ?? []).map((e) => e.signedTransaction).filter(Boolean);
  const verified = await verifyAppleTransactions(signed, 'restore');
  return { restored: signed.length, entitled: verified.entitled };
}

/**
 * Re-verify current StoreKit entitlements. Called on app launch and on resume
 * so renewals, expirations, refunds and revocations converge quickly.
 */
export async function refreshIapEntitlements(): Promise<{ entitled: boolean }> {
  if (!isIosNativeShell()) return { entitled: false };
  try {
    const { entitlements } = await InAppPurchase.getCurrentEntitlements();
    const signed = (entitlements ?? []).map((e) => e.signedTransaction).filter(Boolean);
    if (signed.length === 0) return { entitled: false };
    const verified = await verifyAppleTransactions(signed, 'refresh');
    return { entitled: verified.entitled };
  } catch {
    return { entitled: false };
  }
}

/** Opens Apple's own subscription management sheet (never Stripe). */
export async function openAppleManageSubscriptions(): Promise<boolean> {
  if (!isIosNativeShell()) return false;
  try {
    const { opened } = await InAppPurchase.openManageSubscriptions();
    return opened === true;
  } catch {
    return false;
  }
}

/** Listen for out-of-band StoreKit transactions (renewal, Ask to Buy, retry). */
export async function onIapTransactionUpdate(
  cb: () => void,
): Promise<() => void> {
  if (!isIosNativeShell()) return () => {};
  try {
    const handle = await InAppPurchase.addListener('transactionUpdated', () => {
      void refreshIapEntitlements().finally(cb);
    });
    return () => { void handle.remove(); };
  } catch {
    return () => {};
  }
}