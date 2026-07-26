import { describe, it, expect } from 'vitest';
import {
  IAP_PRODUCT_MONTHLY,
  IAP_PRODUCT_ANNUAL,
  IAP_PRODUCT_IDS,
  DEFAULT_ANNUAL_PRODUCT_ID,
  DEFAULT_MONTHLY_PRODUCT_ID,
  getIapConfigStatus,
  isIapConfigured,
  planForProductId,
  planSortOrder,
} from '@/config/iapProducts';

describe('Apple IAP product configuration', () => {
  it('uses the confirmed product ids', () => {
    expect(IAP_PRODUCT_ANNUAL).toBe(DEFAULT_ANNUAL_PRODUCT_ID);
    expect(IAP_PRODUCT_MONTHLY).toBe(DEFAULT_MONTHLY_PRODUCT_ID);
    expect(DEFAULT_MONTHLY_PRODUCT_ID).toBe('com.mindmodule.pro.monthly');
    expect(DEFAULT_ANNUAL_PRODUCT_ID).toBe('com.mindmodule.pro.annual');
  });

  it('never reuses the annual id for monthly', () => {
    expect(IAP_PRODUCT_MONTHLY).not.toBe(IAP_PRODUCT_ANNUAL);
    expect(getIapConfigStatus().duplicateIds).toBe(false);
  });

  it('exposes exactly two ids, monthly first', () => {
    expect(IAP_PRODUCT_IDS).toEqual([IAP_PRODUCT_MONTHLY, IAP_PRODUCT_ANNUAL]);
    expect(planSortOrder(IAP_PRODUCT_MONTHLY)).toBeLessThan(planSortOrder(IAP_PRODUCT_ANNUAL));
  });

  it('maps ids back to plans', () => {
    expect(planForProductId(IAP_PRODUCT_MONTHLY)).toBe('monthly');
    expect(planForProductId(IAP_PRODUCT_ANNUAL)).toBe('annual');
    expect(planForProductId('com.other.thing')).toBeNull();
  });

  it('reports configured when ids are distinct and non-placeholder', () => {
    expect(isIapConfigured()).toBe(true);
    expect(getIapConfigStatus().missingIds).toBe(false);
  });

  it('has no unresolved product id conflict', () => {
    expect(new Set(IAP_PRODUCT_IDS).size).toBe(2);
    expect(getIapConfigStatus().ok).toBe(true);
    expect(getIapConfigStatus().reason).toBeUndefined();
  });
});
