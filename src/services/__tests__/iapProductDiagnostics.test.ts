/**
 * Diagnostics-only coverage for the Apple product-load path.
 * Asserts outcome classification, missing-id detection and the absence of
 * sensitive data in anything we log or surface.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const isIosNativeShell = vi.fn(() => true);
const getProducts = vi.fn();
const isAvailable = vi.fn(async () => ({ available: true }));

vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({
    isAvailable: (...a: unknown[]) => isAvailable(...(a as [])),
    getProducts: (...a: unknown[]) => getProducts(...(a as [])),
  }),
}));
vi.mock('@/config/purchasePlatform', () => ({
  isIosNativeShell: () => isIosNativeShell(),
  isNonApplePaidEntitlement: () => false,
}));
vi.mock('@/services/authTokenService', () => ({ getAuthHeaders: async () => ({}) }));

import {
  loadIapProductsWithDiagnostics,
  describeIapLoadDiagnostics,
  looksLikeAppStoreConnectIssue,
} from '@/services/iap';
import { IAP_PRODUCT_MONTHLY, IAP_PRODUCT_ANNUAL } from '@/config/iapProducts';

const product = (id: string) => ({
  id,
  title: 'Mind Module Pro',
  description: '',
  displayPrice: '£34.99',
  price: 34.99,
  isEligibleForIntroOffer: true,
});

describe('loadIapProductsWithDiagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isIosNativeShell.mockReturnValue(true);
    isAvailable.mockResolvedValue({ available: true });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('reports complete when both products come back', async () => {
    getProducts.mockResolvedValue({
      products: [product(IAP_PRODUCT_MONTHLY), product(IAP_PRODUCT_ANNUAL)],
      storefront: 'GBR',
    });
    const { products, diagnostics } = await loadIapProductsWithDiagnostics();
    expect(products).toHaveLength(2);
    expect(diagnostics.outcome).toBe('complete');
    expect(diagnostics.missingIds).toEqual([]);
    expect(diagnostics.returnedCount).toBe(2);
    expect(diagnostics.introEligibility[IAP_PRODUCT_MONTHLY]).toBe(true);
    expect(looksLikeAppStoreConnectIssue(diagnostics)).toBe(false);
  });

  it('reports partial and names the missing id when one product is dropped', async () => {
    getProducts.mockResolvedValue({ products: [product(IAP_PRODUCT_ANNUAL)] });
    const { products, diagnostics } = await loadIapProductsWithDiagnostics();
    expect(products).toHaveLength(1);
    expect(diagnostics.outcome).toBe('partial');
    expect(diagnostics.missingIds).toEqual([IAP_PRODUCT_MONTHLY]);
    expect(looksLikeAppStoreConnectIssue(diagnostics)).toBe(true);
  });

  it('reports empty with both ids missing when StoreKit returns nothing', async () => {
    getProducts.mockResolvedValue({ products: [] });
    const { diagnostics } = await loadIapProductsWithDiagnostics();
    expect(diagnostics.outcome).toBe('empty');
    expect(diagnostics.missingIds).toEqual([IAP_PRODUCT_MONTHLY, IAP_PRODUCT_ANNUAL]);
    expect(looksLikeAppStoreConnectIssue(diagnostics)).toBe(true);
  });

  it('reports fetch_error with the native code when the bridge throws', async () => {
    getProducts.mockRejectedValue(Object.assign(new Error('Failed to load products'), { code: 'SKErrorDomain.0' }));
    const { products, diagnostics } = await loadIapProductsWithDiagnostics();
    expect(products).toEqual([]);
    expect(diagnostics.outcome).toBe('fetch_error');
    expect(diagnostics.errorCode).toBe('SKErrorDomain.0');
    expect(looksLikeAppStoreConnectIssue(diagnostics)).toBe(false);
  });

  it('reports store_unavailable without attempting a fetch', async () => {
    isAvailable.mockResolvedValue({ available: false });
    const { diagnostics } = await loadIapProductsWithDiagnostics();
    expect(diagnostics.outcome).toBe('store_unavailable');
    expect(getProducts).not.toHaveBeenCalled();
  });

  it('reports not_native outside the iOS shell', async () => {
    isIosNativeShell.mockReturnValue(false);
    const { diagnostics } = await loadIapProductsWithDiagnostics();
    expect(diagnostics.outcome).toBe('not_native');
    expect(getProducts).not.toHaveBeenCalled();
  });

  it('summary text names ids only and leaks no sensitive purchase data', async () => {
    getProducts.mockResolvedValue({ products: [] });
    const warn = vi.spyOn(console, 'warn');
    const { diagnostics } = await loadIapProductsWithDiagnostics();
    const summary = describeIapLoadDiagnostics(diagnostics);
    const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
    for (const forbidden of [
      'signedTransaction',
      'appAccountToken',
      'transactionId',
      'originalTransactionId',
      'receipt',
      'jws',
    ]) {
      expect(summary.toLowerCase()).not.toContain(forbidden.toLowerCase());
      expect(logged.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    expect(summary).toContain(IAP_PRODUCT_MONTHLY);
    expect(logged).toContain('outcome=empty');
  });
});