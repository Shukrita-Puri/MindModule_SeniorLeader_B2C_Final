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
import { IAP_PRODUCT_IDS } from '@/config/iapProducts';
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
  getProducts(options: { productIds: string[] }): Promise<{ products: IapProduct[] }>;
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
    await verifyAppleTransactions([result.signedTransaction], 'purchase');
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